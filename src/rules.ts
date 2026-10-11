import { readFileSync } from "node:fs";

export interface Rule {
  id: string;
  palavras: string[];
  respostasPublicas: string[];
  dm: { texto: string; botao: string };
  conteudo: { texto: string };
  /** IDs de mídia (posts/reels). Vazio = vale para qualquer post. */
  posts: string[];
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadRules(path: string): Rule[] {
  const rules = JSON.parse(readFileSync(path, "utf8")) as Rule[];
  for (const r of rules) {
    if (!r.id || !r.palavras?.length || !r.dm?.texto || !r.conteudo?.texto) {
      throw new Error(`Regra inválida em ${path}: ${JSON.stringify(r.id)}`);
    }
    r.posts ??= [];
    r.respostasPublicas ??= [];
  }
  return rules;
}

/** Acha a primeira regra cuja palavra-chave aparece como palavra inteira no comentário. */
export function matchRule(rules: Rule[], comment: string, mediaId?: string): Rule | undefined {
  const text = ` ${normalize(comment)} `;
  return rules.find((rule) => {
    if (rule.posts.length && (!mediaId || !rule.posts.includes(mediaId))) return false;
    return rule.palavras.some((p) => text.includes(` ${normalize(p)} `));
  });
}

export function pickReply(rule: Rule): string | undefined {
  if (!rule.respostasPublicas.length) return undefined;
  return rule.respostasPublicas[Math.floor(Math.random() * rule.respostasPublicas.length)];
}
