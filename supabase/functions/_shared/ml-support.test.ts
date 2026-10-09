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
import { handoffAcknowledgement } from "./ml-handoff.ts";
import { validateMLQuestionResponse } from "./ml-response-validator.ts";

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
        or(_expression: string) {
          filters.push((r) =>
            r.ai_classification?.handoff?.ack_status === "pending" ||
            !r.ai_classification?.handoff?.notified_at
          );
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

Deno.test("contradictory aluminum/porcelain sources cannot authorize microwave use", () => {
  const item = {
    ...fixture("532562281"),
    title: "Canequinha alumínio",
    attributes: [
      { id: "MATERIAL", name: "Material", value_name: "Porcelana" },
      {
        id: "IS_MICROWAVE_SAFE",
        name: "Apto para micro-ondas",
        value_name: "Sim",
      },
    ],
  };
  const context = buildGrounding(
    "532562281",
    item,
    { description: "" },
    null,
    "Pode ir ao micro-ondas?",
  );
  assert.equal(
    validateGroundedAnswer("Sim, pode ir ao micro-ondas.", context),
    "material_sources_conflict_requires_human",
  );
  const stock = buildGrounding(
    "532562281",
    item,
    { description: "" },
    null,
    "Está disponível?",
  );
  assert.equal(
    validateGroundedAnswer("Sim, está disponível neste anúncio.", stock),
    null,
  );
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
  const notifications: any[] = [];
  const events: string[] = [];
  const original = globalThis.fetch;
  const question = {
    id: 12345,
    item_id: item.id,
    seller_id: item.seller_id,
    text: options.question || "Qual o material?",
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
      events.push("post");
      if (options.failSend) {
        return Response.json({ error: "unavailable" }, { status: 503 });
      }
      remote = { text: body.text, date_created: new Date().toISOString() };
      if (options.throwAfterSend) {
        throw new Error("network_timeout_after_delivery");
      }
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
  const support = makeSupport(
    db,
    async (_db, s) => "token-" + s,
    async () => {
      calls++;
      if (options.failModel) throw new Error("model_unavailable");
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
    },
    async () => ({}),
    async (seller, q, item, reason, delivery) => {
      events.push("notify");
      notifications.push({ seller, q, item, reason, delivery });
      return !options.failNotify;
    },
  );
  return {
    db,
    support,
    posted,
    notifications,
    events,
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
    assert.equal(s.db.tables.marketplace_questions.length, 0);
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
Deno.test("unknown information receives acknowledgement before notifying and stays pending", async () => {
  const s = await scenario("2237203375", { human: true });
  try {
    const r = await s.support.process("2237203375", "12345");
    assert.equal(r.state, "human");
    assert.equal(s.posted.length, 1);
    assert.equal(
      s.posted[0].body.text,
      handoffAcknowledgement("Qual o material?"),
    );
    assert.deepEqual(s.events, ["post", "notify"]);
    assert.equal(s.notifications[0].delivery, "verified");
    assert.equal(s.db.tables.marketplace_questions[0].status, "pending");
    assert.equal(
      s.db.tables.marketplace_questions[0].answered_by,
      "ai_handoff",
    );
    await s.support.process("2237203375", "12345");
    assert.equal(s.calls(), 1);
    assert.equal(s.posted.length, 1);
    assert.equal(s.notifications.length, 1);
    await s.support.reconcile("2237203375");
    assert.equal(s.db.tables.marketplace_questions[0].status, "pending");
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
    s.db.tables.marketplace_questions = [{
      id: "local",
      platform: "mercado_livre",
      seller_id: "2237203375",
      platform_question_id: "12345",
      platform_item_id: "MLB100",
      status: "pending",
      product_name: "Jogo de memória",
    }];
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
    assert.equal(s.calls(), 0);
  } finally {
    s.restore();
  }
});

Deno.test("acknowledgements respect public channel rules and contain no unsupported promise", () => {
  for (const q of ["Qual o certificado?", "Meu pedido chegou quebrado"]) {
    const text = handoffAcknowledgement(q);
    const v = validateMLQuestionResponse(text);
    assert(!v.forbiddenContactDetected);
    assert.deepEqual(v.warnings, []);
    assert(text.length <= 350);
    assert(!/já retorno|em breve|amanhã|whatsapp|https?:/i.test(text));
  }
  assert(
    handoffAcknowledgement("Meu pedido chegou quebrado").includes(
      "Minhas Compras",
    ),
  );
});
for (const seller of Object.keys(ML_ACCOUNTS)) {
  Deno.test(`${ML_ACCOUNTS[seller].label}: mandatory acknowledgement is isolated, deduplicated and manually resolved`, async () => {
    const s = await scenario(seller, { human: true });
    try {
      await Promise.all([
        s.support.process(seller, "12345"),
        s.support.process(seller, "12345"),
      ]);
      assert.equal(s.posted.length, 1);
      assert.equal(s.posted[0].token, "Bearer token-" + seller);
      assert.equal(s.notifications.length, 1);
      const row = s.db.tables.marketplace_questions[0];
      assert.equal(row.status, "pending");
      const manual = await s.support.process(seller, "12345", {
        answer: "Outra resposta pública não deve ser enviada.",
        user: "human",
      });
      assert.equal(manual.state, "human_resolution_required");
      assert.equal(s.posted.length, 1);
      await assert.rejects(
        () => s.support.resolveHandoff(row.id, "ok", "human"),
        /resolution_note/,
      );
      const done = await s.support.resolveHandoff(
        row.id,
        "Medida confirmada com a equipe e corrigida no cadastro deste anúncio.",
        "human",
      );
      assert.equal(done.state, "human_resolved");
      assert.equal(done.public_message_sent, false);
      assert.equal(row.status, "answered");
      assert.equal(row.ai_classification.handoff.resolved_by, "human");
      assert.equal(s.posted.length, 1);
      await s.support.reconcile(seller);
      assert.equal(row.status, "answered");
    } finally {
      s.restore();
    }
  });
}
Deno.test("failed acknowledgement is durable and recovers without generating or discarding after three attempts", async () => {
  const options = { human: true, failSend: true };
  const seller = "2237203375";
  const s = await scenario(seller, options);
  try {
    await s.support.process(seller, "12345");
    const row = s.db.tables.marketplace_questions[0];
    assert.equal(row.ai_classification.handoff.ack_status, "pending");
    assert.equal(row.answer_text, undefined);
    await assert.rejects(
      () =>
        s.support.resolveHandoff(
          row.id,
          "Fonte confirmada e cadastro corrigido.",
          "human",
        ),
      /acknowledgement_not_confirmed/,
    );
    for (let i = 0; i < 3; i++) {
      s.db.tables.ml_work_leases.find((l: any) =>
        l.work_key === `handoff:${seller}:12345`
      ).retry_after = "2000-01-01";
      await s.support.reconcile(seller);
    }
    assert(s.posted.length >= 4);
    assert.equal(row.status, "pending");
    assert.equal(s.calls(), 1);
    options.failSend = false;
    s.db.tables.ml_work_leases.find((l: any) =>
      l.work_key === `handoff:${seller}:12345`
    ).retry_after = "2000-01-01";
    await s.support.reconcile(seller);
    assert.equal(row.ai_classification.handoff.ack_status, "verified");
    assert.equal(row.status, "pending");
    assert.equal(s.calls(), 1);
  } finally {
    s.restore();
  }
});
Deno.test("POST timeout after delivery is confirmed by readback and never posted twice", async () => {
  const seller = "3642409154";
  const s = await scenario(seller, { human: true, throwAfterSend: true });
  try {
    await s.support.process(seller, "12345");
    assert.equal(
      s.db.tables.marketplace_questions[0].ai_classification.handoff.ack_status,
      "verified",
    );
    await s.support.reconcile(seller);
    assert.equal(s.posted.length, 1);
    assert.equal(s.notifications.length, 1);
  } finally {
    s.restore();
  }
});
Deno.test("model outage also produces mandatory acknowledgement when it reaches the human queue", async () => {
  const seller = "2237203375";
  const s = await scenario(seller, { failModel: true });
  try {
    for (let i = 0; i < 3; i++) {
      if (i) {
        s.db.tables.ml_work_leases.find((l: any) =>
          l.work_key === `question:${seller}:12345`
        ).retry_after = "2000-01-01";
      }
      await s.support.process(seller, "12345");
    }
    assert.equal(s.posted.length, 1);
    assert.equal(
      s.posted[0].body.text,
      handoffAcknowledgement("Qual o material?"),
    );
    assert.equal(s.db.tables.marketplace_questions[0].status, "pending");
    assert.equal(s.notifications.length, 1);
  } finally {
    s.restore();
  }
});
Deno.test("legacy open human queue is acknowledged by reconciliation", async () => {
  const seller = "2237203375";
  const s = await scenario(seller, { human: true });
  try {
    s.db.tables.marketplace_questions = [{
      id: "old",
      platform: "mercado_livre",
      seller_id: seller,
      platform_question_id: "12345",
      platform_item_id: "MLB100",
      status: "pending",
      question_text: "Qual o material?",
      product_name: "Jogo de memória",
    }];
    s.db.tables.ml_work_leases = [{
      work_key: `question:${seller}:12345`,
      state: "human",
      attempts: 1,
    }];
    await s.support.reconcile(seller);
    assert.equal(s.posted.length, 1);
    assert.equal(s.calls(), 0);
    assert.equal(
      s.db.tables.marketplace_questions[0].ai_classification.handoff.ack_status,
      "verified",
    );
  } finally {
    s.restore();
  }
});
Deno.test("failed internal notification retries without reposting public acknowledgement", async () => {
  const seller = "3642409154";
  const options = { human: true, failNotify: true };
  const s = await scenario(seller, options);
  try {
    await s.support.process(seller, "12345");
    assert.equal(
      s.db.tables.marketplace_questions[0].ai_classification.handoff
        .notified_at,
      undefined,
    );
    options.failNotify = false;
    s.db.tables.ml_work_leases.find((l: any) =>
      l.work_key === `handoff-notify:${seller}:12345`
    ).retry_after = "2000-01-01";
    await s.support.reconcile(seller);
    assert(
      s.db.tables.marketplace_questions[0].ai_classification.handoff
        .notified_at,
    );
    assert.equal(s.posted.length, 1);
    assert.equal(s.notifications.length, 2);
  } finally {
    s.restore();
  }
});
