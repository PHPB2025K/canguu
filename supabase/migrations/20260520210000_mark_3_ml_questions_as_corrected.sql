-- Mark 3 ML questions as corrected in the Canggu admin panel.
--
-- Context (2026-05-20):
-- After applying rule 17 (sceptical-but-gentle) and seeding 3 reference
-- corrections in 20260520200000, mark the originating ML questions with
-- feedback='bad' so the Canggu admin panel surfaces them as "Corrigida"
-- (the panel relies on this flag + the response_corrections row to render
-- the 👎 badge and the recommended response — see useMarketplaces.ts
-- useSubmitCorrection mutation).
--
-- Idempotent: only updates rows where feedback is still NULL.

UPDATE marketplace_questions
SET feedback = 'bad', feedback_at = NOW()
WHERE id IN (
  '1bf05326-64bd-4467-8d24-255949b5c496', -- Q13585319605: forno/freezer/micro-ondas
  '707be927-e3ff-4072-9be7-c0c0dba30b08', -- Q13576807722: volume maior
  'f655cace-534a-401f-9fba-287f150eb75d'  -- Q13583496841: medidas/divergência vídeo
)
AND feedback IS DISTINCT FROM 'bad';
