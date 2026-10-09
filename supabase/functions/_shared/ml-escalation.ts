import { ML_ACCOUNTS } from "./ml-grounding.ts";

// No model call and no messaging API. An order is never inferred from an SKU.
type Reader = (path: string) => Promise<any>;
export async function escalationContext(row: any, read: Reader) {
  const subject = String(row.question_text || "").replace(/\s+/g, " ").trim()
    .slice(0, 180);
  const base = { account_label: ML_ACCOUNTS[row.seller_id]?.label, subject };
  const result = (status: string, id: string | null = null) => ({
    ...base,
    order: { status, id, checked_at: new Date().toISOString() },
  });
  const explicit = row.question_text?.match(
    /(?:pedido|compra|venda)\s*(?:(?:n[uú]mero|n[º°o.]|n[úu]m\.?)\s*)?[:#-]?\s*(\d{8,20})\b/i,
  )?.[1];
  const postSale =
    /\bcomprei\b|\brecebi\b|meu pedido|minha compra|n[aã]o chegou|veio (?:com|sem|quebrad)|chegou (?:com|sem|quebrad)|reembolso/i
      .test(row.question_text || "");
  if (!explicit && !postSale) return result("not_linked");
  try {
    const q = await read(
      `/questions/${row.platform_question_id}?api_version=4`,
    );
    if (
      String(q.seller_id) !== row.seller_id ||
      q.item_id !== row.platform_item_id
    ) {
      return result("not_identified");
    }
    const buyer = q.from?.id;
    if (!buyer) return result("not_identified");
    const matches = (o: any) =>
      String(o.seller?.id) === row.seller_id &&
      String(o.buyer?.id) === String(buyer) &&
      Number.isFinite(Date.parse(q.date_created)) &&
      Date.parse(o.date_created) <= Date.parse(q.date_created) &&
      o.order_items?.some((i: any) => i.item?.id === row.platform_item_id);
    if (explicit) {
      const order = await read(`/orders/${explicit}`);
      return String(order.id) === explicit && matches(order)
        ? result("confirmed", explicit)
        : result("not_identified");
    }
    const params = new URLSearchParams({
      seller: row.seller_id,
      buyer: String(buyer),
      "order.date_created.to": q.date_created,
      sort: "date_desc",
      limit: "50",
    });
    const orders = await read(`/orders/search?${params}`);
    // A partial list cannot establish a unique match. Keep the task actionable.
    if (
      !Array.isArray(orders.results) || typeof orders.paging?.total !== "number"
    ) {
      return result("lookup_failed");
    }
    if (orders.paging.total > orders.results.length) return result("ambiguous");
    const ids = [
      ...new Set<string>(
        orders.results.filter(matches).map((o: any) => String(o.id)),
      ),
    ];
    // Even a single buyer/item match is a candidate, not proof of what they meant.
    if (ids.length === 1) return result("candidate", ids[0]);
    return result(ids.length > 1 ? "ambiguous" : "not_identified");
  } catch {
    return result("lookup_failed");
  }
}
