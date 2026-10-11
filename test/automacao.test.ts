import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { handleComment, handleMessaging } from "../src/handlers.ts";
import type { MetaClient } from "../src/meta.ts";
import { matchRule, normalize, type Rule } from "../src/rules.ts";
import { buildServer, verifySignature } from "../src/server.ts";

const rule: Rule = {
  id: "ebook",
  palavras: ["quero", "prompts"],
  respostasPublicas: ["Enviado!"],
  dm: { texto: "Quer receber?", botao: "Quero receber" },
  conteudo: { texto: "Aqui está https://x.com" },
  posts: [],
};

function setup(rules: Rule[] = [rule]) {
  const calls: string[] = [];
  const meta: MetaClient = {
    sendPrivateReply: async (c, _t, _b, p) => void calls.push(`pr:${c}:${p}`),
    sendText: async (u, t) => void calls.push(`dm:${u}:${t}`),
    replyToComment: async (c, m) => void calls.push(`reply:${c}:${m}`),
  };
  const cfg = { ...loadConfig({}), igUserId: "me", dryRun: true };
  const db = openDb(":memory:");
  return { calls, deps: { cfg, db, meta, rules, log: () => {} } };
}

test("normalize remove acento, caixa e pontuação", () => {
  assert.equal(normalize("  QUERO!!! Já "), "quero ja");
});

test("matchRule casa palavra inteira, ignora acento e respeita posts", () => {
  assert.equal(matchRule([rule], "Eu QUERO!")?.id, "ebook");
  assert.equal(matchRule([rule], "queroo"), undefined);
  const restrita = { ...rule, posts: ["m1"] };
  assert.equal(matchRule([restrita], "quero", "m2"), undefined);
  assert.equal(matchRule([restrita], "quero", "m1")?.id, "ebook");
});

test("comentário com palavra-chave dispara DM e resposta pública, uma única vez", async () => {
  const { calls, deps } = setup();
  const c = { id: "c1", text: "quero", from: { id: "u1", username: "ana" }, media: { id: "m1" } };
  await handleComment(c, deps);
  await handleComment(c, deps); // webhook repetido
  assert.deepEqual(calls, ["pr:c1:receber:ebook", "reply:c1:Enviado!"]);
});

test("ignora comentário sem palavra-chave e comentário da própria conta", async () => {
  const { calls, deps } = setup();
  await handleComment({ id: "c1", text: "lindo!", from: { id: "u1" } }, deps);
  await handleComment({ id: "c2", text: "quero", from: { id: "me" } }, deps);
  assert.deepEqual(calls, []);
});

test("clique no botão entrega o conteúdo uma vez só", async () => {
  const { calls, deps } = setup();
  const ev = { sender: { id: "u1" }, postback: { payload: "receber:ebook" } };
  await handleMessaging(ev, deps);
  await handleMessaging(ev, deps);
  assert.deepEqual(calls, ["dm:u1:Aqui está https://x.com"]);
});

test("falha no envio libera nova tentativa", async () => {
  const { deps } = setup();
  let fail = true;
  deps.meta.sendText = async () => {
    if (fail) throw new Error("boom");
  };
  const ev = { sender: { id: "u1" }, postback: { payload: "receber:ebook" } };
  await assert.rejects(handleMessaging(ev, deps));
  fail = false;
  await handleMessaging(ev, deps);
  assert.equal(deps.db.claimEntrega("u1", "ebook"), false); // agora sim entregue
});

test("assinatura do webhook", () => {
  const body = Buffer.from('{"a":1}');
  const good = "sha256=" + createHmac("sha256", "s").update(body).digest("hex");
  assert.equal(verifySignature("s", body, good), true);
  assert.equal(verifySignature("s", body, "sha256=00"), false);
  assert.equal(verifySignature("s", body, undefined), false);
});

test("servidor: verificação GET e POST assinado/não assinado", async () => {
  const { deps } = setup();
  const cfg = { ...deps.cfg, verifyToken: "tok", appSecret: "s", dryRun: false };
  const app = buildServer({ ...deps, cfg });
  const ok = await app.inject({ url: "/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=123" });
  assert.equal(ok.body, "123");
  const bad = await app.inject({ url: "/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1" });
  assert.equal(bad.statusCode, 403);

  const payload = JSON.stringify({ object: "instagram", entry: [] });
  const sig = "sha256=" + createHmac("sha256", "s").update(payload).digest("hex");
  const signed = await app.inject({
    method: "POST", url: "/webhook", payload,
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
  });
  assert.equal(signed.statusCode, 200);
  const unsigned = await app.inject({
    method: "POST", url: "/webhook", payload, headers: { "content-type": "application/json" },
  });
  assert.equal(unsigned.statusCode, 401);
  await app.close();
});
