import { redirect } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { Badge, PageHeader, Section } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { dateTimeBR } from '@/lib/format';
import { applyImport, discardImport, previewImport } from '../actions';

export const metadata = { title: 'Importar planejamento' };

interface Item { tipo: string; id: string; titulo: string; motivo: string }
interface Report {
  aplicada: boolean; pilares: Record<string, number>; campanhas: Record<string, number>; posts: Record<string, number>; por_grupo: Record<string, number>; por_mes: Record<string, number>; por_pilar: Record<string, number>;
  conflitos: Item[]; incompatibilidades: Item[]; reutilizados: Item[]; avisos: { msg: string }[]; verificacoes: { ok: boolean; msg: string }[];
}
const GRUPO: Record<string, string> = { calendario: 'Com data (calendário)', acervo: 'Acervo reserva', remanejado: 'Remanejados', ideia: 'Ideias extras' };
const MES: Record<string, string> = { '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro' };

function Counts({ title, c }: { title: string; c: Record<string, number> }) {
  return (
    <div className="rounded-2xl border border-line p-4"><div className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">{[['criar', 'Criar'], ['atualizar', 'Atualizar'], ['sem_mudanca', 'Sem mudança'], ['conflitos', 'Conflitos'], ['incompativeis', 'Incompatíveis']].filter(([k]) => k in c).map(([k, l]) => <div key={k} className="flex justify-between"><dt className="text-muted">{l}</dt><dd className={`font-medium ${(k === 'conflitos' || k === 'incompativeis') && c[k] ? 'text-danger' : ''}`}>{c[k]}</dd></div>)}</dl></div>
  );
}
const List = ({ title, items, tone }: { title: string; items: Item[]; tone: string }) => !items.length ? null : (
  <Section title={`${title} (${items.length})`}><ul className="space-y-2 text-sm">{items.map((i, n) => <li key={n} className={`rounded-xl border p-3 ${tone}`}><div className="font-medium">{i.titulo} <span className="font-mono text-xs text-muted">{i.id}</span></div><div className="text-xs text-muted">{i.motivo}</div></li>)}</ul></Section>);

export default async function Importar({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { supabase, ws, isAdmin } = await requireWorkspace('conteudo');
  if (!isAdmin) redirect('/conteudo');
  const { run } = await searchParams;
  const { data: runs } = await supabase.from('content_import_runs').select('id, status, file_name, created_at, applied_at, report').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(10);
  const cur = run ? runs?.find((r) => r.id === run) ?? (await supabase.from('content_import_runs').select('id, status, file_name, created_at, applied_at, report').eq('id', run).eq('workspace_id', ws.id).maybeSingle()).data : null;
  const r = cur?.report as Report | undefined;
  const blocked = !!r && (r.verificacoes.some((v) => !v.ok));

  return (
    <>
      <PageHeader title="Importar planejamento" subtitle="Importação controlada em duas etapas: primeiro um ENSAIO (nada é gravado), depois a aplicação, só se você aprovar." />
      <Section title="1. Enviar o arquivo do planejamento (.json)">
        <form action={previewImport} className="flex flex-wrap items-center gap-3"><input name="file" type="file" accept="application/json,.json" required className="block text-xs file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs" aria-label="Arquivo JSON do planejamento" /><SubmitButton className="btn btn-primary" pendingText="Analisando…">Analisar (ensaio)</SubmitButton></form>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Nada é publicado, agendado em rede social ou ativado (ManyChat entra sempre como rascunho desativado).</li>
          <li>Importar duas vezes <b>não duplica</b>: cada item tem um id externo. Itens que você editou no sistema <b>não são sobrescritos</b>; viram conflito para você decidir.</li>
          <li>Posts do acervo e ideias entram <b>sem data</b>. Pilares ou campanhas manuais com o mesmo nome são reutilizados.</li>
          <li>O arquivo fica guardado só até você aplicar ou descartar o ensaio.</li>
        </ul>
      </Section>

      {cur && r && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{cur.status === 'aplicada' ? '3. Resultado da importação' : '2. Relatório do ensaio (nada foi gravado)'}</h2>
            <div className="flex items-center gap-2"><Badge tone={cur.status === 'aplicada' ? 'bg-ok/15 text-ok' : cur.status === 'descartada' ? 'bg-subtle text-muted' : 'bg-amber-500/15 text-warn'}>{cur.status === 'ensaio' ? 'Aguardando sua aprovação' : cur.status}</Badge><span className="text-xs text-muted">{cur.file_name} · {dateTimeBR(cur.created_at)}</span></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3"><Counts title="Conteúdos" c={r.posts} /><Counts title="Pilares" c={r.pilares} /><Counts title="Campanhas" c={r.campanhas} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Distribuição"><dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">{Object.entries(r.por_grupo).map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted">{GRUPO[k] ?? k}</dt><dd className="font-medium">{v}</dd></div>)}{Object.entries(r.por_mes).sort().map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted">{MES[k] ?? `Mês ${k}`}</dt><dd className="font-medium">{v}</dd></div>)}</dl></Section>
            <Section title="Verificações do pacote"><ul className="space-y-1.5 text-sm">{r.verificacoes.map((v, i) => <li key={i} className={v.ok ? 'text-ok' : 'text-danger'}>{v.ok ? '✓' : '✗'} {v.msg}</li>)}{r.avisos.map((a, i) => <li key={`a${i}`} className="text-warn">⚠ {a.msg}</li>)}</ul></Section>
          </div>
          <List title="Conflitos (não serão sobrescritos nem criados)" items={r.conflitos} tone="border-amber-500/40 bg-amber-500/5" />
          <List title="Incompatibilidades (ignoradas)" items={r.incompatibilidades} tone="border-danger/40 bg-danger/5" />
          <List title="Reutilizados (já existiam)" items={r.reutilizados} tone="border-line" />
          {cur.status === 'ensaio' && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-5">
              <form action={applyImport.bind(null, cur.id)}><SubmitButton className="btn btn-primary" pendingText="Importando…" confirm={`Aplicar a importação? Serão criados ${r.posts.criar} conteúdos e atualizados ${r.posts.atualizar}. Nada será publicado, agendado ou ativado.`}>{blocked ? 'Aplicar mesmo assim' : 'Aplicar importação'}</SubmitButton></form>
              <form action={discardImport.bind(null, cur.id)}><SubmitButton className="btn" pendingText="…">Descartar ensaio</SubmitButton></form>
              {blocked && <span className="text-xs text-danger">Há verificações que não bateram com o pacote. Revise antes de aplicar.</span>}
            </div>
          )}
        </div>
      )}

      {!!runs?.length && (
        <Section title="Histórico de importações"><ul className="divide-y divide-line text-sm">{runs.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><a href={`/conteudo/importar?run=${x.id}`} className="hover:underline">{x.file_name ?? 'arquivo'} · {dateTimeBR(x.created_at)}</a><Badge>{x.status}</Badge></li>)}</ul></Section>
      )}
    </>
  );
}
