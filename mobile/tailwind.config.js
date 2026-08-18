const plugin = require('tailwindcss/plugin');

const colors = {
  background: '#0a0a0a',
  foreground: '#f4f2ee',
  card: { DEFAULT: '#1e1e23', foreground: '#f4f2ee' },
  popover: { DEFAULT: '#1e1e23', foreground: '#f4f2ee' },
  primary: { DEFAULT: '#ffffff', foreground: '#0c0b09' },
  secondary: { DEFAULT: '#222228', foreground: '#f4f2ee' },
  muted: { DEFAULT: '#17171b', foreground: '#b5afa6' },
  accent: { DEFAULT: 'rgba(255,255,255,0.14)', foreground: '#ffffff' },
  destructive: { DEFAULT: '#ff7a73', foreground: '#180b0a' },
  success: { DEFAULT: '#6ed274', foreground: '#08170a' },
  warning: { DEFAULT: '#fcb442', foreground: '#1a1200' },
  border: 'rgba(255,255,255,0.14)',
  input: 'rgba(255,255,255,0.18)',
  ring: 'rgba(255,255,255,0.35)',
  sidebar: {
    DEFAULT: '#111114',
    foreground: '#f4f2ee',
    primary: '#ffffff',
    'primary-foreground': '#0c0b09',
    accent: 'rgba(255,255,255,0.14)',
    'accent-foreground': '#ffffff',
    border: 'rgba(255,255,255,0.14)',
    ring: 'rgba(255,255,255,0.35)',
  },
  chart: {
    1: '#59aaf8',
    2: '#b599ff',
    3: '#ff847d',
    4: '#0dcaa9',
    5: '#ddb227',
  },
  git: {
    added: '#6ed274',
    'added-subtle': '#133716',
    removed: '#ff847c',
    'removed-subtle': '#4b1d1b',
    modified: '#fcb442',
    'modified-subtle': '#472d00',
    branch: '#65bdff',
    merge: '#c3a4ff',
    tag: '#f3c530',
    hash: '#c3b4ac',
  },
  agent: {
    claude: '#d97757',
    codex: '#f4f2ee',
    gemini: '#65bdff',
    copilot: '#c3a4ff',
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
