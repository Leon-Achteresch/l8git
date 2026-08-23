import type { AgentPendingRequest } from '@desktop/lib/agents/types';

export type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline';

export type ApprovalDanger = 'normal' | 'caution' | 'danger';

export type ApprovalOutcome = 'approved' | 'rejected' | 'answered';

export interface ApprovalOption {
  value: string;
  label: string;
  description?: string;
}

export interface ApprovalQuestion {
  id: string;
  title: string;
  description?: string;
  options: ApprovalOption[];
  multiple: boolean;
  allowCustom: boolean;
  customPlaceholder?: string;
  secret: boolean;
  optional: boolean;
}

export interface ApprovalAnswer {
  selected: string[];
  custom?: string;
}

export type ApprovalAnswers = Record<string, ApprovalAnswer>;

export interface ApprovalFileChange {
  path: string;
  diff: string | null;
  content: string | null;
}

export const EMPTY_ANSWER: ApprovalAnswer = { selected: [], custom: '' };

const DANGER_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-[a-z]*[rf][a-z]*\s+)+/i, reason: 'Recursive or forced delete' },
  { pattern: /\bsudo\b/i, reason: 'Runs with elevated privileges' },
  { pattern: /\bmkfs(\.[a-z0-9]+)?\b/i, reason: 'Formats a filesystem' },
  { pattern: /\bdd\s+if=/i, reason: 'Raw disk write' },
  { pattern: /:\(\)\s*\{.*\}\s*;?\s*:/, reason: 'Fork bomb pattern' },
  { pattern: /\bgit\s+push\b[^\n]*(--force\b|-f\b)/i, reason: 'Force push rewrites remote history' },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: 'Discards local work' },
  { pattern: /\bgit\s+clean\b[^\n]*-[a-z]*f/i, reason: 'Deletes untracked files' },
  { pattern: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|k)?sh\b/i, reason: 'Pipes a download into a shell' },
  { pattern: /\bchmod\s+(-R\s+)?0?777\b/i, reason: 'World-writable permissions' },
  { pattern: /\bshutdown\b|\breboot\b|\bhalt\b/i, reason: 'Shuts the machine down' },
  { pattern: />\s*\/dev\/(sd|nvme|disk)/i, reason: 'Writes to a block device' },
];

const CAUTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bnpm\s+publish\b|\byarn\s+publish\b|\bbun\s+publish\b/i, reason: 'Publishes a package' },
  { pattern: /\bgit\s+push\b/i, reason: 'Writes to a remote' },
  { pattern: /\b(kill|pkill|killall)\b/i, reason: 'Terminates processes' },
  { pattern: /\bdocker\s+(rm|rmi|prune|system\s+prune)\b/i, reason: 'Removes container resources' },
  { pattern: /\b(curl|wget|nc|ssh|scp)\b/i, reason: 'Network access' },
  { pattern: /\brm\b/i, reason: 'Deletes files' },
  { pattern: /\bmv\b|\bmkdir\b|\btouch\b/i, reason: 'Mutates the filesystem' },
  { pattern: /\bapt(-get)?\b|\bbrew\b|\bpip\b|\bnpm\s+i(nstall)?\b/i, reason: 'Installs software' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function requestKey(request: AgentPendingRequest): string {
  return `${request.sessionId}:${request.threadId}:${String(request.requestId)}`;
}

export function commandOf(request: AgentPendingRequest): string | null {
  if (request.command) {
    return request.command;
  }
  const raw = request.raw;
  const direct = stringOf(raw.command);
  if (direct) {
    return direct;
  }
  if (Array.isArray(raw.command)) {
    const parts = raw.command.filter((value): value is string => typeof value === 'string');
    return parts.length > 0 ? parts.join(' ') : null;
  }
  const input = isRecord(raw.input) ? raw.input : null;
  return input ? stringOf(input.command) : null;
}

export function dangerReasons(request: AgentPendingRequest): string[] {
  const reasons: string[] = [];
  const command = commandOf(request);
  if (command) {
    for (const entry of DANGER_PATTERNS) {
      if (entry.pattern.test(command)) {
        reasons.push(entry.reason);
      }
    }
  }
  if (request.grantRoot) {
    reasons.push('Grants filesystem access outside the workspace');
  }
  return reasons;
}

export function cautionReasons(request: AgentPendingRequest): string[] {
  const command = commandOf(request);
  if (!command) {
    return [];
  }
  return CAUTION_PATTERNS.filter((entry) => entry.pattern.test(command)).map(
    (entry) => entry.reason
  );
}

export function dangerLevel(request: AgentPendingRequest): ApprovalDanger {
  if (dangerReasons(request).length > 0) {
    return 'danger';
  }
  return cautionReasons(request).length > 0 ? 'caution' : 'normal';
}

export function approvalTitle(request: AgentPendingRequest): string {
  switch (request.kind) {
    case 'command':
      return 'Run a command';
    case 'file-change':
      return 'Apply file changes';
    case 'user-input':
      return 'The agent needs input';
    case 'permissions':
      return 'Grant permissions';
    case 'elicitation':
      return stringOf(request.raw.message) ?? 'Confirmation required';
    default:
      return 'Unsupported request';
  }
}

export function approvalSubtitle(request: AgentPendingRequest): string | null {
  if (request.kind === 'elicitation') {
    return stringOf(request.raw.serverName) ?? request.method;
  }
  return request.reason ?? request.cwd ?? null;
}

function changeEntry(path: string, value: unknown): ApprovalFileChange | null {
  if (typeof value === 'string') {
    return { path, diff: value, content: null };
  }
  if (!isRecord(value)) {
    return null;
  }
  const update = isRecord(value.update) ? value.update : null;
  if (update) {
    return { path, diff: stringOf(update.unified_diff) ?? stringOf(update.unifiedDiff), content: null };
  }
  const add = isRecord(value.add) ? value.add : null;
  if (add) {
    return { path, diff: null, content: stringOf(add.content) ?? '' };
  }
  if (isRecord(value.delete)) {
    return { path, diff: null, content: null };
  }
  const diff = stringOf(value.unified_diff) ?? stringOf(value.unifiedDiff) ?? stringOf(value.diff);
  if (diff) {
    return { path, diff, content: null };
  }
  const content = stringOf(value.content) ?? stringOf(value.newText);
  return content === null ? null : { path, diff: null, content };
}

export function fileChanges(request: AgentPendingRequest): ApprovalFileChange[] {
  const raw = request.raw;
  const changes = isRecord(raw.changes) ? raw.changes : null;
  if (changes) {
    return Object.entries(changes).flatMap((entry) => {
      const mapped = changeEntry(entry[0], entry[1]);
      return mapped ? [mapped] : [];
    });
  }

  const fileChange = isRecord(raw.fileChange) ? raw.fileChange : null;
  if (fileChange) {
    const path = stringOf(fileChange.path) ?? stringOf(fileChange.file) ?? 'change';
    const mapped = changeEntry(path, fileChange);
    if (mapped) {
      return [mapped];
    }
  }

  const input = isRecord(raw.input) ? raw.input : null;
  if (input) {
    const path = stringOf(input.file_path) ?? stringOf(input.filePath) ?? stringOf(input.path);
    if (path) {
      const newString = stringOf(input.new_string) ?? stringOf(input.newString);
      const oldString = stringOf(input.old_string) ?? stringOf(input.oldString);
      if (newString !== null || oldString !== null) {
        return [{ path, diff: replacementDiff(oldString ?? '', newString ?? ''), content: null }];
      }
      const content = stringOf(input.content);
      if (content !== null) {
        return [{ path, diff: null, content }];
      }
      return [{ path, diff: null, content: null }];
    }
  }

  const plain = stringOf(raw.diff) ?? stringOf(raw.patch) ?? stringOf(raw.unified_diff);
  if (plain) {
    return [{ path: stringOf(raw.path) ?? 'patch', diff: plain, content: null }];
  }
  return [];
}

export function replacementDiff(oldText: string, newText: string): string {
  const removed = oldText ? oldText.split('\n').map((line) => `-${line}`) : [];
  const added = newText ? newText.split('\n').map((line) => `+${line}`) : [];
  return [`@@ -1,${removed.length} +1,${added.length} @@`, ...removed, ...added].join('\n');
}

export function unifiedDiffFor(change: ApprovalFileChange): string | null {
  if (!change.diff) {
    return null;
  }
  if (/^diff --(?:git|cc) /m.test(change.diff)) {
    return change.diff;
  }
  const gitHeader = `diff --git a/${change.path} b/${change.path}`;
  if (change.diff.startsWith('--- ')) {
    return `${gitHeader}\n${change.diff}`;
  }
  return `${gitHeader}\n--- a/${change.path}\n+++ b/${change.path}\n${change.diff}`;
}

function elicitationQuestions(request: AgentPendingRequest): ApprovalQuestion[] {
  const schema = isRecord(request.raw.requestedSchema) ? request.raw.requestedSchema : null;
  const properties = schema && isRecord(schema.properties) ? schema.properties : null;
  if (!properties) {
    return [];
  }
  const required = new Set(
    Array.isArray(schema?.required)
      ? schema.required.filter((value): value is string => typeof value === 'string')
      : []
  );
  return Object.entries(properties).flatMap<ApprovalQuestion>(([id, value]) => {
    if (!isRecord(value)) {
      return [];
    }
    const enumValues = Array.isArray(value.enum) ? value.enum : [];
    return [
      {
        id,
        title: stringOf(value.title) ?? id,
        description: stringOf(value.description) ?? undefined,
        options: enumValues.map((option) => ({ value: String(option), label: String(option) })),
        multiple: false,
        allowCustom: enumValues.length === 0,
        customPlaceholder: 'Type an answer',
        secret: value.format === 'password',
        optional: !required.has(id),
      },
    ];
  });
}

export function inputQuestions(request: AgentPendingRequest): ApprovalQuestion[] {
  if (request.kind === 'user-input') {
    return (request.questions ?? []).map((question) => ({
      id: question.id,
      title: question.header || 'Input required',
      description: question.question || undefined,
      options: question.options.map((option) => ({
        value: option.label,
        label: option.label,
        description: option.description,
      })),
      multiple: question.multiSelect === true,
      allowCustom: question.isOther === true || question.options.length === 0,
      customPlaceholder: question.isSecret ? 'Secret answer' : 'Type another answer',
      secret: question.isSecret === true,
      optional: false,
    }));
  }
  if (request.kind === 'elicitation') {
    return elicitationQuestions(request);
  }
  return [];
}

export function needsAnswers(request: AgentPendingRequest): boolean {
  return inputQuestions(request).length > 0;
}

export function isAnswered(answer: ApprovalAnswer | undefined): boolean {
  if (!answer) {
    return false;
  }
  return answer.selected.length > 0 || Boolean(answer.custom?.trim());
}

export function answersComplete(
  questions: readonly ApprovalQuestion[],
  answers: ApprovalAnswers
): boolean {
  return questions.every((question) => question.optional || isAnswered(answers[question.id]));
}

export function supportsAlwaysAllow(request: AgentPendingRequest): boolean {
  return (
    request.kind === 'command' || request.kind === 'file-change' || request.kind === 'permissions'
  );
}

export function supportsQuickDecision(request: AgentPendingRequest): boolean {
  if (request.kind === 'elicitation') {
    return inputQuestions(request).length === 0;
  }
  return request.kind === 'command' || request.kind === 'file-change' || request.kind === 'permissions';
}

function permissionsPayload(request: AgentPendingRequest, decision: ApprovalDecision): unknown {
  const requested = isRecord(request.raw.permissions) ? request.raw.permissions : {};
  const permissions: Record<string, unknown> = {};
  if (isRecord(requested.network)) {
    permissions.network = requested.network;
  }
  if (isRecord(requested.fileSystem)) {
    permissions.fileSystem = requested.fileSystem;
  }
  return {
    permissions: decision === 'decline' ? {} : permissions,
    scope: decision === 'acceptForSession' ? 'session' : 'turn',
  };
}

function legacyDecision(decision: ApprovalDecision): unknown {
  if (decision === 'accept') {
    return 'approved';
  }
  if (decision === 'acceptForSession') {
    return 'approved_for_session';
  }
  return { denied: { rejection: 'Rejected by user' } };
}

export function decisionPayload(request: AgentPendingRequest, decision: ApprovalDecision): unknown {
  if (request.kind === 'permissions') {
    return permissionsPayload(request, decision);
  }
  if (request.kind === 'elicitation') {
    return {
      action: decision === 'decline' ? 'decline' : 'accept',
      content: null,
      _meta: null,
    };
  }
  if (request.method === 'execCommandApproval' || request.method === 'applyPatchApproval') {
    return { decision: legacyDecision(decision) };
  }
  return { decision };
}

export function decisionOutcome(decision: ApprovalDecision): ApprovalOutcome {
  return decision === 'decline' ? 'rejected' : 'approved';
}

function elicitationContent(
  request: AgentPendingRequest,
  answers: ApprovalAnswers
): Record<string, unknown> {
  const schema = isRecord(request.raw.requestedSchema) ? request.raw.requestedSchema : {};
  const properties = isRecord(schema.properties) ? schema.properties : {};
  return Object.fromEntries(
    Object.entries(answers).flatMap<[string, unknown]>(([id, answer]) => {
      const value = answer.custom?.trim() || answer.selected[0];
      if (!value) {
        return [];
      }
      const property = isRecord(properties[id]) ? properties[id] : {};
      if (property.type === 'boolean') {
        return [[id, value === 'true']];
      }
      if (property.type === 'number' || property.type === 'integer') {
        const numeric = Number(value);
        return [[id, Number.isFinite(numeric) ? numeric : value]];
      }
      if (property.type === 'array') {
        return [[id, answer.selected]];
      }
      return [[id, value]];
    })
  );
}

export function answerPayload(request: AgentPendingRequest, answers: ApprovalAnswers): unknown {
  if (request.kind === 'user-input') {
    return {
      answers: Object.fromEntries(
        (request.questions ?? []).map((question) => {
          const answer = answers[question.id];
          const values = [...(answer?.selected ?? [])];
          const custom = answer?.custom?.trim();
          if (custom) {
            values.push(custom);
          }
          return [question.id, { answers: values }];
        })
      ),
    };
  }
  return {
    action: 'accept',
    content: elicitationContent(request, answers),
    _meta: null,
  };
}

export function externalUrl(request: AgentPendingRequest): string | null {
  return request.kind === 'elicitation' ? stringOf(request.raw.url) : null;
}

export function rawPreview(request: AgentPendingRequest): string {
  try {
    return JSON.stringify(request.raw, null, 2).slice(0, 4_000);
  } catch {
    return String(request.raw);
  }
}
