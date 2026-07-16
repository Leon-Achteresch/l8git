export function repoInitialChar(name: string): string {
  const m = name.match(/[A-Za-z0-9]/);
  return (m?.[0] ?? "?").toUpperCase();
}

export function repoAvatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h);
  }
  return Math.abs(h) % 360;
}

export function repoAvatarBackground(name: string): string {
  return `hsl(${repoAvatarHue(name)} 42% 36%)`;
}
