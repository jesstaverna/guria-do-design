import { createHmac, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { loadConfig, type Config } from "./config.ts";
import { openDb, type Db } from "./db.ts";
import { handleWebhook, type Deps } from "./handlers.ts";
import { createMetaClient, type MetaClient } from "./meta.ts";
import { loadRules, type Rule } from "./rules.ts";

export function verifySignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = header.slice("sha256=".length);
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export function buildServer(opts: { cfg: Config; db: Db; meta: MetaClient; rules: Rule[] }) {
  const app = Fastify({ logger: true });
  const deps: Deps = { ...opts, log: (m) => app.log.info(m) };

  // precisamos do corpo bruto para validar a assinatura
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    try {
      done(null, { raw: body, json: JSON.parse(body.toString("utf8")) });
    } catch (e) {
      done(e as Error);
    }
  });

  app.get("/health", async () => ({ ok: true }));

  // verificação do webhook (a Meta chama uma vez ao cadastrar a URL)
  app.get("/webhook", async (req, reply) => {
    const q = req.query as Record<string, string>;
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === opts.cfg.verifyToken) {
      return reply.type("text/plain").send(q["hub.challenge"]);
    }
    return reply.code(403).send("forbidden");
  });

  app.post("/webhook", async (req, reply) => {
    const { raw, json } = req.body as { raw: Buffer; json: unknown };
    if (!opts.cfg.dryRun || opts.cfg.appSecret) {
      if (!verifySignature(opts.cfg.appSecret, raw, req.headers["x-hub-signature-256"] as string | undefined)) {
        return reply.code(401).send("invalid signature");
      }
    }
    // responde rápido (a Meta reenvia se demorar) e processa em seguida
    void handleWebhook(json as Parameters<typeof handleWebhook>[0], deps);
    return reply.code(200).send("ok");
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  if (!cfg.appSecret && !cfg.dryRun) throw new Error("APP_SECRET é obrigatório (ou use DRY_RUN=true para testes locais)");
  const app = buildServer({
    cfg,
    db: openDb(cfg.dbPath),
    meta: createMetaClient(cfg),
    rules: loadRules(cfg.rulesPath),
  });
  await app.listen({ port: cfg.port, host: "0.0.0.0" });
}
