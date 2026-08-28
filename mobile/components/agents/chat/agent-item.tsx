import {
  AtSign,
  Bot,
  Boxes,
  Braces,
  Brain,
  ClipboardList,
  FileImage,
  GitPullRequestArrow,
  Globe,
  MessageCircleQuestion,
  Mic,
  SquareTerminal,
  Timer,
  Users,
} from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

import { DiffView } from '~/components/shared/diff-view';
import { parseDiffFiles, type DiffFile } from '~/components/shared/diff-parse';
import { MarkdownView } from '~/components/shared/markdown-view';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { fonts } from '~/lib/theme';
import { cn } from '~/lib/utils';

import type { AgentItem, AgentTurn } from '@desktop/lib/agents/types';

import {
  arrayValue,
  baseName,
  boundedTail,
  commandStatus,
  formatDurationMs,
  isRecord,
  prettyJson,
  reasoningTexts,
  stringValue,
  toolOutputText,
  toolStatus,
  toolSubject,
  userContent,
} from './item-utils';
import { TodoList, type TodoEntry } from './todo-list';
import { ToolCard, ToolOutput } from './tool-card';

const MARKDOWN_LIMIT = 12_000;

function isStreaming(item: AgentItem, turn: AgentTurn): boolean {
  return turn.status === 'inProgress' && item.__completed !== true;
}

function StreamingCaret() {
  const opacity = useSharedValue(0.25);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={style} className="bg-foreground/80 mt-1 h-3.5 w-[2px] rounded-full" />
  );
}

function Chip({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Icon>['as'];
  label: string;
}) {
  return (
    <View className="bg-foreground/10 flex-row items-center gap-1 rounded-lg px-1.5 py-0.5">
      <Icon as={icon} size={9} className="text-primary-foreground/70" />
      <Text numberOfLines={1} className="text-primary-foreground/80 max-w-40 text-2xs">
        {label}
      </Text>
    </View>
  );
}

function UserMessage({ item }: { item: AgentItem }) {
  const content = userContent(item);
  const queued = item.__queued === true;

  if (!content.text && content.images.length === 0 && content.mentions.length === 0) {
    return null;
  }

  return (
    <Animated.View entering={FadeIn.duration(160)} className={cn('items-end', queued && 'opacity-60')}>
      <View className="bg-primary max-w-[86%] gap-2 rounded-3xl rounded-br-lg px-4 py-2.5">
        {content.text ? (
          <Text className="text-primary-foreground text-sm leading-5">{content.text}</Text>
        ) : null}
        {content.images.length > 0 || content.mentions.length > 0 || content.audio.length > 0 ? (
          <View className="flex-row flex-wrap justify-end gap-1">
            {content.images.map((path) => (
              <Chip key={`image-${path}`} icon={FileImage} label={baseName(path)} />
            ))}
            {content.mentions.map((mention) => (
              <Chip key={`mention-${mention}`} icon={AtSign} label={mention} />
            ))}
            {content.audio.map((path) => (
              <Chip key={`audio-${path}`} icon={Mic} label={baseName(path)} />
            ))}
          </View>
        ) : null}
      </View>
      {queued ? (
        <Text className="text-muted-foreground mt-1 text-2xs">Queued — sending to the agent</Text>
      ) : null}
    </Animated.View>
  );
}

function AssistantMessage({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  const text = stringValue(item.text);
  const streaming = isStreaming(item, turn);
  const plain = text.length > MARKDOWN_LIMIT;

  if (!text && !streaming) {
    return null;
  }

  return (
    <View className="gap-1.5 pr-2">
      {plain ? (
        <Text className="text-foreground text-sm leading-5">{text}</Text>
      ) : (
        <MarkdownView content={text} />
      )}
      {streaming ? <StreamingCaret /> : null}
    </View>
  );
}

function ReasoningItem({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  const working = isStreaming(item, turn);
  const rows = React.useMemo(
    () => [...reasoningTexts(item.summary), ...reasoningTexts(item.content)],
    [item.content, item.summary]
  );

  if (rows.length === 0 && !working) {
    return null;
  }

  const duration = formatDurationMs(turn.durationMs);

  return (
    <ToolCard
      icon={Brain}
      tool="Reasoning"
      title={working ? 'Thinking…' : 'Thought process'}
      meta={duration ? `${rows.length} notes · ${duration}` : `${rows.length} notes`}
      status={working ? 'running' : 'success'}
      defaultOpen={false}>
      <View className="gap-2 px-3 py-2.5">
        {rows.map((row, index) => (
          <Text key={index} className="text-muted-foreground text-xs leading-5">
            {row}
          </Text>
        ))}
      </View>
    </ToolCard>
  );
}

function CommandItem({ item }: { item: AgentItem }) {
  const command = stringValue(item.command, 'Command');
  const output = stringValue(item.aggregatedOutput);
  const status = commandStatus(item);
  const exitCode = typeof item.exitCode === 'number' ? item.exitCode : null;

  return (
    <ToolCard
      icon={SquareTerminal}
      tool="Shell"
      title={command}
      meta={stringValue(item.cwd) || null}
      status={status}
      defaultOpen={status === 'error' || status === 'running'}>
      <ToolOutput
        text={boundedTail(output, status === 'running' ? 40_000 : 120_000, 400)}
        tone={status === 'error' ? 'error' : 'default'}
      />
      {exitCode !== null ? (
        <Text className="text-muted-foreground px-3 pb-2 text-2xs">Exit code {exitCode}</Text>
      ) : null}
    </ToolCard>
  );
}

function FileChangeItem({ item }: { item: AgentItem }) {
  const changes = React.useMemo(() => {
    return arrayValue(item.changes)
      .filter(isRecord)
      .map((change, index) => {
        const path = stringValue(change.path, `File ${index + 1}`);
        const diff = stringValue(change.diff);
        const files: DiffFile[] = parseDiffFiles(diff).map((file) => ({
          ...file,
          id: `${index}:${path}`,
          path,
        }));
        return { path, files };
      })
      .filter((change) => change.files.length > 0);
  }, [item.changes]);

  const status = commandStatus(item);

  if (changes.length === 0) {
    return null;
  }

  return (
    <ToolCard
      icon={GitPullRequestArrow}
      tool="Edit"
      title={changes.length === 1 ? baseName(changes[0].path) : `${changes.length} files`}
      meta={changes.length === 1 ? changes[0].path : null}
      status={status}
      defaultOpen={changes.length === 1}>
      <View className="gap-2 p-2">
        {changes.map((change) => (
          <DiffView key={change.path} files={change.files} collapsible={false} initialRows={120} />
        ))}
      </View>
    </ToolCard>
  );
}

function ToolCallItem({ item }: { item: AgentItem }) {
  const tool = stringValue(item.tool, 'Tool');
  const server = stringValue(item.server, stringValue(item.namespace, 'Agent'));
  const subject = toolSubject(item.arguments);
  const status = toolStatus(item);
  const output = item.result ?? item.contentItems ?? item.error ?? item.arguments;
  const text = React.useMemo(() => toolOutputText(output), [output]);
  const progress = arrayValue(item.progress);

  return (
    <ToolCard
      icon={Braces}
      tool={server}
      title={tool}
      meta={subject || null}
      status={status}
      defaultOpen={status === 'error'}>
      <ToolOutput text={boundedTail(text, 80_000, 400)} tone={status === 'error' ? 'error' : 'default'} />
      {progress.length > 0 ? (
        <View className="border-border/50 gap-1 border-t px-3 py-2">
          {progress.map((message, index) => (
            <Text key={index} className="text-muted-foreground text-2xs">
              {stringValue(message)}
            </Text>
          ))}
        </View>
      ) : null}
    </ToolCard>
  );
}

function WebSearchItem({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  const results = arrayValue(item.results).filter(isRecord);
  const query = stringValue(item.query, 'Web search');

  return (
    <ToolCard
      icon={Globe}
      tool="Search"
      title={query}
      meta={`${results.length} results`}
      status={turn.status === 'inProgress' ? 'running' : 'success'}>
      <View className="gap-1.5 px-3 py-2.5">
        {results.map((result, index) => (
          <View key={index} className="gap-0.5">
            <Text numberOfLines={1} className="text-foreground text-xs">
              {stringValue(result.title, stringValue(result.url, 'Result'))}
            </Text>
            <Text numberOfLines={1} className="text-muted-foreground text-2xs">
              {stringValue(result.domain, stringValue(result.url))}
            </Text>
          </View>
        ))}
      </View>
    </ToolCard>
  );
}

function PlanItem({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  const entries = React.useMemo<TodoEntry[]>(() => {
    const structured = arrayValue(item.plan).filter(isRecord);
    if (structured.length > 0) {
      return structured.map((entry, index) => ({
        id: `${item.id}-${index}`,
        title: stringValue(entry.step),
        status:
          entry.status === 'completed'
            ? 'completed'
            : entry.status === 'inProgress'
              ? 'in-progress'
              : 'pending',
      }));
    }
    const text = stringValue(item.text, stringValue(item.plan));
    return text
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim())
      .filter(Boolean)
      .map((line, index) => ({
        id: `${item.id}-${index}`,
        title: line,
        status:
          turn.status === 'completed' ? 'completed' : index === 0 ? 'in-progress' : 'pending',
      }));
  }, [item.id, item.plan, item.text, turn.status]);

  return <TodoList items={entries} title="Plan" />;
}

function CollaborationItem({ item }: { item: AgentItem }) {
  const receivers = arrayValue(item.receiverThreadIds).filter(
    (value): value is string => typeof value === 'string'
  );
  const states = isRecord(item.agentsStates) ? Object.entries(item.agentsStates) : [];

  return (
    <ToolCard
      icon={Users}
      tool="Multi-agent"
      title={stringValue(item.tool, 'Collaboration')}
      meta={receivers.length ? `${receivers.length} agents` : null}
      status={toolStatus(item)}>
      <View className="gap-1.5 px-3 py-2.5">
        <Text className="text-foreground/85 text-xs leading-5">
          {stringValue(item.prompt, 'Coordinating agents.')}
        </Text>
        {states.map(([threadId, state]) => (
          <View key={threadId} className="flex-row items-center justify-between gap-3">
            <Text
              numberOfLines={1}
              style={{ fontFamily: fonts.mono }}
              className="text-muted-foreground min-w-0 flex-1 text-2xs">
              {threadId}
            </Text>
            <Text className="text-foreground/80 text-2xs">
              {isRecord(state) ? stringValue(state.status, prettyJson(state)) : prettyJson(state)}
            </Text>
          </View>
        ))}
      </View>
    </ToolCard>
  );
}

const STATUS_LABEL: Record<string, string> = {
  enteredReviewMode: 'Code review started',
  exitedReviewMode: 'Code review finished',
  contextCompaction: 'Context compacted',
  imageView: 'Image opened',
  imageGeneration: 'Image generated',
  subAgentActivity: 'Sub-agent activity',
};

const STATUS_ICON: Record<string, React.ComponentProps<typeof Icon>['as']> = {
  enteredReviewMode: GitPullRequestArrow,
  exitedReviewMode: GitPullRequestArrow,
  contextCompaction: Boxes,
  imageView: FileImage,
  imageGeneration: FileImage,
  subAgentActivity: Bot,
};

function ActivityRow({
  icon,
  label,
  detail,
}: {
  icon: React.ComponentProps<typeof Icon>['as'];
  label: string;
  detail?: string | null;
}) {
  return (
    <View className="flex-row items-center gap-2 px-1 py-0.5">
      <Icon as={icon} size={11} className="text-muted-foreground/70" />
      <Text numberOfLines={2} className="text-muted-foreground flex-1 text-2xs">
        {label}
        {detail ? ` · ${detail}` : ''}
      </Text>
    </View>
  );
}

/** Slash commands run in the CLI — a chip, never a chat bubble. */
function LocalCommandItem({ item }: { item: AgentItem }) {
  const label = [stringValue(item.command), stringValue(item.args)].filter(Boolean).join(' ');
  const output = stringValue(item.output);
  if (!label && !output) {
    return null;
  }
  if (!output) {
    return <ActivityRow icon={SquareTerminal} label={label || 'Local command'} />;
  }
  return (
    <ToolCard icon={SquareTerminal} tool="Command" title={label || 'Local command'} status="success">
      <ToolOutput text={boundedTail(output, 20_000, 240)} />
    </ToolCard>
  );
}

/** A plan proposed via ExitPlanMode, kept readable in the transcript. */
function PlanProposalItem({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  const plan = stringValue(item.plan);
  const status = stringValue(item.status);
  return (
    <ToolCard
      icon={ClipboardList}
      tool="Plan"
      title={
        status === 'inProgress'
          ? 'Plan proposed'
          : status === 'failed'
            ? 'Plan not approved'
            : 'Plan approved'
      }
      status={turn.status === 'inProgress' && status === 'inProgress' ? 'running' : 'success'}
      defaultOpen>
      {plan ? <MarkdownView content={plan} /> : null}
    </ToolCard>
  );
}

/** Clarifying questions plus the answers that were given. */
function UserQuestionItem({ item }: { item: AgentItem }) {
  const questions = arrayValue(item.questions).filter(isRecord);
  const answers = isRecord(item.answers) ? item.answers : {};
  return (
    <ToolCard
      icon={MessageCircleQuestion}
      tool="Question"
      title={stringValue(item.status) === 'inProgress' ? 'Waiting for an answer' : 'Answered'}
      status="success"
      defaultOpen>
      <View className="gap-2 px-4 pb-3">
        {questions.map((question, index) => {
          const text = stringValue(question.question);
          const answer = stringValue(answers[text]);
          return (
            <View key={`${item.id}-q-${index}`} className="gap-0.5">
              <Text className="text-muted-foreground text-2xs">{text}</Text>
              {answer ? <Text className="text-foreground text-xs">{`→ ${answer}`}</Text> : null}
            </View>
          );
        })}
      </View>
    </ToolCard>
  );
}

function StatusItem({ item }: { item: AgentItem }) {
  return (
    <ActivityRow
      icon={STATUS_ICON[item.type] ?? Bot}
      label={STATUS_LABEL[item.type] ?? item.type}
      detail={stringValue(item.review) || stringValue(item.path) || null}
    />
  );
}

function SleepItem({ item }: { item: AgentItem }) {
  const durationMs = typeof item.durationMs === 'number' ? item.durationMs : 0;
  return (
    <ActivityRow icon={Timer} label={`Waited ${formatDurationMs(durationMs) ?? '0s'}`} />
  );
}

function HookPromptItem({ item }: { item: AgentItem }) {
  const fragments = arrayValue(item.fragments).filter(isRecord);
  if (fragments.length === 0) {
    return null;
  }
  return (
    <View className="gap-0.5">
      {fragments.map((fragment, index) => (
        <ActivityRow
          key={index}
          icon={Boxes}
          label="Hook prompt"
          detail={stringValue(fragment.text)}
        />
      ))}
    </View>
  );
}

const STATUS_TYPES = new Set([
  'enteredReviewMode',
  'exitedReviewMode',
  'contextCompaction',
  'imageView',
  'imageGeneration',
  'subAgentActivity',
]);

function AgentItemViewImpl({ item, turn }: { item: AgentItem; turn: AgentTurn }) {
  if (item.type === 'userMessage') {
    return <UserMessage item={item} />;
  }
  if (item.type === 'localCommand') {
    return <LocalCommandItem item={item} />;
  }
  if (item.type === 'planProposal') {
    return <PlanProposalItem item={item} turn={turn} />;
  }
  if (item.type === 'userQuestion') {
    return <UserQuestionItem item={item} />;
  }
  if (item.type === 'agentMessage') {
    return <AssistantMessage item={item} turn={turn} />;
  }
  if (item.type === 'reasoning') {
    return <ReasoningItem item={item} turn={turn} />;
  }
  if (item.type === 'commandExecution') {
    return <CommandItem item={item} />;
  }
  if (item.type === 'fileChange') {
    return <FileChangeItem item={item} />;
  }
  if (item.type === 'mcpToolCall' || item.type === 'dynamicToolCall') {
    return <ToolCallItem item={item} />;
  }
  if (item.type === 'webSearch') {
    return <WebSearchItem item={item} turn={turn} />;
  }
  if (item.type === 'plan') {
    return <PlanItem item={item} turn={turn} />;
  }
  if (item.type === 'collabAgentToolCall') {
    return <CollaborationItem item={item} />;
  }
  if (item.type === 'hookPrompt') {
    return <HookPromptItem item={item} />;
  }
  if (item.type === 'sleep') {
    return <SleepItem item={item} />;
  }
  if (STATUS_TYPES.has(item.type)) {
    return <StatusItem item={item} />;
  }
  return (
    <ToolCard
      icon={Braces}
      tool="Agent"
      title={item.type}
      status={turn.status === 'inProgress' ? 'running' : 'success'}>
      <ToolOutput text={boundedTail(prettyJson(item), 40_000, 240)} />
    </ToolCard>
  );
}

export const AgentItemView = React.memo(
  AgentItemViewImpl,
  (previous, next) =>
    previous.item === next.item &&
    previous.turn.status === next.turn.status &&
    previous.turn.durationMs === next.turn.durationMs
);
