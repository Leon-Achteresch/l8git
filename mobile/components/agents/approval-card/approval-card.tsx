import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  MessageSquareText,
  ShieldAlert,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInRight,
  FadeOutLeft,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { SoftPill } from '~/components/agents/agent-sheet';
import { Spinner } from '~/components/shared/spinner';
import { GlassCircle, SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

import {
  answersComplete,
  isAnswered,
  EMPTY_ANSWER,
  type ApprovalAnswer,
  type ApprovalAnswers,
  type ApprovalDanger,
  type ApprovalQuestion,
} from './request-model';

export type ApprovalCardStatus = 'pending' | 'submitting' | 'approved' | 'rejected' | 'answered';

export type ApprovalTagTone =
  | 'neutral'
  | 'accent'
  | 'warning'
  | 'info'
  | 'success'
  | 'danger'
  | 'branch'
  | 'modified';

const TAG_SURFACE: Record<ApprovalTagTone, string> = {
  neutral: 'bg-white/[0.06]',
  accent: 'bg-white/10',
  warning: 'bg-warning/15',
  info: 'bg-git-branch/15',
  success: 'bg-success/15',
  danger: 'bg-destructive/15',
  branch: 'bg-git-branch/15',
  modified: 'bg-git-modified/15',
};

const TAG_TEXT: Record<ApprovalTagTone, string> = {
  neutral: 'text-muted-foreground',
  accent: 'text-foreground',
  warning: 'text-warning',
  info: 'text-git-branch',
  success: 'text-success',
  danger: 'text-destructive',
  branch: 'text-git-branch',
  modified: 'text-git-modified',
};

export function ApprovalTag({
  label,
  tone = 'neutral',
  icon,
  mono = false,
}: {
  label: string;
  tone?: ApprovalTagTone;
  icon?: LucideIcon;
  mono?: boolean;
}) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1 rounded-full px-2.5 py-1',
        TAG_SURFACE[tone]
      )}>
      {icon ? <Icon as={icon} size={10} className={TAG_TEXT[tone]} /> : null}
      <Text
        numberOfLines={1}
        className={cn('text-2xs font-semibold', mono && 'font-mono', TAG_TEXT[tone])}>
        {label}
      </Text>
    </View>
  );
}

const STATUS_TONE: Record<ApprovalCardStatus, ApprovalTagTone> = {
  pending: 'warning',
  submitting: 'info',
  approved: 'success',
  rejected: 'danger',
  answered: 'success',
};

const STATUS_LABEL: Record<ApprovalCardStatus, string> = {
  pending: 'Action required',
  submitting: 'Sending',
  approved: 'Approved',
  rejected: 'Denied',
  answered: 'Answered',
};

const DANGER_ICON: Record<ApprovalDanger, string> = {
  normal: 'text-foreground',
  caution: 'text-warning',
  danger: 'text-destructive',
};

const DANGER_GLYPH_SURFACE: Record<ApprovalDanger, string> = {
  normal: 'bg-white/10',
  caution: 'bg-warning/15',
  danger: 'bg-destructive/15',
};

function PendingGlyph({ danger, questions }: { danger: ApprovalDanger; questions: boolean }) {
  const pulse = useSharedValue(0);

  React.useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1_400 }), -1, true);
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.value * 0.45 }));

  const glyph = danger === 'danger' ? ShieldAlert : questions ? CircleHelp : MessageSquareText;

  return (
    <Animated.View style={style}>
      <Icon as={glyph} size={17} className={DANGER_ICON[danger]} />
    </Animated.View>
  );
}

function StatusGlyph({
  status,
  danger,
  questions,
}: {
  status: ApprovalCardStatus;
  danger: ApprovalDanger;
  questions: boolean;
}) {
  if (status === 'submitting') {
    return <Spinner size={17} />;
  }
  if (status === 'pending') {
    return <PendingGlyph danger={danger} questions={questions} />;
  }
  if (status === 'rejected') {
    return <Icon as={X} size={17} className="text-destructive" />;
  }
  return <Icon as={Check} size={17} className="text-success" />;
}

function OptionButton({
  label,
  description,
  selected,
  disabled,
  multiple,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  disabled: boolean;
  multiple: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'flex-row items-start gap-3 rounded-2xl px-4 py-3',
        selected ? 'bg-white/10' : 'bg-white/[0.04] active:bg-white/[0.08]',
        disabled && 'opacity-50'
      )}>
      <View
        className={cn(
          'mt-0.5 h-5 w-5 items-center justify-center',
          multiple ? 'rounded-md' : 'rounded-full',
          selected ? 'bg-foreground' : 'bg-white/10'
        )}>
        {selected ? (
          multiple ? (
            <Icon as={Check} size={12} className="text-background" />
          ) : (
            <View className="bg-background h-2 w-2 rounded-full" />
          )
        ) : null}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-foreground text-sm font-semibold">{label}</Text>
        {description ? (
          <Text className="text-muted-foreground text-xs leading-4">{description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function QuestionBody({
  question,
  answer,
  disabled,
  onChange,
}: {
  question: ApprovalQuestion;
  answer: ApprovalAnswer;
  disabled: boolean;
  onChange: (next: ApprovalAnswer) => void;
}) {
  const toggle = (value: string) => {
    if (question.multiple) {
      const selected = answer.selected.includes(value)
        ? answer.selected.filter((item) => item !== value)
        : [...answer.selected, value];
      onChange({ ...answer, selected });
      return;
    }
    onChange({ selected: [value], custom: '' });
  };

  return (
    <View className="gap-2 pt-2">
      {question.description ? (
        <Text className="text-muted-foreground pb-1 text-xs leading-4">{question.description}</Text>
      ) : null}
      {question.options.map((option) => (
        <OptionButton
          key={option.value}
          label={option.label}
          description={option.description}
          multiple={question.multiple}
          disabled={disabled}
          selected={answer.selected.includes(option.value)}
          onPress={() => toggle(option.value)}
        />
      ))}
      {question.allowCustom ? (
        <Input
          value={answer.custom ?? ''}
          editable={!disabled}
          secureTextEntry={question.secret}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={question.customPlaceholder ?? 'Type an answer'}
          onChangeText={(custom) =>
            onChange({ selected: question.multiple ? answer.selected : [], custom })
          }
          className="bg-white/[0.06] mt-0.5 text-sm"
        />
      ) : null}
    </View>
  );
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      {Array.from({ length: total }).map((_, index) => (
        <View
          key={index}
          className={cn(
            'rounded-full',
            index === current ? 'bg-foreground h-1.5 w-4' : 'bg-white/20 h-1.5 w-1.5'
          )}
        />
      ))}
    </View>
  );
}

export interface ApprovalCardProps {
  title: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  status?: ApprovalCardStatus;
  danger?: ApprovalDanger;
  dangerNotes?: readonly string[];
  children?: React.ReactNode;
  questions?: readonly ApprovalQuestion[];
  submitLabel?: string;
  approveLabel?: string;
  alwaysAllowLabel?: string;
  denyLabel?: string;
  onSubmit?: (answers: ApprovalAnswers) => void;
  onApprove?: () => void;
  onAlwaysAllow?: () => void;
  onDeny?: () => void;
  resultNote?: string | null;
  error?: string | null;
  className?: string;
}

export function ApprovalCard({
  title,
  subtitle,
  meta,
  status = 'pending',
  danger = 'normal',
  dangerNotes,
  children,
  questions,
  submitLabel = 'Send answer',
  approveLabel = 'Approve',
  alwaysAllowLabel,
  denyLabel = 'Deny',
  onSubmit,
  onApprove,
  onAlwaysAllow,
  onDeny,
  resultNote,
  error,
  className,
}: ApprovalCardProps) {
  const list = questions ?? [];
  const [answers, setAnswers] = React.useState<ApprovalAnswers>({});
  const [step, setStep] = React.useState(0);

  const busy = status === 'submitting';
  const interactive = status === 'pending' || busy;
  const current = Math.min(step, Math.max(0, list.length - 1));
  const question = list[current];
  const answer = question ? (answers[question.id] ?? EMPTY_ANSWER) : EMPTY_ANSWER;
  const last = current === list.length - 1;
  const canContinue = Boolean(question?.optional) || isAnswered(answer);

  const advance = () => {
    if (!last) {
      setStep(current + 1);
      return;
    }
    if (answersComplete(list, answers)) {
      onSubmit?.(answers);
    }
  };

  return (
    <Animated.View
      layout={LinearTransition.duration(220)}
      className={cn('bg-card overflow-hidden rounded-[28px]', !interactive && 'opacity-80', className)}>
      <View className="flex-row items-start gap-3 px-4 pb-2 pt-4">
        <View
          className={cn(
            'h-10 w-10 items-center justify-center rounded-full',
            interactive ? DANGER_GLYPH_SURFACE[danger] : 'bg-white/[0.06]'
          )}>
          <StatusGlyph status={status} danger={danger} questions={list.length > 0} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5 pt-0.5">
          <Text numberOfLines={2} className="text-foreground text-base font-semibold leading-5">
            {question?.title ?? title}
          </Text>
          {subtitle && !question ? (
            <Text numberOfLines={2} className="text-muted-foreground text-xs leading-4">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {interactive && list.length > 1 ? (
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-muted-foreground/70 pt-1 font-mono text-2xs">
            {current + 1}/{list.length}
          </Text>
        ) : (
          <ApprovalTag label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
        )}
      </View>

      {meta ? <View className="flex-row flex-wrap gap-1.5 px-4 pb-2">{meta}</View> : null}

      {interactive ? (
        <View className="px-4 pb-4">
          {question ? (
            <Animated.View
              key={question.id}
              entering={FadeInRight.duration(180)}
              exiting={FadeOutLeft.duration(140)}>
              <QuestionBody
                question={question}
                answer={answer}
                disabled={busy}
                onChange={(next) => setAnswers((state) => ({ ...state, [question.id]: next }))}
              />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(160)} className="gap-2">
              {children}
            </Animated.View>
          )}

          {danger !== 'normal' && dangerNotes && dangerNotes.length > 0 ? (
            <View
              className={cn(
                'mt-2.5 flex-row items-start gap-2 rounded-2xl px-3.5 py-2.5',
                danger === 'danger' ? 'bg-destructive/12' : 'bg-warning/12'
              )}>
              <Icon
                as={TriangleAlert}
                size={13}
                className={cn('mt-px', danger === 'danger' ? 'text-destructive' : 'text-warning')}
              />
              <Text
                className={cn(
                  'flex-1 text-2xs leading-4',
                  danger === 'danger' ? 'text-destructive' : 'text-warning'
                )}>
                {dangerNotes.join(' · ')}
              </Text>
            </View>
          ) : null}

          {error ? (
            <View className="bg-destructive/12 mt-2.5 rounded-2xl px-3.5 py-2.5">
              <Text className="text-destructive text-2xs leading-4">{error}</Text>
            </View>
          ) : null}

          {question ? (
            <View className="flex-row items-center gap-2.5 pt-4">
              <GlassCircle
                icon={ArrowLeft}
                size={40}
                label="Previous question"
                onPress={busy || current === 0 ? undefined : () => setStep(Math.max(0, current - 1))}
                style={{ opacity: busy || current === 0 ? 0.4 : 1 }}
              />
              <ProgressDots total={list.length} current={current} />
              <View className="flex-1" />
              {onDeny ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={denyLabel}
                  disabled={busy}
                  onPress={onDeny}
                  className="active:opacity-70 px-3 py-2">
                  <Text className="text-muted-foreground text-sm font-medium">{denyLabel}</Text>
                </Pressable>
              ) : null}
              <SolidPill
                icon={ArrowRight}
                label={last ? submitLabel : 'Next'}
                disabled={busy || !canContinue}
                onPress={advance}
                style={{ height: 44, borderRadius: 22, paddingHorizontal: 18 }}
              />
            </View>
          ) : (
            <View className="gap-2 pt-4">
              <View className="flex-row items-center gap-2.5">
                {onApprove ? (
                  <SolidPill
                    icon={Check}
                    label={approveLabel}
                    disabled={busy}
                    onPress={onApprove}
                    style={{ flex: 1 }}
                  />
                ) : null}
                {onDeny ? (
                  <SoftPill
                    icon={X}
                    label={denyLabel}
                    tone="danger"
                    disabled={busy}
                    onPress={onDeny}
                    style={onApprove ? undefined : { flex: 1 }}
                  />
                ) : null}
              </View>
              {onAlwaysAllow && alwaysAllowLabel ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={alwaysAllowLabel}
                  disabled={busy}
                  onPress={onAlwaysAllow}
                  className="active:opacity-70 items-center py-2">
                  <Text className="text-muted-foreground text-xs font-medium">
                    {alwaysAllowLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : (
        <View className="px-4 pb-4">
          <Text className="text-muted-foreground text-xs">
            {resultNote ?? STATUS_LABEL[status]}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
