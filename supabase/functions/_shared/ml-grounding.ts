// Pure, account/listing-specific grounding. No semantic product matching.
export const ML_ACCOUNTS: Record<
  string,
  { label: string; brand: string; external: boolean }
> = {
  "532562281": { label: "ML1", brand: "Budamix", external: false },
  "3642409154": { label: "ML2", brand: "Kanoa", external: true },
  "2237203375": { label: "ML3", brand: "SPBROGLIO", external: true },
};
export function assertOwner(seller: string, item: any, question?: any) {
  if (!ML_ACCOUNTS[seller]) throw new Error("unknown_seller");
  if (!/^MLB\d+$/.test(item?.id || "") || String(item.seller_id) !== seller) {
    throw new Error("item_owner_mismatch");
  }
  if (
    question &&
    (String(question.seller_id) !== seller || question.item_id !== item.id)
  ) throw new Error("question_owner_mismatch");
}
export function sellerSku(item: any): string | null {
  const attr = (item.attributes || []).find((a: any) => a.id === "SELLER_SKU")
    ?.value_name;
  return String(attr || item.seller_custom_field || "").trim() || null;
}
export function stableItem(item: any) {
  const attrs = (as: any[]) =>
    (as || []).map((a) => ({ id: a.id, name: a.name, value: a.value_name }))
      .filter((a) => a.value);
  return {
    id: item.id,
    seller_id: String(item.seller_id),
    title: item.title,
    sku: sellerSku(item),
    condition: item.condition,
    attributes: attrs(item.attributes),
    variations: (item.variations || []).map((v: any) => ({
      id: String(v.id),
      sku: sellerSku(v),
      attributes: attrs([
        ...(v.attribute_combinations || []),
        ...(v.attributes || []),
      ]),
    })),
  };
}
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const terms = (s: string) =>
  norm(s).match(/[a-z0-9]{3,}/g)?.filter((x) =>
    ![
      "que",
      "para",
      "com",
      "uma",
      "tem",
      "esse",
      "essa",
      "qual",
      "por",
      "ola",
      "bom",
    ].includes(x)
  ) || [];
export function relevantLines(
  text: string,
  question: string,
  max = 1800,
): string {
  const q = terms(question);
  const lines = text.split(/\n+|(?<=[.!?])\s+/).map((x) => x.trim()).filter(
    Boolean,
  );
  const ranked = lines.map((line, i) => ({
    line,
    i,
    score: q.reduce((n, t) => n + Number(norm(line).includes(t)), 0),
  }));
  // Keep introduction and highest relevance, in source order. Never concatenate whole catalogs.
  const chosen = ranked.sort((a, b) => b.score - a.score || a.i - b.i).slice(
    0,
    8,
  ).sort((a, b) => a.i - b.i);
  let out = "";
  for (const { line } of chosen) {
    if (out.length + line.length > max) continue;
    out += line + "\n";
  }
  return out.trim();
}
export function buildGrounding(
  seller: string,
  item: any,
  cache: any,
  product: any,
  question: string,
  corrections = "",
) {
  assertOwner(seller, item);
  const stable = stableItem(item);
  const q = norm(question);
  const attributePattern = [
    /material|vidro|plastico|madeira|mdf|composicao/.test(q)
      ? "MATERIAL|COMPOSITION"
      : "",
    /medid|tamanho|dimens|altura|largura|comprimento|diametro|capacidade|volume|litro|\bml\b/
        .test(q)
      ? "HEIGHT|WIDTH|LENGTH|DIAMETER|VOLUME|CAPACITY"
      : "",
    /cor|color|vermelh|azul|verde|preto|branco|rosa|amarel/.test(q)
      ? "COLOR"
      : "",
    /forno|micro|lava|freezer|temperatura|tampa|veda|bpa/.test(q)
      ? "SAFE|AIRTIGHT|LID|BPA|TEMPERATURE"
      : "",
    /certific|inmetro|garantia|idade|ano/.test(q)
      ? "CERTIF|INMETRO|AGE|WARRANTY"
      : "",
    /quant|peca|par|vem|conteudo|personag/.test(q)
      ? "NUMBER|UNITS|CHARACTER|ACCESSOR"
      : "",
  ].filter(Boolean).join("|");
  const core =
    /^(BRAND|ITEM_CONDITION|SELLER_SKU|MODEL|UNITS_PER_PACK|UNITS_PER_PACKAGE)$/;
  const selected = stable.attributes.filter((a: any) =>
    core.test(a.id) ||
    (attributePattern && new RegExp(attributePattern).test(a.id))
  );
  // Packaging measurements are not product measurements. Retrieve only when asked.
  const attributes = selected.filter((a: any) =>
    !/PACKAGE|PACKING/.test(a.id) || /^UNITS_PER_/.test(a.id) ||
    /embalagem|pacote/.test(q)
  );
  const facts: Record<string, unknown> = {
    conta: ML_ACCOUNTS[seller].label,
    loja: ML_ACCOUNTS[seller].brand,
    anuncio: item.id,
    titulo: item.title,
    sku: stable.sku,
    condicao_do_anuncio: item.condition,
    atributos_do_anuncio: attributes,
    variacoes_do_anuncio: stable.variations,
    descricao_do_anuncio: relevantLines(cache.description || "", question),
    consulta_ao_vivo: {
      verificado_em: new Date().toISOString(),
      status: item.status,
      disponivel: item.status === "active" &&
        Number(item.available_quantity) > 0,
      // Prices are live but checkout discounts, installments and shipping are buyer dependent.
      preco_de_venda_consultado: item._sale_price?.amount,
      moeda: item.currency_id,
      variacoes: (item.variations || []).map((v: any) => ({
        id: String(v.id),
        atributos: v.attribute_combinations,
        disponivel: Number(v.available_quantity) > 0,
      })),
    },
  };
  // Existing catalog is shared by exact SKU or an unambiguous explicit listing map.
  // Never inherit other listing prices, stock, titles, kit quantities or all variations.
  if (product) {
    facts.ficha_compartilhada = {
      id: product.id,
      sku: product.sku,
      material: product.material,
      dimensoes: product.dimensions,
      descricao: relevantLines(
        [
          product.short_description,
          product.full_description,
          product.usage_suggestions,
        ].filter(Boolean).join("\n"),
        question,
        1400,
      ),
    };
  }
  if (corrections) facts.correcao_aprovada_deste_anuncio = corrections;
  if (/frete|prazo|entrega|chega|cep/i.test(question)) {
    facts.orientacao_do_canal =
      "Frete e prazo de entrega são calculados pelo Mercado Livre para o CEP do comprador no anúncio ou checkout. Não há prazo ou frete específico verificado neste contexto.";
  }
  if (/pix|pagamento|parcel|cart[aã]o|checkout/i.test(question)) {
    facts.orientacao_pagamento =
      "Condições e parcelas disponíveis são exibidas pelo próprio Mercado Livre ao finalizar a compra. Para Pix, copie o código apresentado no checkout e use o Pix Copia e Cola no aplicativo do seu banco.";
  }
  if (
    /pedido|reembolso|recebi|faltando|n[aã]o chegou|produto errado/i.test(
      question,
    )
  ) {
    facts.orientacao_pedido =
      "Para atendimento de pedido existente, acesse Minhas Compras e a aba de mensagens do pedido no Mercado Livre. Não solicite dados pessoais em uma pergunta pública.";
  }
  return JSON.stringify(facts);
}
export function validateGroundedAnswer(
  answer: string,
  context: string,
): string | null {
  if (/\[\[\s*ESCALAR/i.test(answer)) return "missing_verified_information";
  // Reject invented quantities/dimensions/temperature/price, even if the prose sounds plausible.
  const nums = (s: string) =>
    norm(s).match(/\d+(?:[.,]\d+)?/g)?.map((x) =>
      x.replace(",", ".").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")
        .replace(/^0+(?=\d)/, "")
    ) || [];
  const allowed = new Set(nums(context));
  if (nums(answer).some((n) => !allowed.has(n))) {
    return "unsupported_numeric_claim";
  }
  if (answer.length > 350 || answer.trim().length < 10) {
    return "invalid_answer_length";
  }
  return null;
}
