-- Reuse the existing human queue. WhatsApp conversations retain their semantics.
BEGIN;
ALTER TABLE public.escalations ALTER COLUMN conversation_id DROP NOT NULL;
ALTER TABLE public.escalations
  ADD COLUMN marketplace_question_id uuid REFERENCES public.marketplace_questions(id),
  ADD COLUMN marketplace_context jsonb;
ALTER TABLE public.escalations ADD CONSTRAINT escalations_one_source
  CHECK (num_nonnulls(conversation_id, marketplace_question_id) = 1);
ALTER TABLE public.escalations ADD CONSTRAINT escalations_marketplace_question_unique
  UNIQUE (marketplace_question_id);

-- ML records must be created/resolved through the authenticated service path.
-- Existing authenticated access for conversation escalations is unchanged.
DROP POLICY auth_escalations_all ON public.escalations;
CREATE POLICY auth_escalations_read ON public.escalations FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_escalations_conversation_insert ON public.escalations FOR INSERT TO authenticated
  WITH CHECK (marketplace_question_id IS NULL);
CREATE POLICY auth_escalations_conversation_update ON public.escalations FOR UPDATE TO authenticated
  USING (marketplace_question_id IS NULL) WITH CHECK (marketplace_question_id IS NULL);
CREATE POLICY auth_escalations_conversation_delete ON public.escalations FOR DELETE TO authenticated
  USING (marketplace_question_id IS NULL);

CREATE FUNCTION public.ensure_ml_escalation(p_question_id uuid, p_context jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.marketplace_questions%ROWTYPE; eid uuid;
BEGIN
  SELECT * INTO q FROM public.marketplace_questions WHERE id=p_question_id FOR UPDATE;
  IF NOT FOUND OR q.platform <> 'mercado_livre' OR
    q.seller_id NOT IN ('532562281','3642409154','2237203375') OR
    q.ai_classification->'handoff'->>'required' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'handoff_not_found';
  END IF;
  IF q.ai_classification->'handoff'->>'resolved_at' IS NOT NULL THEN
    RAISE EXCEPTION 'handoff_already_resolved';
  END IF;
  INSERT INTO public.escalations (marketplace_question_id, marketplace_context, reason, urgency, status)
  VALUES (q.id, p_context, left(coalesce(q.ai_classification->'handoff'->>'reason','Revisão humana necessária'),255), 'medium', 'pending')
  ON CONFLICT (marketplace_question_id) DO UPDATE SET marketplace_context=excluded.marketplace_context
  RETURNING id INTO eid;
  UPDATE public.marketplace_questions SET ai_classification=jsonb_set(ai_classification, '{handoff}',
    (ai_classification->'handoff') || jsonb_build_object('escalation_id',eid,'escalated_at',now())) WHERE id=q.id;
  RETURN eid;
END $$;

CREATE FUNCTION public.resolve_ml_handoff(p_question_id uuid, p_note text, p_user text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.marketplace_questions%ROWTYPE; h jsonb;
BEGIN
  SELECT * INTO q FROM public.marketplace_questions WHERE id=p_question_id FOR UPDATE;
  h := q.ai_classification->'handoff';
  IF NOT FOUND OR q.platform <> 'mercado_livre' OR h->>'required' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'handoff_not_found';
  END IF;
  IF length(trim(coalesce(p_note,''))) NOT BETWEEN 20 AND 2000 THEN
    RAISE EXCEPTION 'resolution_note_required_20_to_2000_chars';
  END IF;
  IF h->>'resolved_at' IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'state','already_resolved','public_message_sent',false);
  END IF;
  IF coalesce(h->>'ack_status','') NOT IN ('verified','external_answer','unavailable') THEN
    RAISE EXCEPTION 'acknowledgement_not_confirmed';
  END IF;
  UPDATE public.escalations SET status='resolved',notes=trim(p_note),resolved_by=p_user,resolved_at=now()
    WHERE marketplace_question_id=q.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'escalation_not_registered'; END IF;
  UPDATE public.marketplace_questions SET
    status=CASE WHEN h->>'ack_status'='unavailable' THEN 'skipped' ELSE 'answered' END,
    error_message=NULL,
    ai_classification=jsonb_set(ai_classification,'{handoff}',h || jsonb_build_object(
      'resolved_at',now(),'resolved_by',p_user,'resolution_note',trim(p_note))) WHERE id=q.id;
  RETURN jsonb_build_object('ok',true,'state','human_resolved','public_message_sent',false);
END $$;
REVOKE ALL ON FUNCTION public.ensure_ml_escalation(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_ml_handoff(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_ml_escalation(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_ml_handoff(uuid,text,text) TO service_role;
COMMIT;
