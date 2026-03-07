
CREATE OR REPLACE VIEW public.marketplace_token_status
WITH (security_invoker = on) AS
SELECT
  id,
  platform,
  seller_id,
  seller_nickname,
  app_id,
  status,
  token_expires_at,
  CASE
    WHEN access_token IS NOT NULL AND (token_expires_at IS NULL OR token_expires_at > now()) THEN 'connected'
    WHEN access_token IS NOT NULL AND token_expires_at <= now() THEN 'expired'
    ELSE 'disconnected'
  END AS connection_status,
  created_at,
  updated_at
FROM public.marketplace_tokens;
