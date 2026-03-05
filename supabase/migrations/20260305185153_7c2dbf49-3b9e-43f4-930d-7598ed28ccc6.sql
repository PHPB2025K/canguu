UPDATE public.agent_config
SET config_value = regexp_replace(
  config_value,
  E'No início de TODA conversa com o cliente, antes de responder qualquer\npergunta sobre preço, você DEVE perguntar em qual plataforma o cliente\nestá comprando ou pretende comprar[\\s\\S]*$',
  '',
  's'
),
updated_at = now()
WHERE config_key = 'system_prompt';