import type { EscalationWithDetails } from "@/types/database";

export function mlHandoff(escalation: EscalationWithDetails) {
  return (escalation.marketplace_questions?.ai_classification as any)?.handoff;
}

export function MLDetails({ escalation }: { escalation: EscalationWithDetails }) {
  const q = escalation.marketplace_questions;
  const context = escalation.marketplace_context;
  if (!escalation.marketplace_question_id) return null;
  const order = context?.order;
  const labels: Record<string, string> = {
    not_linked: "Sem pedido vinculado à pergunta",
    not_identified: "Pedido não identificado — conferir com o cliente",
    ambiguous: "Vínculo não confirmado — conferir o pedido correto",
    lookup_failed: "Consulta ao pedido indisponível — conferir manualmente",
  };
  const ack = mlHandoff(escalation)?.ack_status;
  return <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm space-y-2">
    <p className="font-semibold">{context?.account_label || "Mercado Livre"}</p>
    <p><strong>Assunto:</strong> {context?.subject || q?.question_text}</p>
    <p><strong>Pedido:</strong> {order?.id && ["confirmed", "candidate"].includes(order.status)
      ? <>{order.id}{order.status === "candidate" ? " — compra localizada; vínculo com a pergunta a confirmar" : " — confirmado"}</>
      : labels[order?.status || ""] || "Pedido não identificado"}</p>
    <p><strong>Anúncio:</strong> {q?.platform_item_id} · {q?.product_name}</p>
    <p><strong>Pergunta #{q?.platform_question_id}:</strong> {q?.question_text}</p>
    <p><strong>Acolhimento:</strong> {ack === "verified" ? "Enviado e confirmado no Mercado Livre"
      : ack === "external_answer" ? "Pergunta já respondida no Mercado Livre"
      : ack === "unavailable" ? "ML não permite mais responder esta pergunta — verificar o caso"
      : "Ainda não confirmado; novas tentativas continuam"}</p>
    {q?.answer_text && <p className="text-muted-foreground">{q.answer_text}</p>}
    <p className="text-xs text-muted-foreground">A equipe assume a continuidade. Resolver registra o tratamento interno e não envia uma mensagem ao cliente.</p>
  </div>;
}
