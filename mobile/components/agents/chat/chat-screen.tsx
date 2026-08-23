import { useFocusEffect, useRouter } from 'expo-router';
import { PlugZap, TriangleAlert, WifiOff } from 'lucide-react-native';
import * as React from 'react';
import { Image } from 'expo-image';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/empty-state';
import { SkeletonList } from '~/components/skeleton-list';
import { repoName } from '~/components/shared/format';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { illustrationsLarge } from '~/lib/illustrations';
import {
  agentApprovalHaptic,
  agentAttentionHaptic,
  agentSendHaptic,
  isAppFocused,
  pushAgentNotice,
} from '~/lib/agents/attention';
import { tryChatStore, useChatStore, type NativeAgentProvider } from '~/lib/agents/stores';
import { useAgentConnection } from '~/lib/agents/use-agent-connection';

import {
  agentComposerDraftKey,
  loadAgentComposerDraft,
  saveAgentComposerDraft,
} from '@desktop/lib/agents/composer-drafts';
import type {
  AgentConversation,
  AgentPendingRequest,
  AgentTokenUsage,
} from '@desktop/lib/agents/types';

import { providerCapabilities, providerLabel } from './capabilities';
import { AgentChatHeader, type AgentTurnState } from './chat-header';
import { AgentComposer } from './composer';
import { bindAgentThreadTarget } from './route';
import { AgentSettingsSheet, useAgentSettings } from './settings-sheet';
import { AgentTranscript } from './transcript';
import { AgentUsageFooter } from './usage-footer';

const NO_REQUESTS: AgentPendingRequest[] = [];

const STARTERS = [
  'Summarise the current diff and flag anything risky.',
  'Implement the next task and keep the change small.',
  'Review the working tree like a senior engineer.',
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function StarterCard({ onPick }: { onPick: (text: string) => void }) {
  return (
    <View className="bg-card/80 gap-2 rounded-3xl p-3.5">
      <Text className="text-muted-foreground text-2xs font-medium uppercase tracking-widest">
        Quick starts
      </Text>
      {STARTERS.map((starter) => (
        <Button
          key={starter}
          variant="ghost"
          size="sm"
          onPress={() => onPick(starter)}
          className="h-auto justify-start rounded-lg px-2 py-2">
          <Text numberOfLines={2} className="text-foreground/85 flex-1 text-xs leading-5">
            {starter}
          </Text>
        </Button>
      ))}
    </View>
  );
}

export function AgentChatScreen({
  hostId,
  provider,
  threadId,
  path,
}: {
  hostId: string;
  provider: NativeAgentProvider;
  threadId: string | null;
  path: string;
}) {
  const router = useRouter();
  const connection = useAgentConnection(hostId);
  const settings = useAgentSettings(provider);
  const capabilities = providerCapabilities(provider);

  const draftKey = agentComposerDraftKey(`${provider}:${path}`, threadId);
  const [draft, setDraft] = React.useState(() => loadAgentComposerDraft(draftKey).text);
  const [sending, setSending] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [scrollSignal, setScrollSignal] = React.useState(0);

  React.useEffect(() => {
    bindAgentThreadTarget({ hostId, provider, threadId, path });
  }, [hostId, path, provider, threadId]);

  React.useEffect(() => {
    const timer = setTimeout(
      () => saveAgentComposerDraft(draftKey, { text: draft, attachments: [] }),
      300
    );
    return () => clearTimeout(timer);
  }, [draft, draftKey]);

  const conversation = useChatStore<AgentConversation | undefined>(
    provider,
    (state) => (threadId ? state.conversations[threadId] : undefined),
    undefined
  );
  const threadRequests = useChatStore<AgentPendingRequest[]>(
    provider,
    (state) => (threadId ? (state.requestsByThread[threadId] ?? NO_REQUESTS) : NO_REQUESTS),
    NO_REQUESTS
  );
  const globalRequests = useChatStore<AgentPendingRequest[]>(
    provider,
    (state) => state.requestsByThread.__global ?? NO_REQUESTS,
    NO_REQUESTS
  );
  const requiresAuth = useChatStore(provider, (state) => state.requiresAuth, false);
  const loginStatus = useChatStore(provider, (state) => state.loginStatus, 'idle' as const);
  const sessionStatus = useChatStore(
    provider,
    (state) => (threadId ? (state.sessionStatusByThread[threadId] ?? 'idle') : 'idle'),
    'idle' as const
  );

  const requests = React.useMemo(
    () => (capabilities.approvals ? [...threadRequests, ...globalRequests] : []),
    [capabilities.approvals, globalRequests, threadRequests]
  );

  const activeTurnId = conversation?.activeTurnId ?? null;
  const busy = Boolean(activeTurnId);
  const bound = connection.status === 'ready';
  const usage: AgentTokenUsage | null = conversation?.tokenUsage ?? null;

  React.useEffect(() => {
    if (!bound || !threadId) {
      return;
    }
    const store = tryChatStore(provider);
    if (!store) {
      return;
    }
    void store
      .getState()
      .openThread(path, threadId)
      .catch((error: unknown) => pushAgentNotice(errorMessage(error), { tone: 'attention' }));
  }, [bound, path, provider, threadId]);

  useFocusEffect(
    React.useCallback(() => {
      const store = tryChatStore(provider);
      store?.getState().setVisibleThread(threadId);
      return () => {
        tryChatStore(provider)?.getState().setVisibleThread(null);
      };
    }, [provider, threadId])
  );

  const previousTurn = React.useRef<string | null>(activeTurnId);
  React.useEffect(() => {
    if (previousTurn.current && !activeTurnId && isAppFocused()) {
      agentAttentionHaptic();
    }
    previousTurn.current = activeTurnId;
  }, [activeTurnId]);

  const previousRequests = React.useRef(0);
  React.useEffect(() => {
    if (requests.length > previousRequests.current && isAppFocused()) {
      agentApprovalHaptic();
    }
    previousRequests.current = requests.length;
  }, [requests.length]);

  const send = React.useCallback(() => {
    const text = draft.trim();
    const store = tryChatStore(provider);
    if (!text || !store) {
      return;
    }
    agentSendHaptic();
    setDraft('');
    saveAgentComposerDraft(draftKey, { text: '', attachments: [] });
    setSending(true);
    setScrollSignal((value) => value + 1);
    const state = store.getState();
    const task =
      busy && threadId && capabilities.steer
        ? state.steerMessage(threadId, text)
        : state.sendMessage(path, text);
    void task
      .then(() => {
        if (threadId) {
          return;
        }
        const created = tryChatStore(provider)?.getState().activeThreadByPath[path];
        if (created) {
          router.setParams({ thread: created });
        }
      })
      .catch((error: unknown) => {
        setDraft(text);
        pushAgentNotice(errorMessage(error), { tone: 'attention' });
      })
      .finally(() => setSending(false));
  }, [busy, capabilities.steer, draft, draftKey, path, provider, router, threadId]);

  const interrupt = React.useCallback(() => {
    const store = tryChatStore(provider);
    if (!store || !threadId) {
      return;
    }
    agentApprovalHaptic();
    void store
      .getState()
      .interrupt(threadId)
      .catch((error: unknown) => pushAgentNotice(errorMessage(error), { tone: 'attention' }));
  }, [provider, threadId]);

  const login = React.useCallback(() => {
    const store = tryChatStore(provider);
    if (!store) {
      return;
    }
    void store
      .getState()
      .startLogin()
      .then((url) => (url ? Linking.openURL(url) : undefined))
      .catch((error: unknown) => pushAgentNotice(errorMessage(error), { tone: 'attention' }));
  }, [provider]);

  const turnState: AgentTurnState = busy
    ? 'working'
    : connection.status === 'offline'
      ? 'offline'
      : connection.status === 'error'
        ? 'error'
        : connection.status === 'connecting'
          ? 'connecting'
          : sessionStatus === 'ready'
            ? 'ready'
            : sessionStatus === 'error'
              ? 'error'
              : sessionStatus === 'connecting'
                ? 'connecting'
                : 'idle';

  const subtitle = [
    connection.hostName ?? hostId,
    repoName(path),
    providerLabel(provider),
  ]
    .filter(Boolean)
    .join(' · ');

  const body = () => {
    if (connection.status === 'offline') {
      return (
        <EmptyState
          icon={WifiOff}
          title="Host is offline"
          description="Reconnect to this host to resume the conversation."
          action={
            <Button variant="outline" size="sm" onPress={connection.reconnect}>
              <Text>Retry</Text>
            </Button>
          }
        />
      );
    }
    if (connection.status === 'error') {
      return (
        <EmptyState
          icon={TriangleAlert}
          title={`${providerLabel(provider)} could not start`}
          description={connection.error ?? 'The agent process reported an error on the host.'}
          action={
            <Button variant="outline" size="sm" onPress={connection.reconnect}>
              <Text>Try again</Text>
            </Button>
          }
        />
      );
    }
    if (requiresAuth) {
      return (
        <EmptyState
          icon={PlugZap}
          title={`Sign in to ${providerLabel(provider)}`}
          description="Authentication runs on the host. Opening the link finishes the flow in your browser."
          action={
            <Button
              size="sm"
              disabled={loginStatus === 'starting' || loginStatus === 'waiting'}
              onPress={login}>
              <Text>{loginStatus === 'waiting' ? 'Waiting for sign-in…' : 'Start sign-in'}</Text>
            </Button>
          }
        />
      );
    }
    if (connection.status !== 'ready' || (threadId && !conversation)) {
      return (
        <View className="flex-1 px-4 pt-4">
          <SkeletonList rows={5} avatar />
        </View>
      );
    }

    const empty = (conversation?.turns.length ?? 0) === 0 && requests.length === 0;

    return (
      <AgentTranscript
        provider={provider}
        conversation={conversation}
        requests={requests}
        scrollSignal={scrollSignal}
        header={
          empty ? (
            <View className="gap-4 py-6">
              <EmptyState
                illustration="agent"
                className="flex-none py-2"
                title={`Talk to ${providerLabel(provider)}`}
                description={`A fresh conversation in ${repoName(path)}.`}
              />
              <StarterCard onPick={setDraft} />
            </View>
          ) : null
        }
      />
    );
  };

  return (
    <View className="bg-background flex-1">
      <Image
        source={illustrationsLarge.agent}
        contentFit="cover"
        blurRadius={60}
        style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
      <SafeAreaView edges={['top']} className="flex-1">
      <AgentChatHeader
        provider={provider}
        title={conversation?.title ?? 'New conversation'}
        subtitle={subtitle}
        turnState={turnState}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/agents'))}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1">{body()}</View>

        <AgentUsageFooter usage={usage} model={conversation?.model ?? settings.model} />

        <AgentComposer
          provider={provider}
          value={draft}
          onChangeText={setDraft}
          onSend={send}
          onInterrupt={interrupt}
          onOpenSettings={() => setSettingsOpen(true)}
          settings={settings}
          busy={busy}
          sending={sending}
          disabled={connection.status !== 'ready' || requiresAuth}
          repoLabel={repoName(path)}
        />
      </KeyboardAvoidingView>

      <AgentSettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        provider={provider}
        locked={(conversation?.turns.length ?? 0) > 0}
      />
      </SafeAreaView>
    </View>
  );
}
