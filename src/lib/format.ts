const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

/** Todos os valores monetários do banco estão em CENTAVOS. */
export const money = (cents: number | string | null | undefined) => brl.format(Number(cents ?? 0) / 100);
export const moneyCompact = (cents: number | string | null | undefined) => brlCompact.format(Number(cents ?? 0) / 100);
export const num = (v: number | string | null | undefined) => Number(v ?? 0).toLocaleString('pt-BR');
export const pct = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')}%`;
/** Valor para preencher inputs de dinheiro (ex.: 123456 -> "1234,56"). */
export const centsToInput = (cents: number | string | null | undefined) => (Number(cents ?? 0) / 100).toFixed(2).replace('.', ',');

/** Datas "de negócio" (yyyy-mm-dd) são exibidas sem conversão de fuso para não deslocar o dia. */
export function dateBR(d: string | Date | null | undefined) {
  if (!d) return '—';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }
  return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
export function dateTimeBR(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}
export function daysSince(d: string | Date | null | undefined, now = new Date()) {
  if (!d) return null;
  return Math.floor((now.getTime() - new Date(d).getTime()) / 86_400_000);
}
