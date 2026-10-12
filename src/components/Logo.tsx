import { APP_NAME } from '@/lib/brand';

/** Símbolo OrbiaHUB (provisório, até a logo oficial): moldura arredondada com cantos deslocados. */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={APP_NAME} className={className}>
      <defs>
        <linearGradient id="ob-g" x1="8" y1="6" x2="58" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#A78BFF" /><stop offset="1" stopColor="#6B4BF5" /></linearGradient>
      </defs>
      <path fill="url(#ob-g)" fillRule="evenodd" d="M20 4h26l14 14v28a6 6 0 0 1-6 6H44V36a4 4 0 0 0-4-4H24a4 4 0 0 0-4 4v16H18a6 6 0 0 1-6-6V32H4V24a6 6 0 0 1 6-6h4V10a6 6 0 0 1 6-6Zm4 18v14h16V22H24Z" opacity=".95" />
      <path fill="url(#ob-g)" d="M4 32h8v14a6 6 0 0 0 6 6h2v8a4 4 0 0 1-4 4H12a8 8 0 0 1-8-8V32Z" opacity=".7" />
    </svg>
  );
}

export function Logo({ size = 32, light = false, className = '' }: { size?: number; light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className={`font-bold leading-none tracking-tight ${light ? 'text-white' : 'text-fg'}`} style={{ fontSize: size * 0.72 }}>orbiahub<span className="text-accent">.</span></span>
    </span>
  );
}
