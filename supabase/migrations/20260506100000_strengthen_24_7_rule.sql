-- Reforço da regra 11 do system_prompt da Ana após incidente de 06/05/2026.
--
-- Contexto: Pedro reportou que a Ana respondeu cliente dizendo que o
-- atendimento é "segunda a sexta, das 8h às 18h". A frase exata aparece
-- 11 vezes em fev-mar/2026 no histórico de messages. A regra 11 do
-- system_prompt já dizia "Ana atende 24/7" mas era persuasiva — agora
-- adicionamos exemplos negativos LITERAIS + frase canônica de resposta
-- e referenciamos o sistema de bloqueio determinístico (response-validator).
--
-- A camada B (sanitizer pré-envio) foi adicionada em paralelo em
-- supabase/functions/_shared/response-validator.ts — mesmo que o LLM
-- ignore a regra 11, a frase nunca sai pro cliente.
--
-- Aplicado em produção via Management API ANTES do commit (incidente
-- crítico). Esta migration documenta o registro histórico.
-- Idempotente: REPLACE só substitui se a string antiga ainda existir.

UPDATE agent_config
SET config_value = REPLACE(
  config_value,
  '11. ATENDIMENTO 24/7: A Budamix atende 24 horas por dia, 7 dias por semana. Nao existe horario de funcionamento, expediente ou mensagem de ausencia. Independente do dia ou horario, responda normalmente com o mesmo tom e qualidade. Nunca diga que esta fora do horario, que o atendimento esta fechado, ou que o cliente deve retornar depois.',
  '11. ATENDIMENTO 24/7 (CRITICO - regra inviolavel): A Budamix atende 24 horas por dia, 7 dias por semana. Nao existe horario de funcionamento, expediente, mensagem de ausencia, nem janela de atendimento.

PROIBIDO ABSOLUTAMENTE - NUNCA escreva nenhuma destas frases (o sistema rejeita e substitui automaticamente antes de chegar ao cliente, mas voce nunca deveria gera-las):
- "horario de atendimento" / "horario comercial" / "expediente"
- "segunda a sexta" ou qualquer dia da semana como restricao
- "das Xh as Yh" / "das 8h as 18h" / qualquer janela de horas
- "responderemos assim que possivel" / "retornaremos em breve" / "fora do horario"
- "atendimento esta fechado" / "estamos fechados" / "deixe sua mensagem"
- "retornar depois" / "tente novamente amanha" / "na proxima segunda"

Se o cliente perguntar sobre horario, disponibilidade, ou quando voce atende, responda EXATAMENTE: "Estou disponivel 24 horas por dia, 7 dias por semana. Como posso te ajudar?"

Independente do dia ou horario, responda normalmente com o mesmo tom e qualidade. Nao mencione horario sob nenhuma circunstancia.'
)
WHERE config_key = 'system_prompt';
