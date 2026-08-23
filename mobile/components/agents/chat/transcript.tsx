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
import { Glass } from '~/components/ui/glass';
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
    <Animated.View entering={FadeIn.duration(200)} className="self-start">
      <Glass
        style={{
          height: 34,
          borderRadius: 17,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}>
        <Spinner size={12} className="text-foreground" />
        <Text className="text-foreground text-xs font-semibold">Working…</Text>
      </Glass>
    </Animated.View>
  );
}

function TurnErrorRow({ message }: { message: string }) {
  return (
    <View className="bg-destructive/12 flex-row items-start gap-2.5 rounded-2xl px-4 py-3">
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
          paddingHorizontal: 16,
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
            className="rounded-full shadow-lg shadow-black/40">
            <Icon as={ArrowDown} size={13} className="text-foreground" />
            <Text className="text-xs font-medium">Jump to latest</Text>
          </Button>
        </Animated.View>
      ) : null}
    </View>
  );
}
