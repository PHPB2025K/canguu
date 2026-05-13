-- Switch Ana's response generator model from Sonnet 4.6 to Opus 4.6.
--
-- Context (2026-05-13):
-- Ana stopped responding on WhatsApp around 2026-05-08 16:09 BRT. Five days
-- of complete silence: 0 messages with tokens_used > 0 across 11/05, 12/05,
-- 13/05. The Anthropic API key in use was rotated today (new dedicated key
-- "ANTHROPIC - API KEY ANA" issued + stored in 1Password OpenClaw vault and
-- pushed to Supabase Edge secret ANTHROPIC_API_KEY via Management API).
--
-- Pedro mandated the upgrade to Opus 4.6 as part of the recovery — higher
-- reasoning capacity for the WhatsApp customer pipeline going forward.
--
-- Applied directly via SQL (UPDATE) on 2026-05-13 ~17:59 BRT; this migration
-- is the rastreável record of that change, matching the same pattern used in
-- 20260506100000_strengthen_24_7_rule.sql.

INSERT INTO agent_config (config_key, config_value, description, updated_at)
VALUES ('model', 'claude-opus-4-6', 'Anthropic model for response-generator', NOW())
ON CONFLICT (config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      updated_at = NOW();
