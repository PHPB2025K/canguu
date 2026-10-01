export type InstagramWebhookWork = {
  events: Record<string, unknown>[];
  deletions: string[];
  comments: Record<string, unknown>[];
  droppedDirectEvents: number;
};

export type InstagramDirectState = "enabled" | "disabled" | "unavailable";

export function isInstagramDirectEnabled(value: string | null | undefined): boolean {
  return value === "true";
}

export function planDirectState(state: InstagramDirectState): {
  ingestPrivateEvents: boolean;
  allowPrivateEgress: boolean;
} {
  return {
    ingestPrivateEvents: state !== "disabled",
    allowPrivateEgress: state === "enabled",
  };
}

export function canSendInstagramPrivateMessage(directEnabled: boolean): boolean {
  return directEnabled;
}

export function shouldProceedWithPrivateEgress(
  acceptedEnabled: boolean,
  freshEnabled: boolean,
): boolean {
  return acceptedEnabled && freshEnabled;
}

export async function attemptPrivateEgress(
  acceptedEnabled: boolean,
  readFreshEnabled: () => Promise<boolean>,
  egress: () => Promise<boolean>,
): Promise<boolean> {
  let freshEnabled = false;
  try {
    freshEnabled = await readFreshEnabled();
  } catch {
    return false;
  }
  if (!shouldProceedWithPrivateEgress(acceptedEnabled, freshEnabled)) return false;
  return await egress();
}

export function publicCommentChannelNote(directEnabled: boolean): string {
  if (directEnabled) {
    return "## Canal\nIsto e um COMENTARIO PUBLICO num post/anuncio do Instagram (@budamix.br), visivel a qualquer pessoa. A resposta completa vai por DM (direct); o reply publico e so um aceno curto. Seja cordial e util. NUNCA peca dado pessoal em publico, NUNCA sugira reclamacao. Para link de compra, prefira o site da Budamix.";
  }
  return "## Canal\nIsto e um COMENTARIO PUBLICO num post/anuncio do Instagram (@budamix.br), visivel a qualquer pessoa. O Direct esta desativado: responda aqui de forma curta, publica e autossuficiente. NUNCA prometa resposta no direct/DM, NUNCA peca dado pessoal em publico e NUNCA sugira reclamacao. Para link de compra, prefira o site da Budamix.";
}

export function publicCommentDisabledReply(): string {
  return "Oi! Nossa equipe pode te orientar por aqui.";
}

export function publicCommentPublicOnlySystemPrompt(): string {
  return "Você responde somente a um comentário público da Budamix. Responda em português do Brasil, em uma frase curta, objetiva e autossuficiente. Não peça número do pedido, foto, telefone, WhatsApp, endereço nem qualquer dado pessoal. Não mencione direct, DM, mensagem privada, transferência ou atendimento privado. Não faça escalonamento. Se não houver informação segura para responder, diga apenas que a equipe pode orientar por ali. Não use emoji. "
    + "PROIBIDO CITAR MARKETPLACE: nunca escreva Mercado Livre, Amazon, Shopee, marketplace, nem diga que o produto está à venda em outro lugar — o comentário está num anúncio pago da Budamix e mandar a pessoa para outro canal joga fora o dinheiro do anúncio. "
    + "PROIBIDO DIZER PREÇO: nunca escreva valor, preço, R$, quantia, desconto ou parcelamento em comentário público — preço muda e comentário fica no ar para sempre. Quando perguntarem quanto custa, responda EXATAMENTE: \"O valor atualizado está no site: budamix.com.br\". Nada além disso.";
}

function sanitizePublicReply(reply: string): string {
  const normalized = reply.split("\\\\").join(" ").replace(/\s+/g, " ").trim();
  if (/\bdirect\b|\bdm\b|mensage(?:m|ns)\s+privad|(?:no|em)\s+privado|te\s+(?:envio|mando|chamo|respondo)\b|n[uú]mero do pedido|n[ºo°]\s*do pedido|\bfoto\b|\btelefone\b|\bwhats(?:app)?\b|\bendere[cç]o\b|dados pessoais|me chama|nos chama/i.test(normalized)) {
    return "Nossa equipe pode te orientar por aqui.";
  }
  // Rede de segurança: citar marketplace num comentário de anúncio pago manda o
  // cliente comprar em outro canal — é pagar pelo clique e entregar a venda fora.
  if (/mercado\s*livre|\bmeli\b|\bamazon\b|\bshopee\b|\bmagalu\b|marketplace|americanas|aliexpress/i.test(normalized)) {
    return "Nossa equipe pode te orientar por aqui.";
  }
  // Preço em comentário público não pode: o comentário fica no ar para sempre e o
  // preço muda. Quem perguntar valor vai para o site, onde o número está certo.
  if (/R\$|\breais\b|\bpre[cç]o\b|\d+[.,]\d{2}\b/i.test(normalized)) {
    return "O valor atualizado está no site: budamix.com.br";
  }
  return normalized.slice(0, 200);
}

export function publicCommentAcknowledgement(input: {
  escalated: boolean;
  privateReplySent: boolean;
  directEnabled: boolean;
  reply: string;
}): string {
  if (input.directEnabled && input.escalated) {
    return "Oi! Já pedi pra nossa equipe te responder no direct.";
  }
  if (input.directEnabled && input.privateReplySent) {
    return "Oi! Te respondi no direct com todos os detalhes.";
  }
  if (input.escalated) {
    return "Oi! Já pedi para nossa equipe verificar e te orientar por aqui.";
  }
  return "Oi! " + sanitizePublicReply(input.reply);
}

export function planInstagramWebhookWork(
  body: Record<string, unknown>,
  directEnabled: boolean,
  businessId: string,
): InstagramWebhookWork {
  const events: Record<string, unknown>[] = [];
  const deletions: string[] = [];
  const comments: Record<string, unknown>[] = [];
  let droppedDirectEvents = 0;

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const rawEntry of entries) {
    const entry = (rawEntry && typeof rawEntry === "object")
      ? rawEntry as Record<string, unknown>
      : {};
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];

    for (const rawEvent of messaging) {
      if (!rawEvent || typeof rawEvent !== "object") continue;
      const event = rawEvent as Record<string, unknown>;
      const message = (event.message && typeof event.message === "object")
        ? event.message as Record<string, unknown>
        : null;
      if (!message) continue;

      const sender = (event.sender && typeof event.sender === "object")
        ? event.sender as Record<string, unknown>
        : null;
      if (message.is_echo || (sender?.id && sender.id === businessId)) continue;

      if (message.is_deleted) {
        if (typeof message.mid === "string" && message.mid) deletions.push(message.mid);
        continue;
      }

      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      const hasText = typeof message.text === "string" && message.text.trim().length > 0;
      if (!hasText && attachments.length === 0) continue;

      if (directEnabled) events.push(event);
      else droppedDirectEvents += 1;
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const rawChange of changes) {
      if (!rawChange || typeof rawChange !== "object") continue;
      const change = rawChange as Record<string, unknown>;
      if (change.field === "comments" && change.value && typeof change.value === "object") {
        comments.push(change.value as Record<string, unknown>);
      }
    }
  }

  return { events, deletions, comments, droppedDirectEvents };
}
