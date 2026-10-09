import assert from "node:assert/strict";
import {
  assertOwner,
  buildGrounding,
  ML_ACCOUNTS,
  stableItem,
  validateGroundedAnswer,
} from "./ml-grounding.ts";
import {
  makeSupport,
  parseDecision,
  syncExternalAccount,
} from "./ml-support.ts";

function database() {
  const tables: Record<string, any[]> = {};
  const db: any = {
    tables,
    from(name: string) {
      tables[name] ||= [];
      let filters: ((r: any) => boolean)[] = [],
        op = "select",
        value: any,
        one = false,
        limit = 1000;
      const q: any = {
        select() {
          return q;
        },
        eq(k: string, v: any) {
          filters.push((r) => r[k] === v);
          return q;
        },
        in(k: string, v: any[]) {
          filters.push((r) => v.includes(r[k]));
          return q;
        },
        like(k: string, v: string) {
          filters.push((r) => String(r[k]).startsWith(v.replace(/%$/, "")));
          return q;
        },
        limit(n: number) {
          limit = n;
          return q;
        },
        maybeSingle() {
          one = true;
          return q;
        },
        single() {
          one = true;
          return q;
        },
        insert(v: any) {
          op = "insert";
          value = v;
          return q;
        },
        update(v: any) {
          op = "update";
          value = v;
          return q;
        },
        upsert(v: any) {
          op = "upsert";
          value = v;
          return q;
        },
        then(resolve: any) {
          let rows = tables[name].filter((r) => filters.every((f) => f(r)))
            .slice(0, limit);
          if (op === "insert") {
            tables[name].push({ id: crypto.randomUUID(), ...value });
            rows = [value];
          }
          if (op === "update") {
            for (const r of rows) {
              Object.assign(r, value);
            }
          }
          if (op === "upsert") {
            const old = tables[name].find((r) =>
              r.seller_id === value.seller_id && r.item_id === value.item_id
            );
            if (old) Object.assign(old, value);
            else tables[name].push(value);
            rows = [value];
          }
          return Promise.resolve({
            data: one ? rows[0] || null : rows,
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
    async rpc(_name: string, { p_key }: any) {
      tables.ml_work_leases ||= [];
      let old = tables.ml_work_leases.find((x) => x.work_key === p_key);
      if (
        old &&
        (old.state !== "retry" || Date.parse(old.retry_after) > Date.now())
      ) return { data: false };
      if (old) {
        Object.assign(old, {
          state: "working",
          attempts: old.attempts + 1,
        });
      } else {tables.ml_work_leases.push({
          work_key: p_key,
          state: "working",
          attempts: 1,
        });}
      return { data: true };
    },
  };
  return db;
}
const fixture = (seller: string) => ({
  id: "MLB100",
  seller_id: Number(seller),
  title: "Jogo de memória",
  status: "active",
  condition: "new",
  seller_custom_field: "JMTRA",
  attributes: [{ id: "MATERIAL", name: "Material", value_name: "MDF" }],
  variations: [],
  available_quantity: 2,
  price: 25.9,
  currency_id: "BRL",
  last_updated: "2026-10-09",
});

Deno.test("account and item ownership is mandatory", () => {
  assert.throws(() => assertOwner("3642409154", fixture("532562281")), /owner/);
  assert.throws(
    () => assertOwner("no-seller", fixture("532562281")),
    /unknown/,
  );
  assert.throws(
    () =>
      assertOwner("532562281", fixture("532562281"), {
        seller_id: 532562281,
        item_id: "MLB999",
      }),
    /owner/,
  );
});
Deno.test("stable knowledge excludes prices and availability; variation IDs retained", () => {
  const item = {
    ...fixture("532562281"),
    variations: [{
      id: 123,
      price: 80,
      available_quantity: 4,
      seller_custom_field: "AZUL",
      attribute_combinations: [{ id: "COLOR", value_name: "Azul" }],
    }],
  };
  const stable = stableItem(item);
  assert(!JSON.stringify(stable).includes("price"));
  assert(!JSON.stringify(stable).includes("available_quantity"));
  assert.equal(stable.variations[0].id, "123");
  assert.equal(stable.variations[0].sku, "AZUL");
});
Deno.test("shared facts do not inherit other listings stock, price or variations", () => {
  const facts = JSON.parse(
    buildGrounding(
      "532562281",
      { ...fixture("532562281"), _sale_price: { amount: 25.9 } },
      { description: "MDF" },
      {
        id: "p",
        sku: "JMTRA",
        stock_quantity: 999,
        price_site: 999,
        variations: ["Roxo"],
        material: "MDF",
      },
      "Qual o material?",
    ),
  );
  assert.equal(facts.consulta_ao_vivo.preco_de_venda_consultado, 25.9);
  assert.equal(facts.ficha_compartilhada.stock_quantity, undefined);
  assert(!JSON.stringify(facts).includes("Roxo"));
});
Deno.test("missing evidence, invented sizes and invalid output are held for a human", () => {
  assert.equal(
    validateGroundedAnswer("Olá! Custa R$ 29,90.", '{"price":29.9}'),
    null,
  );
  assert.equal(
    validateGroundedAnswer("Olá! Custa R$ 29,91.", '{"price":29.9}'),
    "unsupported_numeric_claim",
  );
  assert.equal(parseDecision("Olá!", "MDF").decision, "human");
  assert.equal(
    parseDecision(
      JSON.stringify({
        decision: "answer",
        answer: "Olá! Mede 30 cm.",
        evidence: ["MDF"],
      }),
      "MDF",
    ).decision,
    "human",
  );
  assert.equal(
    validateGroundedAnswer("Olá! São 20 peças.", "São 16 peças."),
    "unsupported_numeric_claim",
  );
  assert.equal(
    parseDecision(
      JSON.stringify({
        decision: "answer",
        answer: "Olá! É feito de MDF.",
        evidence: ["madeira"],
      }),
      "MDF",
    ).decision,
    "human",
  );
});

async function scenario(seller: string, options: any = {}) {
  const db = database();
  const item = fixture(options.owner || seller);
  let posted: any[] = [];
  let remote: any = null;
  let calls = 0;
  const original = globalThis.fetch;
  const question = {
    id: 12345,
    item_id: item.id,
    seller_id: item.seller_id,
    text: "Qual o material?",
    date_created: "2026-10-09T12:00:00Z",
    status: "UNANSWERED",
  };
  globalThis.fetch = async (input: any, init: any = {}) => {
    const url = String(input);
    const token = init.headers?.Authorization;
    if (url.endsWith("/users/me")) {
      return Response.json({ id: Number(seller), nickname: "test" });
    }
    if (url.includes("/questions/search")) {
      return Response.json({
        total: remote ? 0 : 1,
        questions: remote ? [] : [question],
      });
    }
    if (url.endsWith("/answers")) {
      const body = JSON.parse(init.body);
      posted.push({ token, body });
      if (options.failSend) {
        return Response.json({ error: "unavailable" }, { status: 503 });
      }
      remote = { text: body.text, date_created: new Date().toISOString() };
      return Response.json({ status: "ANSWERED" });
    }
    if (url.includes("/questions/")) {
      return Response.json({
        ...question,
        status: remote ? "ANSWERED" : "UNANSWERED",
        answer: remote,
      });
    }
    if (url.endsWith("/description")) {
      return Response.json({
        plain_text: "Jogo feito de MDF. Contém 16 peças.",
      });
    }
    if (url.includes("/items/")) return Response.json(item);
    throw new Error("unexpected_request");
  };
  const support = makeSupport(db, async (_db, s) => "token-" + s, async () => {
    calls++;
    return {
      answer: JSON.stringify(
        options.human
          ? { decision: "human", reason: "certificação não informada" }
          : {
            decision: "answer",
            answer: "Olá! O jogo é feito de MDF.",
            evidence: ["MDF"],
          },
      ),
      tokens: 500,
      usage: { input_tokens: 450, output_tokens: 50 },
      model: "test",
      timeMs: 1,
    };
  }, async () => ({}));
  return {
    db,
    support,
    posted,
    calls: () => calls,
    setRemoteAnswer: (text: string) => {
      remote = { text, date_created: new Date().toISOString() };
    },
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
for (const seller of Object.keys(ML_ACCOUNTS)) {
  Deno.test(`${ML_ACCOUNTS[seller].label}: end-to-end routing, send and readback (simulated ML)`, async () => {
    const s = await scenario(seller);
    try {
      const result = await s.support.process(seller, "12345");
      assert.equal(result.state, "answered_verified");
      assert.equal(s.posted.length, 1);
      assert.equal(s.posted[0].token, "Bearer token-" + seller);
      assert.equal(s.db.tables.marketplace_questions[0].seller_id, seller);
      assert.equal(
        s.db.tables.marketplace_questions[0].answered_by,
        "ai_agent",
      );
    } finally {
      s.restore();
    }
  });
}
Deno.test("concurrent duplicate notifications generate and send once", async () => {
  const s = await scenario("532562281");
  try {
    await Promise.all([
      s.support.process("532562281", "12345"),
      s.support.process("532562281", "12345"),
    ]);
    assert.equal(s.posted.length, 1);
    assert.equal(s.calls(), 1);
  } finally {
    s.restore();
  }
});
Deno.test("foreign question never generates or sends", async () => {
  const s = await scenario("3642409154", { owner: "532562281" });
  try {
    const r = await s.support.process("3642409154", "12345");
    assert.equal(r.ok, false);
    assert.equal(s.calls(), 0);
    assert.equal(s.posted.length, 0);
    assert.equal(s.db.tables.marketplace_questions, undefined);
  } finally {
    s.restore();
  }
});
Deno.test("dry run reads real path, generates, never sends or persists questions", async () => {
  const s = await scenario("3642409154");
  try {
    const r = await s.support.dryRun(
      "3642409154",
      "MLB100",
      "Qual o material?",
    );
    assert.equal(r.decision.decision, "answer");
    assert.equal(r.sent, false);
    assert.equal(s.posted.length, 0);
    assert.equal(s.db.tables.marketplace_questions.length, 0);
    assert.equal(s.db.tables.ml_listing_knowledge.length, 0);
  } finally {
    s.restore();
  }
});
Deno.test("unknown information enters human queue and never posts", async () => {
  const s = await scenario("2237203375", { human: true });
  try {
    const r = await s.support.process("2237203375", "12345");
    assert.equal(r.state, "human");
    assert.equal(s.posted.length, 0);
    assert.equal(s.db.tables.marketplace_questions[0].status, "pending");
    await s.support.process("2237203375", "12345");
    assert.equal(s.calls(), 1);
  } finally {
    s.restore();
  }
});
Deno.test("failed delivery remains retryable, never records false success", async () => {
  const s = await scenario("2237203375", { failSend: true });
  try {
    const r = await s.support.process("2237203375", "12345");
    assert.equal(r.state, "retry");
    assert.equal(s.db.tables.marketplace_questions[0].status, "failed");
    assert.equal(s.db.tables.marketplace_questions[0].answer_text, undefined);
    assert.equal(s.db.tables.ml_work_leases[0].state, "retry");
    s.db.tables.ml_work_leases[0].retry_after = "2000-01-01T00:00:00Z";
    await s.support.process("2237203375", "12345");
    assert.equal(
      s.calls(),
      1,
      "retry reuses the verified draft when facts have not changed",
    );
    assert.equal(s.db.tables.marketplace_questions[0].tokens_used, 500);
    assert.equal(
      s.db.tables.marketplace_questions[0].ai_classification.model,
      "test",
    );
  } finally {
    s.restore();
  }
});
Deno.test("external token import cannot overwrite ML1", async () => {
  await assert.rejects(
    () =>
      syncExternalAccount(database(), {
        seller_id: "532562281",
        access_token: "example",
      }),
    /external_account_not_allowed/,
  );
});

Deno.test("human reply on ML reconciles locally without sending or impersonating the AI", async () => {
  const s = await scenario("2237203375", { human: true });
  try {
    await s.support.process("2237203375", "12345");
    s.setRemoteAnswer("Olá! Material confirmado pela equipe.");
    const r = await s.support.reconcile("2237203375");
    assert.equal(r.reconciled, 1);
    assert.equal(
      s.db.tables.marketplace_questions[0].answered_by,
      "marketplace_verified",
    );
    assert.equal(
      s.db.tables.marketplace_questions[0].product_name,
      "Jogo de memória",
    );
    assert.equal(s.posted.length, 0);
    assert.equal(s.calls(), 1);
  } finally {
    s.restore();
  }
});
