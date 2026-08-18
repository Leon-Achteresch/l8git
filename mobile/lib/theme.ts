import type { Theme } from 'expo-router';

export const palette = {
  background: '#0a0a0a',
  foreground: '#f4f2ee',
  card: '#1e1e23',
  cardForeground: '#f4f2ee',
  popover: '#1e1e23',
  primary: '#ffffff',
  primaryForeground: '#0c0b09',
  secondary: '#222228',
  muted: '#17171b',
  mutedForeground: '#b5afa6',
  accent: 'rgba(255,255,255,0.14)',
  accentForeground: '#ffffff',
  destructive: '#ff7a73',
  success: '#6ed274',
  warning: '#fcb442',
  border: 'rgba(255,255,255,0.14)',
  input: 'rgba(255,255,255,0.18)',
  ring: 'rgba(255,255,255,0.35)',
  sidebar: '#111114',
  git: {
    added: '#6ed274',
    addedSubtle: '#133716',
    removed: '#ff847c',
    removedSubtle: '#4b1d1b',
    modified: '#fcb442',
    modifiedSubtle: '#472d00',
    branch: '#65bdff',
    merge: '#c3a4ff',
    tag: '#f3c530',
    hash: '#c3b4ac',
  },
  chart: ['#59aaf8', '#b599ff', '#ff847d', '#0dcaa9', '#ddb227'],
} as const;

export const fonts = {
  sans: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

export const navigationTheme: Theme = {
  dark: true,
  colors: {
    primary: palette.foreground,
    background: palette.background,
    card: palette.sidebar,
    text: palette.foreground,
    border: palette.border,
    notification: palette.destructive,
  },
  fonts: {
    regular: { fontFamily: fonts.sans, fontWeight: '400' },
    medium: { fontFamily: fonts.medium, fontWeight: '500' },
    bold: { fontFamily: fonts.semibold, fontWeight: '600' },
    heavy: { fontFamily: fonts.bold, fontWeight: '700' },
  },
};
