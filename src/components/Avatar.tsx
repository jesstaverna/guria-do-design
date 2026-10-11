/** Foto da pessoa; sem foto, mostra as iniciais. */
export function Avatar({ url, name, size = 36 }: { url?: string | null; name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={name} style={style} className="shrink-0 rounded-full object-cover" />
    : <span style={style} aria-label={name} className="grid shrink-0 place-items-center rounded-full bg-accent/15 font-semibold text-accent">{initials}</span>;
}
