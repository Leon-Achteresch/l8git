import type { AgentItem } from '@desktop/lib/agents/types';

export type ToolRunStatus = 'running' | 'success' | 'error' | 'cancelled';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function prettyJson(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function boundedTail(value: string, maxChars: number, maxLines: number): string {
  if (!value) {
    return value;
  }
  const charBounded = value.length > maxChars ? value.slice(-maxChars) : value;
  const lines = charBounded.split('\n');
  const body = lines.length > maxLines ? lines.slice(-maxLines).join('\n') : charBounded;
  return body.length === value.length ? body : `… earlier output hidden …\n${body}`;
}

export function commandStatus(item: AgentItem): ToolRunStatus {
  const status = stringValue(item.status);
  if (status === 'inProgress') {
    return 'running';
  }
  if (status === 'failed') {
    return 'error';
  }
  if (status === 'declined' || status === 'cancelled') {
    return 'cancelled';
  }
  return 'success';
}

export function toolStatus(item: AgentItem): ToolRunStatus {
  const status = stringValue(item.status);
  if (status === 'inProgress') {
    return 'running';
  }
  if (status === 'failed' || item.error) {
    return 'error';
  }
  if (status === 'cancelled' || status === 'declined') {
    return 'cancelled';
  }
  return 'success';
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export interface AgentUserContent {
  text: string;
  images: string[];
  mentions: string[];
  audio: string[];
}

export function userContent(item: AgentItem): AgentUserContent {
  const text: string[] = [];
  const images: string[] = [];
  const mentions: string[] = [];
  const audio: string[] = [];
  for (const content of arrayValue(item.content)) {
    if (!isRecord(content)) {
      continue;
    }
    if (content.type === 'text') {
      text.push(stringValue(content.text));
    }
    if (content.type === 'localImage') {
      images.push(stringValue(content.path));
    }
    if (content.type === 'image') {
      images.push(stringValue(content.url));
    }
    if (content.type === 'skill' || content.type === 'mention') {
      mentions.push(stringValue(content.name, stringValue(content.path)));
    }
    if (content.type === 'audio') {
      audio.push(stringValue(content.url));
    }
    if (content.type === 'localAudio') {
      audio.push(stringValue(content.path));
    }
  }
  return {
    text: text.filter(Boolean).join('\n'),
    images: images.filter(Boolean),
    mentions: mentions.filter(Boolean),
    audio: audio.filter(Boolean),
  };
}

export function reasoningTexts(value: unknown): string[] {
  return arrayValue(value)
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (!isRecord(entry)) {
        return '';
      }
      return (
        stringValue(entry.text) || stringValue(entry.summary_text) || stringValue(entry.content)
      );
    })
    .map((text) => text.trim())
    .filter(Boolean);
}

const SUBJECT_KEYS = [
  'file_path',
  'path',
  'pattern',
  'query',
  'url',
  'command',
  'prompt',
  'description',
] as const;

export function toolSubject(args: unknown): string {
  if (!isRecord(args)) {
    return '';
  }
  for (const key of SUBJECT_KEYS) {
    const value = stringValue(args[key]);
    if (value) {
      return value.length > 96 ? `${value.slice(0, 96)}…` : value;
    }
  }
  const keys = Object.keys(args);
  return keys.length ? keys.slice(0, 3).join(', ') : '';
}

export function plainToolText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const blocks = value.filter(isRecord);
  if (blocks.length !== value.length || !blocks.every((block) => block.type === 'text')) {
    return null;
  }
  return blocks.map((block) => stringValue(block.text)).join('\n');
}

export function toolOutputText(value: unknown): string {
  const text = plainToolText(value);
  return text === null ? prettyJson(value) : text;
}

export function formatTokens(value: number): string {
  if (value < 1_000) {
    return String(value);
  }
  if (value < 1_000_000) {
    return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
  }
  return `${(value / 1_000_000).toFixed(2)}M`;
}

export function formatDurationMs(value: number | null | undefined): string | null {
  if (!value || value <= 0) {
    return null;
  }
  const seconds = value / 1_000;
  if (seconds < 60) {
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}
