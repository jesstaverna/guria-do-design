import type { Config } from "./config.ts";

export interface MetaClient {
  /** Private Reply: primeira DM a partir de um comentário (1 por comentário, até 7 dias) */
  sendPrivateReply(commentId: string, text: string, buttonTitle: string, payload: string): Promise<void>;
  /** DM normal; só funciona dentro da janela de 24h após a última interação da pessoa */
  sendText(userId: string, text: string): Promise<void>;
  replyToComment(commentId: string, message: string): Promise<void>;
}

export function createMetaClient(cfg: Config, log: (msg: string) => void = console.log): MetaClient {
  const base = `https://graph.instagram.com/${cfg.graphVersion}`;

  async function call(path: string, body: unknown): Promise<void> {
    if (cfg.dryRun) {
      log(`[DRY_RUN] POST ${path} ${JSON.stringify(body)}`);
      return;
    }
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.igAccessToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Meta API ${res.status} em ${path}: ${await res.text()}`);
  }

  return {
    sendPrivateReply: (commentId, text, buttonTitle, payload) =>
      call(`/${cfg.igUserId}/messages`, {
        recipient: { comment_id: commentId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text,
              buttons: [{ type: "postback", title: buttonTitle.slice(0, 20), payload }],
            },
          },
        },
      }),
    sendText: (userId, text) =>
      call(`/${cfg.igUserId}/messages`, { recipient: { id: userId }, message: { text } }),
    replyToComment: (commentId, message) => call(`/${commentId}/replies`, { message }),
  };
}
