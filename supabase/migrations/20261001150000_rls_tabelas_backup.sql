-- Auditoria da Ana (01/10/2026), aprovado pelo Pedro: as 8 tabelas de backup estavam
-- sem RLS, legiveis/editaveis pela chave publica (anon). Sem policy = so service_role.
alter table public.products_backup_20260404 enable row level security;
alter table public.conversations_dup_backup_20260706 enable row level security;
alter table public.messages_convmap_backup_20260706 enable row level security;
alter table public.rc_scope_backup_20260706 enable row level security;
alter table public.zz_bak_products_imb501_20260815 enable row level security;
alter table public.zz_bak_policies_20260815 enable row level security;
alter table public.zz_bak_faq_20260815 enable row level security;
alter table public.zz_bak_policies_20260831 enable row level security;
