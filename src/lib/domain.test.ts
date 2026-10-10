import { describe, expect, it } from 'vitest';
import { addDays, addMonths, adKpis, elapsedFraction, goalProgress, monthGrid, monthRange, parseAdCsv, parseCents, proposalTotals, splitInstallments, sumAd } from './domain';
import { missingVars, renderTemplate } from './contracts';

describe('parseCents', () => {
  it('aceita formatos brasileiros e simples', () => {
    expect(parseCents('1.234,56')).toBe(123456);
    expect(parseCents('R$ 10')).toBe(1000);
    expect(parseCents('1234.56')).toBe(123456);
    expect(parseCents('1.500')).toBe(150000);
    expect(parseCents('0,5')).toBe(50);
  });
  it('rejeita vazio e inválido', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseCents('-5')).toBeNull();
  });
});

describe('propostas', () => {
  it('total = pontual + mensal×meses − desconto (igual ao trigger)', () => {
    const t = proposalTotals([
      { billing: 'pontual', quantity: 1, unit_price_cents: 100000 },
      { billing: 'mensal', quantity: 1, unit_price_cents: 50000 },
    ], 3, 10000);
    expect(t).toEqual({ oneTime: 100000, monthly: 50000, total: 240000 });
  });
  it('desconto nunca deixa o total negativo', () => {
    expect(proposalTotals([{ billing: 'pontual', quantity: 1, unit_price_cents: 1000 }], 1, 5000).total).toBe(0);
  });
  it('parcelas somam o total e o resto vai para a última', () => {
    const p = splitInstallments(10000, 3);
    expect(p).toEqual([3333, 3333, 3334]);
    expect(p.reduce((a, b) => a + b)).toBe(10000);
  });
});

describe('datas', () => {
  it('monthRange, addDays e addMonths', () => {
    expect(monthRange(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-01');
  });
  it('monthGrid começa no domingo e cobre o mês', () => {
    const g = monthGrid(2026, 10);
    expect(g[0][0].date <= '2026-10-01').toBe(true);
    expect(g.flat().filter((c) => c.inMonth).length).toBe(31);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
});

describe('metas', () => {
  it('projeta pelo ritmo atual e marca risco', () => {
    expect(elapsedFraction('2026-10-01', '2026-10-31', '2026-10-31')).toBe(1);
    const g = goalProgress({ target: 1000, actual: 100, from: '2026-10-01', to: '2026-10-30', today: '2026-10-15' });
    expect(Math.round(g.projected)).toBeLessThan(1000);
    expect(g.atRisk).toBe(true);
    const ok = goalProgress({ target: 1000, actual: 600, from: '2026-10-01', to: '2026-10-30', today: '2026-10-15' });
    expect(ok.atRisk).toBe(false);
    expect(ok.percent).toBe(60);
  });
  it('período encerrado não fica "em risco"', () => {
    expect(goalProgress({ target: 1000, actual: 1, from: '2026-09-01', to: '2026-09-30', today: '2026-10-15' }).atRisk).toBe(false);
  });
});

describe('tráfego', () => {
  it('calcula KPIs e devolve null sem denominador', () => {
    const k = adKpis({ spend_cents: 10000, impressions: 5000, clicks: 200, leads: 4, conversions: 1, revenue_cents: 30000 });
    expect(k.ctr).toBe(4); expect(k.cpc).toBe(50); expect(k.cpl).toBe(2500); expect(k.roas).toBe(3); expect(k.cpa).toBe(10000);
    expect(adKpis(sumAd([])).cpl).toBeNull();
  });
  it('importa CSV com ; e datas dd/mm/aaaa, ignorando acentos no cabeçalho', () => {
    const r = parseAdCsv('Data;Valor gasto;Impressões;Cliques;Leads\n01/10/2026;123,45;1.000;50;3\n02/10/2026;x;1;1;1');
    expect(r.rows).toEqual([{ day: '2026-10-01', spend_cents: 12345, impressions: 1000, clicks: 50, leads: 3, conversions: 0, revenue_cents: 0 }]);
    expect(r.errors).toHaveLength(1);
  });
  it('exige colunas obrigatórias', () => {
    expect(parseAdCsv('foo;bar\n1;2').errors[0]).toMatch(/Colunas obrigatórias/);
  });
});

describe('contratos', () => {
  it('substitui variáveis e marca as faltantes', () => {
    const t = renderTemplate('Olá {{contratante_nome}}, valor {{valor_total}} em {{cidade}}', { contratante_nome: 'Maria', valor_total: 'R$ 10,00' });
    expect(t).toBe('Olá Maria, valor R$ 10,00 em [________]');
    expect(missingVars(t)).toBe(1);
  });
});
