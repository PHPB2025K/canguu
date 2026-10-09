import assert from "node:assert/strict";
import { escalationContext } from "./ml-escalation.ts";
import { ML_ACCOUNTS } from "./ml-grounding.ts";

for (const seller of Object.keys(ML_ACCOUNTS)) {
  const row = {
    seller_id: seller,
    platform_question_id: "12345",
    platform_item_id: "MLB100",
    question_text: "Meu pedido 2000012345678 veio com defeito",
  };
  const question = {
    seller_id: Number(seller),
    item_id: "MLB100",
    from: { id: 777 },
    date_created: "2026-10-09T12:00:00Z",
  };
  const order = {
    id: 2000012345678,
    seller: { id: Number(seller) },
    buyer: { id: 777 },
    date_created: "2026-10-08T12:00:00Z",
    order_items: [{ item: { id: "MLB100" } }],
  };
  Deno.test(`${ML_ACCOUNTS[seller].label}: order number verified against seller, buyer, listing and date`, async () => {
    const paths: string[] = [];
    const r = await escalationContext(row, async (p) => {
      paths.push(p);
      return p.startsWith("/questions/") ? question : order;
    });
    assert.equal(r.order.status, "confirmed");
    assert.equal(r.order.id, "2000012345678");
    assert.equal(r.account_label, ML_ACCOUNTS[seller].label);
    assert.deepEqual(paths, [
      "/questions/12345?api_version=4",
      "/orders/2000012345678",
    ]);
    for (
      const patch of [
        { seller: { id: 1 } },
        { buyer: { id: 1 } },
        { order_items: [{ item: { id: "MLB999" } }] },
        { id: 999 },
        { date_created: "2026-10-10T12:00:00Z" },
      ]
    ) {
      const bad = await escalationContext(
        row,
        async (p) =>
          p.startsWith("/questions/") ? question : { ...order, ...patch },
      );
      assert.equal(bad.order.id, null);
      assert.equal(bad.order.status, "not_identified");
    }
  });
  Deno.test(`${ML_ACCOUNTS[seller].label}: buyer search marks a single result as candidate, multiple/partial as ambiguous`, async () => {
    for (
      const [results, total, status] of [
        [[order], 1, "candidate"],
        [[order, { ...order, id: 2000012345679 }], 2, "ambiguous"],
        [[order], 80, "ambiguous"],
        [[], 0, "not_identified"],
      ] as const
    ) {
      const r = await escalationContext({
        ...row,
        question_text: "Minha compra veio com defeito",
      }, async (p) => {
        if (p.startsWith("/questions/")) return question;
        const url = new URL("https://test" + p);
        assert.equal(url.pathname, "/orders/search");
        assert.equal(url.searchParams.get("seller"), seller);
        assert.equal(url.searchParams.get("buyer"), "777");
        return { results, paging: { total } };
      });
      assert.equal(r.order.status, status);
      assert.equal(
        r.order.id,
        status === "candidate" ? String(order.id) : null,
      );
    }
  });
}
Deno.test("pre-sale, absent buyer, foreign question and unavailable API never fabricate an order", async () => {
  const row = {
    seller_id: "3642409154",
    platform_item_id: "MLB100",
    platform_question_id: "12345",
    question_text: "Qual a medida?",
  };
  const presale = await escalationContext(row, async () => {
    throw new Error("must not request");
  });
  assert.equal(presale.order.status, "not_linked");
  for (
    const remote of [{ seller_id: 1, item_id: "MLB100", from: { id: 777 } }, {
      seller_id: 3642409154,
      item_id: "MLB100",
    }]
  ) {
    const r = await escalationContext({
      ...row,
      question_text: "Meu pedido não chegou",
    }, async () => remote);
    assert.equal(r.order.status, "not_identified");
  }
  const failed = await escalationContext({
    ...row,
    question_text: "Recebi sem as peças",
  }, async () => {
    throw new Error("403");
  });
  assert.equal(failed.order.status, "lookup_failed");
  assert.equal(failed.order.id, null);
});
