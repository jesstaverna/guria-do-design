import { APP_NAME } from '@/lib/brand';

/** Símbolo OrbiaHUB em vetor (redesenhado a partir da logo oficial; fundo transparente, serve nos temas claro e escuro). */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="170 200 920 860" role="img" aria-label={APP_NAME} className={className}>
      <defs>
        <linearGradient id="ob-top" x1="366" y1="230" x2="888" y2="410" gradientUnits="userSpaceOnUse"><stop stopColor="#B792FB" /><stop offset="1" stopColor="#6B4BF8" /></linearGradient>
        <linearGradient id="ob-right" x1="880" y1="330" x2="1050" y2="860" gradientUnits="userSpaceOnUse"><stop stopColor="#4A28EA" /><stop offset=".5" stopColor="#7B5CFB" /><stop offset="1" stopColor="#B792FB" /></linearGradient>
        <linearGradient id="ob-left" x1="230" y1="420" x2="380" y2="930" gradientUnits="userSpaceOnUse"><stop stopColor="#8F6EFB" /><stop offset=".6" stopColor="#6244FB" /><stop offset="1" stopColor="#4A28EA" /></linearGradient>
        <linearGradient id="ob-bottom" x1="400" y1="1000" x2="888" y2="900" gradientUnits="userSpaceOnUse"><stop stopColor="#7154FC" /><stop offset="1" stopColor="#BA95FB" /></linearGradient>
      </defs>
      <path fill="url(#ob-right)" d="M862 322 1046 508Q1070 534 1070 566V800Q1070 866 1004 866H888V410Z" />
      <path fill="url(#ob-left)" d="M366 410H265Q186 410 186 490V705Q186 735 207 752L385 930 366 866Z" />
      <path fill="url(#ob-bottom)" d="M366 866Q366 925 405 950L470 1018Q492 1042 526 1042H826Q888 1042 888 980V866Z" />
      <path fill="url(#ob-top)" d="M366 410V290Q366 219 437 219H735Q766 219 787 241L890 346V410Z" />
    </svg>
  );
}

export function Logo({ size = 32, light = false, className = '' }: { size?: number; light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className={`font-extrabold leading-none tracking-tight ${light ? 'text-white' : 'text-fg'}`} style={{ fontSize: size * 0.72 }}>orbiahub<span className="text-accent">.</span></span>
    </span>
  );
}
