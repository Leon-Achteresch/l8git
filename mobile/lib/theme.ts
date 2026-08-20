import type { Theme } from 'expo-router';

export const palette = {
  background: '#07080a',
  foreground: '#f4f4f6',
  card: '#121212',
  cardForeground: '#f4f4f6',
  popover: '#161617',
  primary: '#ff6363',
  primaryForeground: '#1a0705',
  secondary: '#1a1a1c',
  muted: '#101012',
  mutedForeground: '#9c9c9d',
  accent: 'rgba(255,99,99,0.16)',
  accentForeground: '#ff8f80',
  brand: '#ff6363',
  destructive: '#ff6161',
  success: '#59d499',
  warning: '#ffc533',
  border: '#242728',
  input: '#242728',
  ring: 'rgba(255,99,99,0.5)',
  sidebar: '#0d0d0d',
  git: {
    added: '#59d499',
    addedSubtle: '#0f2a1c',
    removed: '#ff6161',
    removedSubtle: '#2e1213',
    modified: '#ffc533',
    modifiedSubtle: '#2a2200',
    branch: '#57c1ff',
    merge: '#a78bfa',
    tag: '#ffc533',
    hash: '#9c9c9d',
  },
  chart: ['#ff7a6b', '#57c1ff', '#59d499', '#ffc533', '#a78bfa'],
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
