import * as React from 'react';
import { View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { AGENT_PROVIDER_ORDER, providerMeta } from '~/components/agents/agent-meta';
import { AgentSheet, SheetMessage, SheetOption, SoftPill } from '~/components/agents/agent-sheet';
import { middleTruncate, repoName } from '~/components/shared/format';
import { SolidPill } from '~/components/ui/glass';
import { useConnections } from '~/lib/connections';
import { createAgentThread } from '~/lib/agents/overview-actions';
import type { NativeAgentProvider } from '~/lib/agents/stores';
import type { AgentThreadTarget } from '~/components/agents/chat/route';
import { useRepoRegistry } from '~/lib/repo/registry';
import { cn } from '~/lib/utils';

type Step = 'host' | 'repo' | 'provider';

const STEPS: readonly Step[] = ['host', 'repo', 'provider'];

const STEP_LABEL: Record<Step, string> = {
  host: 'Host',
  repo: 'Repository',
  provider: 'Agent',
};

function StepDots({ step }: { step: Step }) {
  const index = STEPS.indexOf(step);
  return (
    <View className="flex-row items-center gap-1.5 pb-2">
      {STEPS.map((value, position) => (
        <View
          key={value}
          className={cn(
            'h-1 rounded-full',
            position === index ? 'bg-foreground w-6' : 'bg-white/15 w-3',
            position < index && 'bg-white/40'
          )}
        />
      ))}
    </View>
  );
}

export function NewThreadSheet({
  visible,
  initialHostId,
  initialPath,
  initialProvider,
  onClose,
  onCreated,
}: {
  visible: boolean;
  initialHostId: string | null;
  initialPath?: string | null;
  initialProvider: NativeAgentProvider;
  onClose: () => void;
  onCreated: (target: AgentThreadTarget) => void;
}) {
  const onlineHostIds = useConnections(
    useShallow((state) =>
      state.hosts
        .filter((host) => state.runtime[host.hostId]?.status === 'online')
        .map((host) => host.hostId)
    )
  );
  const hostNames = useConnections(
    useShallow((state) => Object.fromEntries(state.hosts.map((host) => [host.hostId, host.name])))
  );
  const pathsByHost = useRepoRegistry((state) => state.pathsByHost);

  const onlineHosts = React.useMemo(
    () => onlineHostIds.map((id) => ({ hostId: id, name: hostNames[id] ?? id })),
    [hostNames, onlineHostIds]
  );

  const [hostId, setHostId] = React.useState<string | null>(initialHostId);
  const [path, setPath] = React.useState<string | null>(initialPath ?? null);
  const [provider, setProvider] = React.useState<NativeAgentProvider>(initialProvider);
  const [step, setStep] = React.useState<Step>('host');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const paths = React.useMemo(
    () => (hostId ? (pathsByHost[hostId] ?? []) : []),
    [hostId, pathsByHost]
  );

  const seed = React.useRef({ initialHostId, initialPath, initialProvider });
  seed.current = { initialHostId, initialPath, initialProvider };

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    const connections = useConnections.getState();
    const online = connections.hosts
      .filter((host) => connections.runtime[host.hostId]?.status === 'online')
      .map((host) => host.hostId);
    const current = seed.current;
    const host =
      current.initialHostId && online.includes(current.initialHostId)
        ? current.initialHostId
        : (online[0] ?? null);
    setHostId(host);
    setPath(current.initialPath ?? null);
    setProvider(current.initialProvider);
    setBusy(false);
    setError(null);
    setStep(online.length > 1 ? 'host' : current.initialPath ? 'provider' : 'repo');
  }, [visible]);

  const canContinue =
    step === 'host' ? Boolean(hostId) : step === 'repo' ? Boolean(path) : Boolean(path && hostId);

  const goBack = React.useCallback(() => {
    setError(null);
    setStep((current) => (current === 'provider' ? 'repo' : 'host'));
  }, []);

  const submit = React.useCallback(async () => {
    if (!hostId || !path) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const threadId = await createAgentThread({ hostId, provider, path });
      onCreated({ hostId, provider, threadId, path });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [hostId, onCreated, path, provider]);

  const advance = React.useCallback(() => {
    setError(null);
    if (step === 'host') {
      setStep('repo');
      return;
    }
    if (step === 'repo') {
      setStep('provider');
      return;
    }
    void submit();
  }, [step, submit]);

  const description =
    onlineHosts.length === 0
      ? 'No host is online right now.'
      : `${STEP_LABEL[step]} · step ${STEPS.indexOf(step) + 1} of ${STEPS.length}`;

  return (
    <AgentSheet visible={visible} onClose={onClose} title="New agent thread" description={description}>
      <StepDots step={step} />

      {onlineHosts.length === 0 ? (
        <SheetMessage>
          Pair a host and bring it online before starting a thread. Agent threads run on the
          machine, not on the phone.
        </SheetMessage>
      ) : step === 'host' ? (
        onlineHosts.map((host) => (
          <SheetOption
            key={host.hostId}
            label={host.name}
            description={`${(pathsByHost[host.hostId] ?? []).length} tracked ${
              (pathsByHost[host.hostId] ?? []).length === 1 ? 'repo' : 'repos'
            }`}
            selected={host.hostId === hostId}
            onPress={() => {
              setHostId(host.hostId);
              setPath(null);
            }}
          />
        ))
      ) : step === 'repo' ? (
        paths.length === 0 ? (
          <SheetMessage>
            This host has no tracked repositories yet. Open one from the Repos tab first.
          </SheetMessage>
        ) : (
          paths.map((value) => (
            <SheetOption
              key={value}
              label={repoName(value)}
              description={middleTruncate(value, 46)}
              selected={value === path}
              onPress={() => setPath(value)}
            />
          ))
        )
      ) : (
        AGENT_PROVIDER_ORDER.map((value) => {
          const meta = providerMeta(value);
          return (
            <SheetOption
              key={value}
              label={meta.label}
              description={meta.description}
              selected={value === provider}
              onPress={() => setProvider(value)}
            />
          );
        })
      )}

      {error ? <SheetMessage tone="danger">{error}</SheetMessage> : null}

      <View className="flex-row gap-2.5 pt-2">
        {step !== 'host' ? (
          <SoftPill label="Back" disabled={busy} onPress={goBack} style={{ flex: 1 }} />
        ) : null}
        <SolidPill
          label={busy ? 'Creating…' : step === 'provider' ? 'Create thread' : 'Continue'}
          disabled={!canContinue || busy || onlineHosts.length === 0}
          onPress={advance}
          style={{ flex: 1 }}
        />
      </View>
    </AgentSheet>
  );
}
