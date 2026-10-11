import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = ReturnType<typeof openDb>;

export function openDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      user_id TEXT NOT NULL,
      username TEXT,
      rule_id TEXT NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, rule_id)
    );
    -- um comentário só dispara uma vez (idempotência contra reenvio de webhook)
    CREATE TABLE IF NOT EXISTS comentarios_processados (
      comment_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- o conteúdo final só é entregue uma vez por pessoa e regra
    CREATE TABLE IF NOT EXISTS entregas (
      user_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, rule_id)
    );
  `);

  const insertComment = db.prepare("INSERT OR IGNORE INTO comentarios_processados (comment_id) VALUES (?)");
  const upsertLead = db.prepare(
    "INSERT OR IGNORE INTO leads (user_id, username, rule_id, comment) VALUES (?, ?, ?, ?)",
  );
  const insertEntrega = db.prepare("INSERT OR IGNORE INTO entregas (user_id, rule_id) VALUES (?, ?)");

  return {
    raw: db,
    /** true se é a primeira vez que vemos este comentário */
    claimComment: (id: string) => Number(insertComment.run(id).changes) === 1,
    saveLead: (userId: string, username: string | undefined, ruleId: string, comment: string) =>
      void upsertLead.run(userId, username ?? null, ruleId, comment),
    /** true se ainda não entregamos esta regra para esta pessoa */
    claimEntrega: (userId: string, ruleId: string) => Number(insertEntrega.run(userId, ruleId).changes) === 1,
    /** libera de novo (usado se o envio falhar, para permitir nova tentativa) */
    releaseEntrega: (userId: string, ruleId: string) =>
      void db.prepare("DELETE FROM entregas WHERE user_id = ? AND rule_id = ?").run(userId, ruleId),
    releaseComment: (id: string) =>
      void db.prepare("DELETE FROM comentarios_processados WHERE comment_id = ?").run(id),
    close: () => db.close(),
  };
}
