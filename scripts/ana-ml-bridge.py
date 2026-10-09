#!/usr/bin/env python3
"""ANA's bounded ML connector. Tokens are read, never refreshed or logged here.

Existing sync-ml-orders owns ML2/3 refresh tokens. This connector shares only a
short-lived access token through the protected Canggu endpoint, then reconciles
unanswered questions. Catalog refresh is incremental and uses no model tokens.
"""
import argparse, concurrent.futures, fcntl, json, os, pathlib, sys, time
import requests

ACCOUNTS = {'532562281': ('ML1', ''), '3642409154': ('ML2', '-kanoa'), '2237203375': ('ML3', '-spbroglio')}
BASE = 'https://jpacmloqsfiebvagfomt.supabase.co'
STATE = pathlib.Path('/root/.openclaw/state/ana-ml')

def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--catalog', action='store_true')
    parser.add_argument('--connect-only', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, '/root/scripts')
    from gbsecrets import secret
    key = secret('SUPABASE_SERVICE_KEY_CANGGU')
    headers = {'Authorization': 'Bearer ' + key, 'apikey': key}
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = open(STATE / ('catalog.lock' if args.catalog else 'poll.lock'), 'w')
    try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: return
    def call(body):
        function = os.environ.get('ANA_ML_FUNCTION', 'ml-webhook')
        if function not in ('ml-webhook', 'ml-webhook-candidate'): raise RuntimeError('invalid_function')
        r = requests.post(BASE + '/functions/v1/' + function, headers=headers, json=body, timeout=140)
        if not r.ok:
            try: reason = str(r.json().get('error', ''))[:120]
            except ValueError: reason = ''
            raise RuntimeError('canggu_http_' + str(r.status_code) + ':' + reason)
        data = r.json()
        if data.get('error'): raise RuntimeError(str(data['error'])[:120])
        if data.get('ok') is not True: raise RuntimeError('unconfirmed_action_response')
        return data
    def mlget(path, token):
        for attempt in range(3):
            r = requests.get('https://api.mercadolibre.com' + path, headers={'Authorization': 'Bearer ' + token}, timeout=25)
            if r.status_code not in (429, 500, 502, 503): break
            time.sleep(2 ** attempt)
        if not r.ok: raise RuntimeError('ml_http_' + str(r.status_code))
        return r.json()
    summary = {'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'accounts': {}}
    for seller, (label, suffix) in ACCOUNTS.items():
        try:
            f = pathlib.Path('/root/.openclaw/.ml-tokens' + suffix + '.json')
            data = json.loads(f.read_text()); token = data['access_token']
            if seller != '532562281':
                expiry = f.stat().st_mtime + min(int(data.get('expires_in', 21600)), 21600)
                if expiry <= time.time(): raise RuntimeError('source_token_expired_owner_sync_required')
                call({'action': 'sync_account', 'seller_id': seller, 'access_token': token,
                      'expires_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(expiry))})
            if not args.catalog:
                result = {'connected': True} if args.connect_only else call({'action': 'reconcile', 'seller_id': seller})
                summary['accounts'][label] = result
                continue
            statefile = STATE / ('catalog-' + seller + '.json')
            old = json.loads(statefile.read_text()) if statefile.exists() else {}
            ids = []; offset = 0
            while True:
                page = mlget(f'/users/{seller}/items/search?status=active&limit=100&offset={offset}', token)
                ids.extend(page.get('results', [])); offset += 100
                if offset >= page.get('paging', {}).get('total', 0): break
                if offset >= 1000: raise RuntimeError('catalog_exceeds_offset_limit_use_scan')
            changes = []
            for i in range(0, len(ids), 20):
                items = mlget('/items?ids=' + ','.join(ids[i:i+20]) + '&attributes=id,seller_id,last_updated', token)
                for row in items:
                    item = row.get('body', {})
                    if row.get('code') != 200 or str(item.get('seller_id')) != seller: raise RuntimeError('catalog_owner_or_fetch_failure')
                    # Force a daily check even without item timestamps (description changes).
                    prior = old.get(item['id'], {})
                    if prior.get('version') != item.get('last_updated') or time.time()-prior.get('checked', 0) > 86400:
                        changes.append(item)
            def update(item):
                try: return item, call({'action': 'sync_listing', 'seller_id': seller, 'item_id': item['id']})
                except Exception as e: return item, {'error': str(e)[:140]}
            changed = 0; errors = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                for item, result in pool.map(update, changes):
                    if result.get('error'):
                        errors.append({'item_id': item['id'], 'error': result['error']}); continue
                    old[item['id']] = {'version': item.get('last_updated'), 'checked': time.time(), 'product_id': result.get('product_id'), 'sku': result.get('sku'), 'match_method': result.get('match_method')}
                    changed += int(result.get('changed', False))
            temp = statefile.with_suffix('.tmp'); temp.write_text(json.dumps(old)); temp.chmod(0o600); temp.replace(statefile)
            summary['accounts'][label] = {'active': len(ids), 'checked': len(changes), 'changed': changed, 'shared_product': sum(bool(old.get(x, {}).get('product_id')) for x in ids), 'errors': errors}
            if errors: summary['accounts'][label]['error'] = 'catalog_items_failed'
        except Exception as e:
            # Only bounded error codes; no tokens, request headers or buyer text.
            summary['accounts'][label] = {'error': str(e).split('\n')[0][:140]}
    target = STATE / ('catalog-health.json' if args.catalog else 'health.json')
    temp = target.with_suffix('.tmp'); temp.write_text(json.dumps(summary)); temp.chmod(0o600); temp.replace(target)
    print(json.dumps(summary), flush=True)
    if any('error' in x for x in summary['accounts'].values()): raise SystemExit(1)

if __name__ == '__main__': run()
