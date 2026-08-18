export type ShellTokenKind =
  | 'program'
  | 'subcommand'
  | 'flag'
  | 'string'
  | 'operator'
  | 'path'
  | 'number'
  | 'variable'
  | 'plain';

export interface ShellToken {
  kind: ShellTokenKind;
  text: string;
}

const OPERATORS = new Set([
  '|',
  '||',
  '&&',
  '&',
  ';',
  '>',
  '>>',
  '<',
  '2>',
  '2>&1',
  '$(',
  ')',
  '`',
]);

const CHAINERS = new Set(['|', '||', '&&', ';', '&']);

const SHELL_KEYWORDS = new Set([
  'sudo',
  'env',
  'time',
  'nohup',
  'xargs',
  'then',
  'else',
  'do',
  'done',
  'fi',
]);

function splitShell(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      current += char;
      if (char === quote && command[index - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ' ' || char === '\n' || char === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function classify(token: string, expectProgram: boolean, previous: string | null): ShellTokenKind {
  if (OPERATORS.has(token)) {
    return 'operator';
  }
  if (token.startsWith('"') || token.startsWith("'")) {
    return 'string';
  }
  if (token.startsWith('$')) {
    return 'variable';
  }
  if (token.startsWith('-')) {
    return 'flag';
  }
  if (expectProgram) {
    return 'program';
  }
  if (/^\d+(\.\d+)?$/.test(token)) {
    return 'number';
  }
  if (token.includes('/') || token.startsWith('.') || token.startsWith('~')) {
    return 'path';
  }
  if (previous && !previous.startsWith('-') && /^[a-z][a-z0-9:_-]*$/i.test(token)) {
    return 'subcommand';
  }
  return 'plain';
}

export function tokenizeCommand(command: string): ShellToken[] {
  const raw = splitShell(command);
  const tokens: ShellToken[] = [];
  let expectProgram = true;
  let previous: string | null = null;
  let sawSubcommand = false;

  for (const value of raw) {
    const kind = classify(value, expectProgram, previous);
    if (kind === 'program' && SHELL_KEYWORDS.has(value)) {
      tokens.push({ kind: 'operator', text: value });
      previous = value;
      continue;
    }
    if (kind === 'subcommand' && sawSubcommand) {
      tokens.push({ kind: 'plain', text: value });
      previous = value;
      continue;
    }
    if (kind === 'subcommand') {
      sawSubcommand = true;
    }
    if (kind === 'program') {
      expectProgram = false;
      sawSubcommand = false;
    }
    if (CHAINERS.has(value)) {
      expectProgram = true;
      sawSubcommand = false;
    }
    tokens.push({ kind, text: value });
    previous = value;
  }

  return tokens;
}
