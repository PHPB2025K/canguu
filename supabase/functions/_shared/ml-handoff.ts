// ML allows one immutable public answer per question. Acknowledgement is delivery,
// not resolution. Keep the human case open separately from the remote answer.
export function handoffAcknowledgement(question: string): string {
  if (
    /recebi|recebido|quebrad|defeito|reembolso|meu pedido|minha compra|n[aã]o chegou|faltando/i
      .test(question)
  ) {
    return "Olá! Sinto muito pelo ocorrido. Sua solicitação precisa da análise da nossa equipe. Acompanhe o atendimento pela aba de mensagens do pedido, em Minhas Compras no Mercado Livre. Assim podemos tratar seu caso com privacidade.";
  }
  return "Olá! Obrigada pela sua pergunta. Para te orientar com segurança, esse detalhe precisa da confirmação da nossa equipe. Sua dúvida ficará em acompanhamento. Para consultar a confirmação, envie uma nova pergunta neste anúncio. Obrigada pela compreensão!";
}

export function handoffMetadata(
  classification: any,
  question: string,
  reason: string,
) {
  const prior = classification?.handoff;
  return {
    ...(classification || {}),
    handoff: prior?.required ? prior : {
      required: true,
      reason,
      requested_at: new Date().toISOString(),
      ack_status: "pending",
      ack_text: handoffAcknowledgement(question),
      ack_attempts: 0,
    },
  };
}

export function unresolvedHandoff(row: any): boolean {
  const handoff = row?.ai_classification?.handoff;
  return Boolean(handoff?.required && !handoff.resolved_at);
}
