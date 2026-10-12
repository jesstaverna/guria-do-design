// Personalização por marca: converte a cor do estúdio (#RRGGBB) nas variáveis CSS usadas por todo o tema.
type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

/** Luminância relativa (WCAG). */
export function luminance([r, g, b]: RGB) {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export const contrast = (a: RGB, b: RGB) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = ([r, g, b]: RGB, to: RGB, t: number): RGB => [Math.round(r + (to[0] - r) * t), Math.round(g + (to[1] - g) * t), Math.round(b + (to[2] - b) * t)];
const triplet = (c: RGB) => c.join(' ');

const WHITE: RGB = [255, 255, 255], BLACK: RGB = [16, 16, 16];

/**
 * Variáveis do tema a partir da cor da marca.
 * --on-accent: texto sobre a cor (branco ou quase preto, o de maior contraste) · --accent-dark: hover · --accent-ink: versão legível como TEXTO sobre fundo claro.
 */
export function brandVars(hex: string | null | undefined): Record<string, string> {
  const c = parseHex(hex ?? '') ?? [124, 92, 255];
  const ink = contrast(c, WHITE) >= 4.5 ? c : (() => { let x = c; for (let i = 0; i < 12 && contrast(x, WHITE) < 4.5; i++) x = mix(x, BLACK, 0.15); return x; })();
  return {
    '--accent': triplet(c), '--accent-dark': triplet(mix(c, BLACK, 0.18)),
    '--on-accent': triplet(contrast(c, WHITE) >= contrast(c, BLACK) ? WHITE : BLACK), '--accent-ink': triplet(ink),
  };
}
