import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  MessageSquareText,
  ShieldAlert,
  TriangleAlert,
  X,
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

import { Spinner } from '~/components/shared/spinner';
import { StatusPill, type PillTone } from '~/components/shared/status-pill';
import { Button } from '~/components/ui/button';
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

const STATUS_TONE: Record<ApprovalCardStatus, PillTone> = {
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

const DANGER_SURFACE: Record<ApprovalDanger, string> = {
  normal: 'border-border bg-card/70',
  caution: 'border-warning/35 bg-warning/5',
  danger: 'border-destructive/45 bg-destructive/8',
};

const DANGER_ICON: Record<ApprovalDanger, string> = {
  normal: 'text-muted-foreground',
  caution: 'text-warning',
  danger: 'text-destructive',
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
      <Icon as={glyph} size={16} className={DANGER_ICON[danger]} />
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
    return <Spinner size={16} />;
  }
  if (status === 'pending') {
    return <PendingGlyph danger={danger} questions={questions} />;
  }
  if (status === 'rejected') {
    return <Icon as={X} size={16} className="text-destructive" />;
  }
  return <Icon as={Check} size={16} className="text-success" />;
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
        'flex-row items-start gap-2.5 rounded-xl border px-3 py-2.5',
        selected ? 'border-foreground/30 bg-accent/70' : 'border-border bg-card/40 active:bg-accent/40',
        disabled && 'opacity-50'
      )}>
      <View
        className={cn(
          'mt-0.5 h-4 w-4 items-center justify-center border',
          multiple ? 'rounded-[5px]' : 'rounded-full',
          selected ? 'border-foreground bg-foreground' : 'border-muted-foreground/50'
        )}>
        {selected ? (
          multiple ? (
            <Icon as={Check} size={10} className="text-background" />
          ) : (
            <View className="bg-background h-1.5 w-1.5 rounded-full" />
          )
        ) : null}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-foreground text-sm font-medium">{label}</Text>
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
    <View className="gap-1.5 pt-2.5">
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
          className="mt-0.5 text-sm"
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
            index === current ? 'bg-foreground h-1.5 w-1.5' : 'bg-muted-foreground/40 h-1 w-1'
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
      className={cn(
        'overflow-hidden rounded-3xl border',
        interactive ? DANGER_SURFACE[danger] : 'border-border bg-card/40',
        className
      )}>
      <View className="flex-row items-start gap-2.5 px-3 pb-2 pt-3">
        <View className="pt-0.5">
          <StatusGlyph status={status} danger={danger} questions={list.length > 0} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={2} className="text-foreground text-sm font-semibold">
            {question?.title ?? title}
          </Text>
          {subtitle && !question ? (
            <Text numberOfLines={2} className="text-muted-foreground text-xs leading-4">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {interactive && list.length > 1 ? (
          <Text className="text-muted-foreground/70 font-mono text-2xs">
            {current + 1}/{list.length}
          </Text>
        ) : (
          <StatusPill label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} size="xs" />
        )}
      </View>

      {meta ? <View className="flex-row flex-wrap gap-1.5 px-3 pb-2">{meta}</View> : null}

      {interactive ? (
        <View className="px-3 pb-3">
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
                'mt-2 flex-row items-start gap-2 rounded-xl border px-2.5 py-2',
                danger === 'danger'
                  ? 'border-destructive/30 bg-destructive/10'
                  : 'border-warning/30 bg-warning/8'
              )}>
              <Icon
                as={TriangleAlert}
                size={12}
                className={danger === 'danger' ? 'text-destructive' : 'text-warning'}
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
            <View className="border-destructive/30 bg-destructive/10 mt-2 rounded-xl border px-2.5 py-2">
              <Text className="text-destructive text-2xs leading-4">{error}</Text>
            </View>
          ) : null}

          {question ? (
            <View className="flex-row items-center gap-2 pt-3">
              <Button
                size="icon"
                variant="ghost"
                disabled={busy || current === 0}
                accessibilityLabel="Previous question"
                onPress={() => setStep(Math.max(0, current - 1))}>
                <Icon as={ArrowLeft} size={16} className="text-foreground" />
              </Button>
              <ProgressDots total={list.length} current={current} />
              <View className="flex-1" />
              {onDeny ? (
                <Button size="sm" variant="ghost" disabled={busy} onPress={onDeny}>
                  <Text className="text-muted-foreground text-xs">{denyLabel}</Text>
                </Button>
              ) : null}
              <Button size="sm" disabled={busy || !canContinue} onPress={advance}>
                <Text className="text-xs">{last ? submitLabel : 'Next'}</Text>
                <Icon as={ArrowRight} size={13} className="text-primary-foreground" />
              </Button>
            </View>
          ) : (
            <View className="flex-row flex-wrap items-center gap-2 pt-3">
              {onApprove ? (
                <Button
                  size="sm"
                  variant={danger === 'danger' ? 'destructive' : 'default'}
                  disabled={busy}
                  onPress={onApprove}
                  className="flex-1">
                  <Icon
                    as={Check}
                    size={14}
                    className={danger === 'danger' ? 'text-white' : 'text-primary-foreground'}
                  />
                  <Text className="text-xs">{approveLabel}</Text>
                </Button>
              ) : null}
              {onDeny ? (
                <Button size="sm" variant="outline" disabled={busy} onPress={onDeny}>
                  <Icon as={X} size={14} className="text-foreground" />
                  <Text className="text-xs">{denyLabel}</Text>
                </Button>
              ) : null}
              {onAlwaysAllow && alwaysAllowLabel ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onPress={onAlwaysAllow}
                  className="w-full">
                  <Text className="text-muted-foreground text-xs">{alwaysAllowLabel}</Text>
                </Button>
              ) : null}
            </View>
          )}
        </View>
      ) : (
        <View className="px-3 pb-3">
          <Text className="text-muted-foreground text-xs">
            {resultNote ?? STATUS_LABEL[status]}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
