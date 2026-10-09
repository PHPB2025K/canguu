-- Additive, isolated from other channels. No existing catalog/answers are rewritten.
begin;
create table if not exists public.ml_listing_knowledge (
  seller_id text not null,
  item_id text not null,
  sku text,
  product_id uuid references public.products(id) on delete set null,
  match_method text not null default 'listing_only',
  stable_data jsonb not null default '{}',
  description text not null default '',
  source_updated_at text,
  content_hash text not null,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (seller_id, item_id)
);
alter table public.ml_listing_knowledge enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='ml_listing_knowledge' and policyname='ml_knowledge_read') then
    create policy ml_knowledge_read on public.ml_listing_knowledge for select to authenticated using (true);
  end if;
end $$;
grant select on public.ml_listing_knowledge to authenticated;
grant all on public.ml_listing_knowledge to service_role;

-- Durable claims avoid duplicate model calls and protect rotated ML1 refresh tokens.
create table if not exists public.ml_work_leases (
  work_key text primary key,
  state text not null check (state in ('working','retry','done','human')),
  attempts integer not null default 1,
  lease_until timestamptz not null,
  retry_after timestamptz,
  result jsonb,
  updated_at timestamptz not null default now()
);
alter table public.ml_work_leases enable row level security;
grant all on public.ml_work_leases to service_role;
create or replace function public.claim_ml_work(p_key text, p_ttl integer default 180)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed text;
begin
  insert into public.ml_work_leases(work_key,state,lease_until)
  values(p_key,'working',now()+make_interval(secs=>greatest(30,least(p_ttl,300))))
  on conflict(work_key) do update
    set state='working', attempts=ml_work_leases.attempts+1,
        lease_until=excluded.lease_until, updated_at=now()
    where (ml_work_leases.state='working' and ml_work_leases.lease_until<now())
       or (ml_work_leases.state='retry' and coalesce(ml_work_leases.retry_after,now())<=now())
  returning work_key into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_ml_work(text,integer) from public,anon,authenticated;
grant execute on function public.claim_ml_work(text,integer) to service_role;
commit;
