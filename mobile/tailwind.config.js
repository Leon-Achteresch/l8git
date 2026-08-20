const plugin = require('tailwindcss/plugin');

const colors = {
  background: '#07080a',
  foreground: '#f4f4f6',
  card: { DEFAULT: '#121212', foreground: '#f4f4f6' },
  popover: { DEFAULT: '#161617', foreground: '#f4f4f6' },
  primary: { DEFAULT: '#ff6363', foreground: '#1a0705' },
  secondary: { DEFAULT: '#1a1a1c', foreground: '#f4f4f6' },
  muted: { DEFAULT: '#101012', foreground: '#9c9c9d' },
  accent: { DEFAULT: 'rgba(255,99,99,0.16)', foreground: '#ff8f80' },
  brand: { DEFAULT: '#ff6363', foreground: '#1a0705' },
  destructive: { DEFAULT: '#ff6161', foreground: '#1a0705' },
  success: { DEFAULT: '#59d499', foreground: '#04140c' },
  warning: { DEFAULT: '#ffc533', foreground: '#1a1200' },
  border: '#242728',
  input: 'rgba(255,255,255,0.08)',
  ring: 'rgba(255,99,99,0.5)',
  sidebar: {
    DEFAULT: '#0d0d0d',
    foreground: '#f4f4f6',
    primary: '#ff6363',
    'primary-foreground': '#1a0705',
    accent: 'rgba(255,99,99,0.16)',
    'accent-foreground': '#ff8f80',
    border: '#242728',
    ring: 'rgba(255,99,99,0.5)',
  },
  chart: {
    1: '#ff7a6b',
    2: '#57c1ff',
    3: '#59d499',
    4: '#ffc533',
    5: '#a78bfa',
  },
  git: {
    added: '#59d499',
    'added-subtle': '#0f2a1c',
    removed: '#ff6161',
    'removed-subtle': '#2e1213',
    modified: '#ffc533',
    'modified-subtle': '#2a2200',
    branch: '#57c1ff',
    merge: '#a78bfa',
    tag: '#ffc533',
    hash: '#9c9c9d',
  },
  agent: {
    claude: '#d97757',
    codex: '#f4f4f6',
    gemini: '#57c1ff',
    copilot: '#a78bfa',
  },
};

module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ['Geist_400Regular'],
        mono: ['GeistMono_400Regular'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        xl: '11px',
        '2xl': '14px',
        '3xl': '18px',
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['13px', '18px'],
        base: ['15px', '21px'],
        lg: ['17px', '24px'],
        xl: ['20px', '27px'],
        '2xl': ['24px', '31px'],
        '3xl': ['30px', '37px'],
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        '.font-sans': { fontFamily: 'Geist_400Regular' },
        '.font-normal': { fontFamily: 'Geist_400Regular' },
        '.font-medium': { fontFamily: 'Geist_500Medium' },
        '.font-semibold': { fontFamily: 'Geist_600SemiBold' },
        '.font-bold': { fontFamily: 'Geist_700Bold' },
        '.font-extrabold': { fontFamily: 'Geist_700Bold' },
        '.font-mono': { fontFamily: 'GeistMono_400Regular' },
        '.font-mono-medium': { fontFamily: 'GeistMono_500Medium' },
      });
    }),
  ],
};
