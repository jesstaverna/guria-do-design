import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: { DEFAULT: 'rgb(var(--accent) / <alpha-value>)', dark: 'rgb(var(--accent-dark) / <alpha-value>)', ink: 'rgb(var(--accent-ink) / <alpha-value>)' },
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        violet: { brand: '#7327ea' },
        danger: 'rgb(var(--danger) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
      },
      // Tipografia da marca (Tusker / Standert) é licenciada: adicione @font-face em globals.css e coloque aqui.
      fontFamily: { sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', '"Helvetica Neue"', 'Arial', 'sans-serif'] },
      borderRadius: { xl: '14px', '2xl': '20px' },
    },
  },
  plugins: [],
};
export default config;
