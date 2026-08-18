import { ArrowDown, ChevronUp, TriangleAlert } from 'lucide-react-native';
import * as React from 'react';
import {
  FlatList,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AgentApprovalCard } from '~/components/agents/approval-card';
import { Spinner } from '~/components/shared/spinner';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import type { NativeAgentProvider } from '~/lib/agents/stores';

import type {
  AgentConversation,
  AgentPendingRequest,
} from '@desktop/lib/agents/types';

import { AgentItemView } from './agent-item';
import { hiddenTurnCount, transcriptRows, type TranscriptRow } from './transcript-rows';

const INITIAL_VISIBLE_TURNS = 24;
const TURN_PAGE_SIZE = 24;
const PILL_THRESHOLD = 260;

function WorkingRow() {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      className="border-git-branch/25 bg-git-branch/[0.06] flex-row items-center gap-2 self-start rounded-full border px-3 py-1.5">
      <Spinner size={12} className="text-git-branch" />
      <Text className="text-git-branch text-xs font-medium">Working…</Text>
    </Animated.View>
  );
}

function TurnErrorRow({ message }: { message: string }) {
  return (
    <View className="border-destructive/30 bg-destructive/[0.07] flex-row items-start gap-2 rounded-xl border px-3 py-2.5">
      <Icon as={TriangleAlert} size={13} className="text-destructive mt-0.5" />
      <Text className="text-destructive flex-1 text-xs leading-5">{message}</Text>
    </View>
  );
}

export function AgentTranscript({
  provider,
  conversation,
  requests,
  scrollSignal,
  header,
  contentBottomInset = 12,
}: {
  provider: NativeAgentProvider;
  conversation: AgentConversation | undefined;
  requests: readonly AgentPendingRequest[];
  scrollSignal: number;
  header?: React.ReactNode;
  contentBottomInset?: number;
}) {
  const listRef = React.useRef<FlatList<TranscriptRow>>(null);
  const [visibleTurns, setVisibleTurns] = React.useState(INITIAL_VISIBLE_TURNS);
  const [awayFromBottom, setAwayFromBottom] = React.useState(false);
  const threadId = conversation?.threadId ?? null;

  React.useEffect(() => {
    setVisibleTurns(INITIAL_VISIBLE_TURNS);
    setAwayFromBottom(false);
  }, [threadId]);

  const rows = React.useMemo(
    () => transcriptRows(conversation, requests, visibleTurns),
    [conversation, requests, visibleTurns]
  );

  const data = React.useMemo(() => [...rows].reverse(), [rows]);
  const hidden = hiddenTurnCount(conversation, visibleTurns);

  const scrollToBottom = React.useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setAwayFromBottom(false);
  }, []);

  React.useEffect(() => {
    if (scrollSignal === 0) {
      return;
    }
    scrollToBottom();
  }, [scrollSignal, scrollToBottom]);

  const onScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setAwayFromBottom(event.nativeEvent.contentOffset.y > PILL_THRESHOLD);
  }, []);

  const renderItem = React.useCallback(
    ({ item: row }: { item: TranscriptRow }) => {
      if (row.kind === 'item') {
        return <AgentItemView item={row.item} turn={row.turn} />;
      }
      if (row.kind === 'turn-error') {
        return <TurnErrorRow message={row.message} />;
      }
      if (row.kind === 'working') {
        return <WorkingRow />;
      }
      return <AgentApprovalCard provider={provider} request={row.request} />;
    },
    [provider]
  );

  return (
    <View className="flex-1">
      <FlatList
        ref={listRef}
        inverted
        data={data}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        onScroll={onScroll}
        scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={11}
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingTop: contentBottomInset,
          paddingBottom: 8,
          gap: 12,
        }}
        ListFooterComponent={
          <View className="gap-3 pb-2">
            {header}
            {hidden > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onPress={() => setVisibleTurns((count) => count + TURN_PAGE_SIZE)}
                className="self-center rounded-full">
                <Icon as={ChevronUp} size={12} className="text-muted-foreground" />
                <Text className="text-xs">
                  Show {Math.min(TURN_PAGE_SIZE, hidden)} older turns
                </Text>
              </Button>
            ) : null}
          </View>
        }
      />

      {awayFromBottom ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          className="absolute bottom-3 self-center">
          <Button
            size="sm"
            variant="secondary"
            onPress={scrollToBottom}
            className="border-border rounded-full border shadow-lg shadow-black/40">
            <Icon as={ArrowDown} size={13} className="text-foreground" />
            <Text className="text-xs font-medium">Jump to latest</Text>
          </Button>
        </Animated.View>
      ) : null}
    </View>
  );
}
