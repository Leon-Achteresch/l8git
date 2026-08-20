import {
  ArrowUp,
  Paperclip,
  Settings2,
  Square,
  Sparkles,
} from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Spinner } from '~/components/shared/spinner';
import { useBottomInset } from '~/components/shared/use-bottom-inset';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { pushAgentNotice } from '~/lib/agents/attention';
import type { NativeAgentProvider } from '~/lib/agents/stores';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

import {
  approvalPolicyLabel,
  providerCapabilities,
  providerLabel,
  reasoningEffortLabel,
  sandboxModeLabel,
} from './capabilities';
import type { AgentSettingsSummary } from './settings-sheet';

const MIN_HEIGHT = 40;
const MAX_HEIGHT = 148;

function Chip({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'border-border bg-muted/50 active:bg-accent rounded-full border px-2.5 py-1',
        disabled && 'opacity-50'
      )}>
      <Text numberOfLines={1} className="text-muted-foreground max-w-44 text-2xs font-medium">
        {label}
      </Text>
    </Pressable>
  );
}

export function AgentComposer({
  provider,
  value,
  onChangeText,
  onSend,
  onInterrupt,
  onOpenSettings,
  settings,
  busy,
  disabled,
  sending,
  repoLabel,
}: {
  provider: NativeAgentProvider;
  value: string;
  onChangeText: (next: string) => void;
  onSend: () => void;
  onInterrupt: () => void;
  onOpenSettings: () => void;
  settings: AgentSettingsSummary;
  busy: boolean;
  disabled: boolean;
  sending: boolean;
  repoLabel: string;
}) {
  const [height, setHeight] = React.useState(MIN_HEIGHT);
  const bottomInset = useBottomInset(8);
  const capabilities = providerCapabilities(provider);
  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !disabled && !sending;

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      style={{ paddingBottom: bottomInset }}
      className="border-border bg-background border-t px-3 pt-2.5">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 6, paddingBottom: 8, paddingRight: 8 }}>
        {capabilities.models ? (
          <Chip label={settings.modelLabel} onPress={onOpenSettings} disabled={disabled} />
        ) : null}
        {capabilities.reasoning && settings.efforts.length > 0 ? (
          <Chip
            label={reasoningEffortLabel(settings.reasoningEffort)}
            onPress={onOpenSettings}
            disabled={disabled}
          />
        ) : null}
        {capabilities.approvalPolicy ? (
          <Chip
            label={approvalPolicyLabel(settings.approvalPolicy)}
            onPress={onOpenSettings}
            disabled={disabled}
          />
        ) : null}
        {capabilities.sandbox ? (
          <Chip
            label={sandboxModeLabel(settings.sandboxMode)}
            onPress={onOpenSettings}
            disabled={disabled}
          />
        ) : null}
      </ScrollView>

      <View className="flex-row items-end gap-2">
        <Button
          size="icon"
          variant="ghost"
          accessibilityLabel="Composer settings"
          onPress={onOpenSettings}
          className="h-10 w-10 rounded-full">
          <Icon as={Settings2} size={17} className="text-muted-foreground" />
        </Button>

        <View
          className={cn(
            'border-input bg-muted/40 min-w-0 flex-1 rounded-2xl border px-3 py-1',
            disabled && 'opacity-60'
          )}>
          <TextInput
            value={value}
            editable={!disabled}
            multiline
            onChangeText={onChangeText}
            onContentSizeChange={(event) =>
              setHeight(
                Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, event.nativeEvent.contentSize.height + 16))
              )
            }
            placeholder={
              busy
                ? 'Steer the running turn…'
                : `Message ${providerLabel(provider)} about ${repoLabel}`
            }
            placeholderTextColor={palette.mutedForeground}
            style={{ height, textAlignVertical: 'top' }}
            className="text-foreground py-2 text-sm leading-5"
          />
        </View>

        {busy && capabilities.interrupt ? (
          <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)}>
            <Button
              size="icon"
              variant="outline"
              accessibilityLabel="Interrupt the running turn"
              onPress={onInterrupt}
              className="border-destructive/45 h-10 w-10 rounded-full">
              <Icon as={Square} size={13} className="text-destructive" />
            </Button>
          </Animated.View>
        ) : null}

        <Button
          size="icon"
          accessibilityLabel={busy ? 'Steer the agent' : 'Send message'}
          disabled={!canSend}
          onPress={onSend}
          className="h-10 w-10 rounded-full">
          {sending ? (
            <Spinner size={15} className="text-primary-foreground" />
          ) : (
            <Icon
              as={busy ? Sparkles : ArrowUp}
              size={16}
              className="text-primary-foreground"
            />
          )}
        </Button>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attachments are not available yet"
        onPress={() =>
          pushAgentNotice('File attachments are coming to l8git Remote in a later release.', {
            tone: 'info',
          })
        }
        className="mt-1.5 flex-row items-center gap-1.5 self-start px-1 py-0.5">
        <Icon as={Paperclip} size={10} className="text-muted-foreground/60" />
        <Text className="text-muted-foreground/60 text-2xs">Attachments coming soon</Text>
      </Pressable>
    </Animated.View>
  );
}
