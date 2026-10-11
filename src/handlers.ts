import type { Config } from "./config.ts";
import type { Db } from "./db.ts";
import type { MetaClient } from "./meta.ts";
import { matchRule, pickReply, type Rule } from "./rules.ts";

export interface Deps {
  cfg: Config;
  db: Db;
  meta: MetaClient;
  rules: Rule[];
  log?: (msg: string) => void;
}

const PAYLOAD_PREFIX = "receber:";

interface CommentValue {
  id: string;
  text?: string;
  from?: { id: string; username?: string };
  media?: { id: string };
}

interface MessagingEvent {
  sender?: { id: string };
  message?: { text?: string; is_echo?: boolean };
  postback?: { payload?: string };
}

interface WebhookBody {
  object?: string;
  entry?: Array<{
    changes?: Array<{ field: string; value: CommentValue }>;
    messaging?: MessagingEvent[];
  }>;
}

export async function handleWebhook(body: WebhookBody, deps: Deps): Promise<void> {
  const log = deps.log ?? console.log;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      await safely(log, "comentário", () => handleComment(change.value, deps));
    }
    for (const event of entry.messaging ?? []) {
      await safely(log, "mensagem", () => handleMessaging(event, deps));
    }
  }
}

async function safely(log: (m: string) => void, what: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    log(`Erro ao processar ${what}: ${err instanceof Error ? err.message : err}`);
  }
}

export async function handleComment(c: CommentValue, deps: Deps): Promise<void> {
  const { cfg, db, meta, rules } = deps;
  const log = deps.log ?? console.log;
  if (!c.id || !c.text || !c.from) return;
  if (c.from.id === cfg.igUserId) return; // não responde a si mesma

  const rule = matchRule(rules, c.text, c.media?.id);
  if (!rule) return;
  if (!db.claimComment(c.id)) return; // webhook repetido

  try {
    db.saveLead(c.from.id, c.from.username, rule.id, c.text);
    await meta.sendPrivateReply(c.id, rule.dm.texto, rule.dm.botao, PAYLOAD_PREFIX + rule.id);
    log(`DM enviada para @${c.from.username ?? c.from.id} (regra ${rule.id})`);
  } catch (err) {
    db.releaseComment(c.id); // permite nova tentativa se a Meta reenviar
    throw err;
  }

  const reply = pickReply(rule);
  if (reply) {
    // a resposta pública é "bônus": se falhar, a DM já foi
    await meta.replyToComment(c.id, reply).catch((e) => log(`Falha ao responder comentário: ${e.message}`));
  }
}

export async function handleMessaging(e: MessagingEvent, deps: Deps): Promise<void> {
  const { cfg, db, meta, rules } = deps;
  const log = deps.log ?? console.log;
  const userId = e.sender?.id;
  if (!userId || userId === cfg.igUserId || e.message?.is_echo) return;

  const payload = e.postback?.payload;
  if (!payload?.startsWith(PAYLOAD_PREFIX)) return;
  const rule = rules.find((r) => r.id === payload.slice(PAYLOAD_PREFIX.length));
  if (!rule) return;
  if (!db.claimEntrega(userId, rule.id)) return; // já entregue

  try {
    await meta.sendText(userId, rule.conteudo.texto);
    log(`Conteúdo "${rule.id}" entregue para ${userId}`);
  } catch (err) {
    db.releaseEntrega(userId, rule.id);
    throw err;
  }
}
