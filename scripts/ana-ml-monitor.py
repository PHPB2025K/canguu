#!/usr/bin/env python3
"""Replacement for the existing 10-minute alarm: all accounts, HTTP-aware.
No model calls and no marketplace writes. Uses the existing operational alert.
"""
import json, pathlib, sys, time
from datetime import datetime
import requests
sys.path.insert(0, '/root/scripts')
from gbsecrets import secret

SB = 'https://jpacmloqsfiebvagfomt.supabase.co'
LABELS = {'532562281': 'ML1', '3642409154': 'ML2', '2237203375': 'ML3'}
STATE = pathlib.Path('/root/.openclaw/ml-alarm-state.json')

def run():
    now = time.time(); issues = []; counts = {}
    key = secret('SUPABASE_SERVICE_KEY_CANGGU')
    try:
        health = json.loads(pathlib.Path('/root/.openclaw/state/ana-ml/health.json').read_text())
        age = now-datetime.fromisoformat(health['at'].replace('Z', '+00:00')).timestamp()
        if age > 600: issues.append(('bridge_stale', 'A conferência automática da ANA está sem sinal há mais de 10 minutos.'))
        for label, value in health.get('accounts', {}).items():
            if value.get('error'): issues.append(('bridge_'+label, label+': falha na integração de atendimento.'))
    except Exception: issues.append(('bridge_missing', 'O monitor da ANA não encontrou um resultado válido da conferência das contas.'))
    for seller, label in LABELS.items():
        try:
            r=requests.get(SB+'/rest/v1/marketplace_tokens',params={'platform':'eq.mercado_livre','seller_id':'eq.'+seller,'select':'access_token,status'},headers={'apikey':key,'Authorization':'Bearer '+key},timeout=15)
            r.raise_for_status(); rows=r.json()
            if len(rows)!=1 or rows[0]['status']!='active': raise RuntimeError('account_disconnected')
            token=rows[0]['access_token']
            r=requests.get('https://api.mercadolibre.com/questions/search',params={'seller_id':seller,'status':'UNANSWERED','sort_fields':'date_created','sort_types':'DESC','limit':50,'api_version':4},headers={'Authorization':'Bearer '+token},timeout=20)
            r.raise_for_status(); data=r.json();counts[label]=data['total']
            for q in data.get('questions',[]):
                if q.get('deleted_from_listing'):continue
                age=now-datetime.fromisoformat(q['date_created'].replace('Z','+00:00')).timestamp()
                if age>900: issues.append((seller+':'+str(q['id']),f"{label} · {q['item_id']} · pergunta {q['id']} sem resposta há {round(age/60)} min. Responder na conta correspondente do Mercado Livre ou pela Canggu."))
        except Exception: issues.append(('access_'+seller,label+': não foi possível verificar as perguntas. Isso não equivale a uma fila vazia.'))
    human_pending = 0
    try:
        r=requests.get(SB+'/rest/v1/marketplace_questions',params={'platform':'eq.mercado_livre','status':'eq.pending','select':'seller_id,platform_question_id,platform_item_id,ai_classification','limit':1000},headers={'apikey':key,'Authorization':'Bearer '+key},timeout=15)
        r.raise_for_status()
        for row in r.json():
            h=(row.get('ai_classification') or {}).get('handoff') or {}
            if not h.get('required') or h.get('resolved_at'):continue
            human_pending+=1
            age=now-datetime.fromisoformat(h['requested_at'].replace('Z','+00:00')).timestamp()
            label=LABELS.get(row['seller_id'],'ML')
            if h.get('ack_status')=='pending' and age>300:
                issues.append(('ack_'+row['platform_question_id'],f"{label} · {row['platform_item_id']} · acolhimento ainda não confirmado há {round(age/60)} min; novas tentativas continuam. Verificar acesso e anúncio na Canggu."))
            elif age>900:
                issues.append(('human_'+row['platform_question_id'],f"{label} · {row['platform_item_id']} · atendimento humano pendente há {round(age/60)} min. A resposta pública não resolve o caso interno; confirmar dados e registrar a resolução na Canggu."))
    except Exception:issues.append(('human_queue_check','Não foi possível verificar a fila humana da ANA na Canggu.'))
    try: previous=json.loads(STATE.read_text())
    except Exception: previous={}
    previous={k:v for k,v in previous.items() if isinstance(v,(int,float)) and now-v<86400}
    fresh=[(k,msg) for k,msg in issues if now-previous.get(k,0)>21600]
    if fresh:
        bot=json.loads(pathlib.Path('/root/.openclaw/openclaw.json').read_text())['channels']['telegram']['botToken']
        r=requests.post('https://api.telegram.org/bot'+bot+'/sendMessage',json={'chat_id':'-1003730816228','text':'⚠️ Atendimento ANA — Mercado Livre\n\n'+'\n'.join(msg for _,msg in fresh[:12]),'disable_web_page_preview':True},timeout=15)
        if r.ok:
            for k,_ in fresh[:12]:previous[k]=now
    tmp=STATE.with_suffix('.tmp');tmp.write_text(json.dumps(previous));tmp.chmod(0o600);tmp.replace(STATE)
    print(json.dumps({'at':now,'unanswered':counts,'human_pending':human_pending,'issues':len(issues),'new_alerts':min(len(fresh),12)}),flush=True)

if __name__=='__main__':run()
