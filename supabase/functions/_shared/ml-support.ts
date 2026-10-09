import {
  assertOwner,
  buildGrounding,
  ML_ACCOUNTS,
  relevantLines,
  sellerSku,
  stableItem,
  validateGroundedAnswer,
} from "./ml-grounding.ts";
import { validateMLQuestionResponse } from "./ml-response-validator.ts";

type DB = any;
type Generator = (
  question: string,
  title: string,
  config: Record<string, string>,
  context: string,
) => Promise<any>;
type TokenResolver = (db: DB, seller: string) => Promise<string | null>;
const API = "https://api.mercadolibre.com";
const iso = () => new Date().toISOString();
function check(result: any) {
  if (result.error) throw new Error("database: " + result.error.message);
  return result.data;
}
export async function mlRead(path: string, token: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(API + path, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      if (attempt === 2) throw new Error("ml_read_network_error");
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    const data = await res.json().catch(() => ({ error: "invalid_response" }));
    if (res.ok && !data.error) return data;
    if (attempt < 2 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    throw new Error(
      `ml_read_${res.status}:${String(data.error || "invalid_response")}`,
    );
  }
  throw new Error("ml_read_failed");
}
export async function syncExternalAccount(db: DB, body: any) {
  const seller = String(body.seller_id);
  if (!ML_ACCOUNTS[seller]?.external || typeof body.access_token !== "string") {
    throw new Error("external_account_not_allowed");
  }
  const until = Date.parse(body.expires_at);
  if (!(until > Date.now() && until < Date.now() + 6.1 * 3600000)) {
    throw new Error("invalid_token_expiry");
  }
  const me = await mlRead("/users/me", body.access_token);
  if (String(me.id) !== seller) throw new Error("token_owner_mismatch");
  const prior = check(
    await db.from("marketplace_tokens").select("id,access_token").eq(
      "platform",
      "mercado_livre",
    ).eq("seller_id", seller).maybeSingle(),
  );
  if (prior?.access_token === body.access_token) {
    return { ok: true, seller_id: seller, changed: false };
  }
  check(
    await db.from("marketplace_tokens").upsert({
      platform: "mercado_livre",
      seller_id: seller,
      seller_nickname: me.nickname,
      app_id: "8869805792970343",
      access_token: body.access_token,
      // The owner remains the existing VPS sync. Never copy or rotate its refresh token.
      refresh_token: null,
      token_expires_at: body.expires_at,
      status: "active",
      updated_at: iso(),
      metadata: {
        token_owner: "vps-openclaw",
        account_label: ML_ACCOUNTS[seller].label,
      },
    }, { onConflict: "platform,seller_id" }),
  );
  return { ok: true, seller_id: seller, changed: true };
}
async function productMatch(db: DB, item: any) {
  const sku = sellerSku(item);
  const ids = new Set<string>();
  const listings = check(
    await db.from("product_listings").select("product_id,kit_quantity").eq(
      "platform",
      "mercado_livre",
    ).eq("platform_item_id", item.id),
  );
  const mappings = check(
    await db.from("marketplace_product_mapping").select(
      "product_id,is_kit,kit_quantity,needs_manual_review",
    ).eq("platform", "mercado_livre").eq("external_item_id", item.id),
  );
  for (const r of [...listings, ...mappings]) {
    if (r.product_id && !r.needs_manual_review) ids.add(r.product_id);
  }
  // Historical maps can point to retired unit products while today's SKU is a kit.
  if (ids.size) {
    const active = check(
      await db.from("products").select("id").in("id", [...ids]).eq(
        "is_active",
        true,
      ),
    );
    const valid = new Set(active.map((r: any) => r.id));
    for (const id of ids) if (!valid.has(id)) ids.delete(id);
  }
  const exact = sku
    ? check(
      await db.from("products").select("id").eq("sku", sku).eq(
        "is_active",
        true,
      ),
    )
    : [];
  for (const r of exact) ids.add(r.id);
  if (ids.size !== 1) {
    return { product: null, method: ids.size ? "ambiguous" : "listing_only" };
  }
  const product = check(
    await db.from("products").select(
      "id,sku,name,material,dimensions,short_description,full_description,usage_suggestions",
    ).eq("id", [...ids][0]).eq("is_active", true).maybeSingle(),
  );
  // Explicit item map is authoritative only if it does not disagree with a present SKU.
  if (sku && product && product.sku !== sku) {
    return { product: null, method: "sku_conflict" };
  }
  const kitMapped = [...listings, ...mappings].some((r) =>
    r.kit_quantity > 1 || r.is_kit
  );
  if (kitMapped && product && product.sku !== sku) {
    return { product: null, method: "kit_requires_exact_sku" };
  }
  return {
    product,
    method: exact.length === 1 ? "exact_sku" : "explicit_listing",
  };
}
async function sha(value: any) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(
    new Uint8Array(bytes),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function loadKnowledge(
  db: DB,
  seller: string,
  item: any,
  token: string,
  persist = true,
) {
  assertOwner(seller, item);
  const old = check(
    await db.from("ml_listing_knowledge").select("*").eq("seller_id", seller)
      .eq("item_id", item.id).maybeSingle(),
  );
  const stale = !old || old.source_updated_at !== item.last_updated ||
    Date.now() - Date.parse(old.checked_at) > 86400000;
  let description = old?.description || "";
  if (stale) {
    try {
      description =
        (await mlRead(`/items/${item.id}/description`, token)).plain_text || "";
    } catch (e) {
      if (!String(e).includes("ml_read_404")) throw e;
      description = "";
    }
  }
  const match = await productMatch(db, item);
  const stable = stableItem(item);
  const hash = await sha({
    stable,
    description,
    product_id: match.product?.id || null,
    method: match.method,
  });
  const row = {
    seller_id: seller,
    item_id: item.id,
    sku: sellerSku(item),
    product_id: match.product?.id || null,
    match_method: match.method,
    stable_data: stable,
    description,
    source_updated_at: item.last_updated,
    content_hash: hash,
    checked_at: iso(),
    updated_at: old?.content_hash === hash ? old.updated_at : iso(),
  };
  if (persist && (stale || old?.content_hash !== hash)) {
    check(
      await db.from("ml_listing_knowledge").upsert(row, {
        onConflict: "seller_id,item_id",
      }),
    );
  }
  return { row, product: match.product, changed: old?.content_hash !== hash };
}
async function correctionsForItem(
  db: DB,
  seller: string,
  itemId: string,
  question: string,
) {
  const rows = check(
    await db.from("marketplace_questions").select("id").eq(
      "platform",
      "mercado_livre",
    ).eq("seller_id", seller).eq("platform_item_id", itemId).limit(50),
  );
  if (!rows.length) return "";
  const result = await db.from("response_corrections").select(
    "original_question,recommended_response",
  ).eq("status", "processed").in("question_id", rows.map((x: any) => x.id))
    .limit(10);
  if (result.error) return ""; // Learning is optional, verified item facts are not.
  return relevantLines(
    (result.data || []).map((x: any) =>
      `${x.original_question}: ${x.recommended_response}`
    ).join("\n"),
    question,
    1200,
  );
}
export function parseDecision(raw: string, context: string) {
  let d: any;
  try {
    d = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { decision: "human", reason: "invalid_structured_answer" };
  }
  if (d.decision !== "answer") {
    return {
      decision: "human",
      reason: String(d.reason || "missing_verified_information").slice(0, 250),
    };
  }
  if (
    typeof d.answer !== "string" || !Array.isArray(d.evidence) ||
    !d.evidence.length ||
    d.evidence.some((x: any) =>
      typeof x !== "string" || x.length < 2 || !context.includes(x)
    )
  ) return { decision: "human", reason: "unverified_evidence" };
  const reason = validateGroundedAnswer(d.answer, context);
  const v = validateMLQuestionResponse(d.answer);
  if (reason || v.forbiddenContactDetected || v.warnings.length) {
    return { decision: "human", reason: reason || v.warnings.join(",") };
  }
  return { decision: "answer", answer: v.text, evidence: d.evidence };
}
export function makeSupport(
  db: DB,
  getToken: TokenResolver,
  generate: Generator,
  getConfig: () => Promise<any>,
  notify?: (
    seller: string,
    question: any,
    item: any,
    reason: string,
  ) => Promise<any>,
) {
  async function prepare(
    seller: string,
    itemId: string,
    question: string,
    persist = true,
    tokenOverride?: string,
  ) {
    if (!ML_ACCOUNTS[seller] || !/^MLB\d+$/.test(itemId)) {
      throw new Error("invalid_scope");
    }
    const token = tokenOverride || await getToken(db, seller);
    if (!token) throw new Error("account_token_unavailable");
    const item = await mlRead("/items/" + itemId, token);
    assertOwner(seller, item);
    const { row, product } = await loadKnowledge(
      db,
      seller,
      item,
      token,
      persist,
    );
    if (/pre[cç]o|valor|custa|quanto (?:fica|sai)/i.test(question)) {
      item._sale_price = await mlRead(
        `/items/${itemId}/sale_price?context=channel_marketplace`,
        token,
      );
      if (!Number.isFinite(item._sale_price.amount)) {
        throw new Error("sale_price_unavailable");
      }
    }
    const corrections = await correctionsForItem(db, seller, itemId, question);
    const context = buildGrounding(
      seller,
      item,
      row,
      product,
      question,
      corrections,
    );
    return { token, item, row, context };
  }
  async function dryRun(seller: string, itemId: string, question: string) {
    if (!question || question.length > 2000) {
      throw new Error("invalid_question");
    }
    const p = await prepare(seller, itemId, question, false);
    const result = await generate(
      question,
      p.item.title,
      await getConfig(),
      p.context,
    );
    return {
      ok: true,
      seller_id: seller,
      item_id: itemId,
      sku: p.row.sku,
      product_id: p.row.product_id,
      match_method: p.row.match_method,
      decision: parseDecision(result.answer, p.context),
      usage: result.usage,
      tokens: result.tokens,
      model: result.model,
      time_ms: result.timeMs,
      context_chars: p.context.length,
      context: p.context,
      dry_run: true,
      sent: false,
    };
  }
  async function finish(
    key: string,
    state: string,
    result: any,
    retry_after: string | null = null,
  ) {
    check(
      await db.from("ml_work_leases").update({
        state,
        result,
        retry_after,
        updated_at: iso(),
      }).eq("work_key", key),
    );
  }
  async function saveQuestion(question: any, item: any, patch: any) {
    const seller = String(question.seller_id), qid = String(question.id);
    const existing = check(
      await db.from("marketplace_questions").select("id,product_name").eq(
        "platform",
        "mercado_livre",
      ).eq("seller_id", seller).eq("platform_question_id", qid).limit(1),
    );
    const row = {
      platform: "mercado_livre",
      platform_question_id: qid,
      platform_item_id: question.item_id,
      seller_id: seller,
      product_name: item?.title || existing[0]?.product_name ||
        question.item_id,
      question_text: question.text,
      buyer_nickname: "Comprador",
      external_created_at: question.date_created,
      ...patch,
    };
    if (existing.length) {
      check(
        await db.from("marketplace_questions").update(row).eq(
          "id",
          existing[0].id,
        ),
      );
    } else check(await db.from("marketplace_questions").insert(row));
  }
  async function process(
    seller: string,
    qid: string,
    manual?: { answer: string; user: string },
  ) {
    if (!ML_ACCOUNTS[seller] || !/^\d+$/.test(qid)) {
      throw new Error("invalid_scope");
    }
    const key = `question:${seller}:${qid}`;
    if (manual) {
      const prior = check(
        await db.from("ml_work_leases").select("state").eq("work_key", key)
          .maybeSingle(),
      );
      if (prior?.state === "human" || prior?.state === "retry") {
        await finish(key, "retry", null, iso());
      }
    }
    const claimed = check(
      await db.rpc("claim_ml_work", { p_key: key, p_ttl: 300 }),
    );
    if (!claimed) {
      return {
        ok: true,
        state: "already_claimed_or_completed",
        seller_id: seller,
        question_id: qid,
      };
    }
    let question: any, item: any, generated: any;
    try {
      const token = await getToken(db, seller);
      if (!token) throw new Error("account_token_unavailable");
      question = await mlRead(`/questions/${qid}?api_version=4`, token);
      if (String(question.seller_id) !== seller) {
        throw new Error("question_owner_mismatch");
      }
      if (question.status === "ANSWERED") {
        await saveQuestion(question, null, {
          status: "answered",
          answer_text: question.answer?.text,
          answered_at: question.answer?.date_created,
          answered_by: "marketplace_verified",
          error_message: null,
        });
        await finish(key, "done", { verified: true });
        return {
          ok: true,
          state: "already_answered_verified",
          seller_id: seller,
          question_id: qid,
        };
      }
      if (question.status !== "UNANSWERED" || question.deleted_from_listing) {
        await finish(key, "done", { reason: "question_not_open" });
        return { ok: true, state: "not_open" };
      }
      const existing = check(
        await db.from("marketplace_questions").select(
          "status,error_message,ai_suggested_answer,ai_classification,tokens_used,tokens_in,tokens_out,ai_response_time_ms",
        ).eq("platform", "mercado_livre").eq("seller_id", seller).eq(
          "platform_question_id",
          qid,
        ).limit(1),
      );
      if (!manual && existing[0]?.status === "pending") {
        await finish(key, "human", { reason: "existing_human_queue" });
        return { ok: true, state: "human" };
      }
      const p = await prepare(
        seller,
        question.item_id,
        question.text,
        true,
        token,
      );
      item = p.item;
      assertOwner(seller, item, question);
      if (item.status !== "active") {
        await saveQuestion(question, item, {
          status: "skipped",
          error_message: "item_inactive:" + item.status,
        });
        await finish(key, "done", { reason: "item_inactive" });
        return { ok: true, state: "inactive" };
      }
      let decision: any;
      const stableContext = JSON.parse(p.context);
      delete stableContext.consulta_ao_vivo.verificado_em;
      const fingerprint = await sha({
        version: "ana-ml-20261009",
        context: stableContext,
        quantity: item.available_quantity,
        variations: (item.variations || []).map((
          v: any,
        ) => [v.id, v.price, v.available_quantity]),
        question: question.text,
      });
      if (manual) {
        const validation = validateMLQuestionResponse(manual.answer);
        if (validation.warnings.length || validation.forbiddenContactDetected) {
          throw new Error("manual_answer_rejected");
        }
        decision = { decision: "answer", answer: validation.text };
      } else if (
        existing[0]?.ai_classification?.grounding_hash === fingerprint &&
        existing[0]?.ai_suggested_answer && existing[0]?.status === "failed"
      ) {
        decision = {
          decision: "answer",
          answer: existing[0].ai_suggested_answer,
          evidence: existing[0].ai_classification.evidence,
        };
        if (
          parseDecision(JSON.stringify(decision), p.context).decision !==
            "answer"
        ) throw new Error("saved_answer_no_longer_supported");
      } else {
        generated = await generate(
          question.text,
          item.title,
          await getConfig(),
          p.context,
        );
        decision = parseDecision(generated.answer, p.context);
      }
      const telemetry = {
        product_id: p.row.product_id,
        ai_suggested_answer: decision.answer || null,
        tokens_used: (existing[0]?.tokens_used || 0) + (generated?.tokens || 0),
        tokens_in: (existing[0]?.tokens_in || 0) +
          (generated?.usage?.input_tokens || 0),
        tokens_out: (existing[0]?.tokens_out || 0) +
          (generated?.usage?.output_tokens || 0),
        ai_response_time_ms: (existing[0]?.ai_response_time_ms || 0) +
          (generated?.timeMs || 0),
        ai_classification: {
          seller_id: seller,
          item_id: item.id,
          sku: p.row.sku,
          match_method: p.row.match_method,
          model: generated?.model || existing[0]?.ai_classification?.model,
          usage: generated?.usage || existing[0]?.ai_classification?.usage,
          decision: decision.decision,
          reason: decision.reason,
          context_chars: p.context.length,
          grounding_hash: fingerprint,
          evidence: decision.evidence,
          reused: !generated && !manual,
        },
      };
      if (decision.decision !== "answer") {
        await saveQuestion(question, item, {
          ...telemetry,
          status: "pending",
          error_message: "escalado_humano: " + decision.reason,
        });
        await finish(key, "human", { reason: decision.reason });
        if (notify) await notify(seller, question, item, decision.reason);
        return {
          ok: true,
          state: "human",
          seller_id: seller,
          question_id: qid,
          reason: decision.reason,
        };
      }
      // Persist draft BEFORE sending. A network error is reconciled against the remote answer.
      await saveQuestion(question, item, {
        ...telemetry,
        status: "ai_suggested",
        error_message: null,
      });
      const latest = await mlRead(`/questions/${qid}?api_version=4`, token);
      assertOwner(seller, item, latest);
      if (latest.status !== "ANSWERED") {
        if (latest.status !== "UNANSWERED" || latest.deleted_from_listing) {
          throw new Error("question_changed_before_send");
        }
        const fresh = await mlRead("/items/" + item.id, token);
        assertOwner(seller, fresh, latest);
        if (item._sale_price) {
          const price = await mlRead(
            `/items/${item.id}/sale_price?context=channel_marketplace`,
            token,
          );
          if (price.amount !== item._sale_price.amount) {
            throw new Error("sale_price_changed_before_send");
          }
        }
        if (fresh.status !== "active") {
          throw new Error("item_changed_before_send");
        }
        if (
          /pre[cç]o|valor|custa|dispon|estoque|tem|cor/i.test(question.text) &&
          (fresh.price !== item.price ||
            fresh.available_quantity !== item.available_quantity ||
            JSON.stringify(fresh.variations) !==
              JSON.stringify(item.variations))
        ) throw new Error("live_facts_changed_before_send");
        const res = await fetch(API + "/answers", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question_id: Number(qid),
            text: decision.answer,
          }),
          signal: AbortSignal.timeout(20000),
        });
        // Always re-read, including conflicts or an ambiguous result. Never invent delivery.
        if (!res.ok && res.status !== 400 && res.status !== 409) {
          throw new Error("ml_send_" + res.status);
        }
      }
      const verified = await mlRead(`/questions/${qid}?api_version=4`, token);
      assertOwner(seller, item, verified);
      if (verified.status !== "ANSWERED" || !verified.answer?.text) {
        throw new Error("send_not_verified");
      }
      const ours = verified.answer.text === decision.answer;
      await saveQuestion(question, item, {
        ...telemetry,
        status: "answered",
        answer_text: verified.answer.text,
        answered_at: verified.answer.date_created,
        answered_by: ours
          ? (manual?.user || "ai_agent")
          : "marketplace_verified",
        error_message: null,
      });
      await finish(key, "done", { verified: true, ours });
      return {
        ok: true,
        state: "answered_verified",
        seller_id: seller,
        question_id: qid,
        ours,
      };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "processing_failed";
      const lease = check(
        await db.from("ml_work_leases").select("attempts").eq("work_key", key)
          .single(),
      );
      const human = lease.attempts >= 3 ||
        /mismatch|invalid_scope|manual_answer_rejected/.test(reason);
      // Do not attach a foreign seller's question to this account.
      if (question && String(question.seller_id) === seller) {
        await saveQuestion(question, item, {
          status: human ? "pending" : "failed",
          error_message: reason,
        });
      }
      await finish(
        key,
        human ? "human" : "retry",
        { reason },
        new Date(Date.now() + Math.min(30, lease.attempts * 2) * 60000)
          .toISOString(),
      );
      if (
        human && question && String(question.seller_id) === seller && notify
      ) await notify(seller, question, item, reason);
      return {
        ok: false,
        state: human ? "human" : "retry",
        seller_id: seller,
        question_id: qid,
        reason,
      };
    }
  }
  async function reconcile(seller: string) {
    if (!ML_ACCOUNTS[seller]) throw new Error("unknown_seller");
    const token = await getToken(db, seller);
    if (!token) throw new Error("account_token_unavailable");
    const me = await mlRead("/users/me", token);
    if (String(me.id) !== seller) throw new Error("token_owner_mismatch");
    const result = await mlRead(
      `/questions/search?seller_id=${seller}&status=UNANSWERED&sort_fields=date_created&sort_types=DESC&limit=50&api_version=4`,
      token,
    );
    const questions = (result.questions || []).filter((q: any) =>
      !q.deleted_from_listing &&
      (seller !== "532562281" ||
        Date.now() - Date.parse(q.date_created) > 60000)
    );
    const keys = questions.map((q: any) => `question:${seller}:${q.id}`);
    const terminal = keys.length
      ? check(
        await db.from("ml_work_leases").select("work_key").in("work_key", keys)
          .in("state", ["done", "human"]),
      )
      : [];
    const skip = new Set(terminal.map((x: any) => x.work_key));
    const pending = questions.filter((q: any) =>
      !skip.has(`question:${seller}:${q.id}`)
    );
    // A posted answer with a failed local save disappears from UNANSWERED; reconcile
    // the durable retry queue as well, so delivery can still be verified afterwards.
    const retries = check(
      await db.from("ml_work_leases").select("work_key").like(
        "work_key",
        `question:${seller}:%`,
      ).in("state", ["retry", "working"]).limit(10),
    );
    const queue = [
      ...new Set([
        ...pending.map((q: any) => String(q.id)),
        ...retries.map((x: any) => x.work_key.split(":")[2]),
      ]),
    ];
    const outputs = [];
    for (const qid of queue.slice(0, 5)) {
      outputs.push(await process(seller, qid as string));
    }
    // Human replies made directly on ML must close the Canggu queue too.
    const localOpen = check(
      await db.from("marketplace_questions").select("platform_question_id")
        .eq("platform", "mercado_livre").eq("seller_id", seller).in("status", [
          "pending",
          "failed",
          "ai_suggested",
        ]).limit(20),
    );
    const openIds = new Set(questions.map((q: any) => String(q.id)));
    let reconciled = 0;
    for (const row of localOpen) {
      const qid = row.platform_question_id;
      if (openIds.has(qid)) continue;
      const remote = await mlRead(`/questions/${qid}?api_version=4`, token);
      if (String(remote.seller_id) !== seller) {
        throw new Error("question_owner_mismatch");
      }
      if (remote.status === "ANSWERED" && remote.answer?.text) {
        await saveQuestion(remote, null, {
          status: "answered",
          answer_text: remote.answer.text,
          answered_at: remote.answer.date_created,
          answered_by: "marketplace_verified",
          error_message: null,
        });
        await finish(`question:${seller}:${qid}`, "done", {
          verified: true,
          ours: false,
        });
        reconciled++;
      } else if (
        remote.status !== "UNANSWERED" || remote.deleted_from_listing
      ) {
        await saveQuestion(remote, null, {
          status: "skipped",
          error_message: "remote_question_not_open:" + remote.status,
        });
        await finish(`question:${seller}:${qid}`, "done", {
          reason: "remote_question_not_open",
        });
        reconciled++;
      }
    }
    return {
      ok: true,
      seller_id: seller,
      nickname: me.nickname,
      unanswered: result.total,
      processed: outputs,
      reconciled,
    };
  }
  return { dryRun, process, reconcile, prepare };
}
