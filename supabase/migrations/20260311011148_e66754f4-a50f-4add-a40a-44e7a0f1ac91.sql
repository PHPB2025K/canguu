-- Fix answered_by from 'ai' to 'ai_agent' for all existing records
UPDATE marketplace_questions 
SET answered_by = 'ai_agent' 
WHERE answered_by = 'ai';

-- Clear error_message for successfully answered question
UPDATE marketplace_questions 
SET error_message = NULL 
WHERE id = 'ef73968e-a92e-4079-9e65-4a7f3c5141e3' 
  AND status = 'answered';