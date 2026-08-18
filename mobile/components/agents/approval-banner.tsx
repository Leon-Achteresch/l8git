import { useRouter, usePathname } from 'expo-router';
import { Check, ShieldAlert, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  approvalTitle,
  commandOf,
  dangerLevel,
  decisionPayload,
  supportsQuickDecision,
} from '~/components/agents/approval-card';
import { useOpenAgentThread } from '~/components/agents/chat/route';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { agentApprovalHaptic, useAgentNotices } from '~/lib/agents/attention';
import { usePendingApprovals, type PendingApproval } from '~/lib/agents/approvals';
import { tryChatStore } from '~/lib/agents/stores';
import { useRemoteOps } from '~/lib/repo/remote-ops';
import { cn } from '~/lib/utils';

const BANNER_TTL_MS = 9_000;
const PROGRESS_OFFSET = 76;
const NOTICE_OFFSET = 56;

function previewOf(approval: PendingApproval): string {
  const command = commandOf(approval.request);
  if (command) {
    return command.replace(/\s+/g, ' ').trim();
  }
  return approval.request.reason ?? approval.threadTitle;
}

export function ApprovalBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const openAgentThread = useOpenAgentThread();
  const insets = useSafeAreaInsets();
  const approvals = usePendingApprovals();
  const notices = useAgentNotices((state) => state.notices.length);
  const progressVisible = useRemoteOps((state) => state.ops.length > 0 || state.result !== null);

  const seen = React.useRef<Set<string>>(new Set());
  const primed = React.useRef(false);
  const [active, setActive] = React.useState<PendingApproval | null>(null);
  const [busy, setBusy] = React.useState(false);

  const onApprovalsRoute = pathname === '/agents/approvals';
  const atMount = React.useRef(approvals);

  React.useEffect(() => {
    for (const approval of atMount.current) {
      seen.current.add(approval.key);
    }
    primed.current = true;
  }, []);

  React.useEffect(() => {
    if (!primed.current) {
      return;
    }
    const keys = new Set(approvals.map((approval) => approval.key));
    for (const key of [...seen.current]) {
      if (!keys.has(key)) {
        seen.current.delete(key);
      }
    }
    const fresh = approvals.find((approval) => !seen.current.has(approval.key));
    if (!fresh) {
      return;
    }
    for (const approval of approvals) {
      seen.current.add(approval.key);
    }
    const viewingThread =
      pathname.includes(fresh.threadId) || pathname.includes(encodeURIComponent(fresh.threadId));
    if (onApprovalsRoute || viewingThread) {
      return;
    }
    setBusy(false);
    setActive(fresh);
    agentApprovalHaptic();
  }, [approvals, onApprovalsRoute, pathname]);

  React.useEffect(() => {
    if (!active) {
      return;
    }
    if (!approvals.some((approval) => approval.key === active.key)) {
      setActive(null);
      return;
    }
    const timer = setTimeout(() => setActive(null), BANNER_TTL_MS);
    return () => clearTimeout(timer);
  }, [active, approvals]);

  React.useEffect(() => {
    if (onApprovalsRoute) {
      setActive(null);
    }
  }, [onApprovalsRoute]);

  if (!active) {
    return null;
  }

  const danger = dangerLevel(active.request);
  const quick = supportsQuickDecision(active.request);

  const decide = (decision: 'accept' | 'decline') => {
    const state = tryChatStore(active.provider)?.getState();
    if (!state) {
      return;
    }
    agentApprovalHaptic();
    setBusy(true);
    void state
      .respondToRequest(active.request, decisionPayload(active.request, decision))
      .catch(() => undefined)
      .finally(() => {
        setBusy(false);
        setActive(null);
      });
  };

  const open = () => {
    setActive(null);
    if (!active.path) {
      router.push('/agents/approvals');
      return;
    }
    openAgentThread({
      hostId: active.hostId,
      provider: active.provider,
      threadId: active.threadId,
      path: active.path,
    });
  };

  return (
    <Animated.View
      entering={SlideInUp.duration(260).springify().damping(20)}
      exiting={FadeOutUp.duration(160)}
      pointerEvents="box-none"
      style={{
        top:
          insets.top +
          6 +
          (progressVisible ? PROGRESS_OFFSET : 0) +
          notices * NOTICE_OFFSET,
      }}
      className="absolute left-3 right-3 z-50">
      <View
        className={cn(
          'overflow-hidden rounded-2xl border shadow-lg shadow-black/50',
          danger === 'danger'
            ? 'border-destructive/50 bg-destructive/12'
            : 'border-warning/45 bg-popover'
        )}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open thread" onPress={open}>
          <View className="flex-row items-start gap-2.5 px-3 pb-2 pt-2.5">
            <Icon
              as={ShieldAlert}
              size={15}
              className={danger === 'danger' ? 'text-destructive' : 'text-warning'}
            />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text numberOfLines={1} className="text-foreground text-xs font-semibold">
                {approvalTitle(active.request)}
              </Text>
              <Text numberOfLines={1} className="text-muted-foreground font-mono text-2xs">
                {previewOf(active)}
              </Text>
              <Text numberOfLines={1} className="text-muted-foreground/70 text-2xs">
                {active.repoName} · {active.hostName}
              </Text>
            </View>
            <Pressable
              hitSlop={10}
              accessibilityLabel="Dismiss"
              onPress={() => setActive(null)}
              className="pt-0.5">
              <Icon as={X} size={14} className="text-muted-foreground" />
            </Pressable>
          </View>
        </Pressable>

        <View className="border-border/60 flex-row items-center gap-2 border-t px-3 py-2">
          {quick ? (
            <>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => decide('accept')}
                className={cn(
                  'flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2',
                  danger === 'danger' ? 'bg-destructive/25' : 'bg-primary',
                  busy && 'opacity-50'
                )}>
                <Icon
                  as={Check}
                  size={13}
                  className={danger === 'danger' ? 'text-destructive' : 'text-primary-foreground'}
                />
                <Text
                  className={cn(
                    'text-xs font-semibold',
                    danger === 'danger' ? 'text-destructive' : 'text-primary-foreground'
                  )}>
                  {danger === 'danger' ? 'Approve anyway' : 'Approve'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => decide('decline')}
                className={cn(
                  'border-border flex-row items-center justify-center gap-1.5 rounded-lg border px-3 py-2',
                  busy && 'opacity-50'
                )}>
                <Icon as={X} size={13} className="text-foreground" />
                <Text className="text-foreground text-xs font-medium">Deny</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={open}
              className="bg-primary flex-1 items-center rounded-lg py-2">
              <Text className="text-primary-foreground text-xs font-semibold">Answer now</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setActive(null);
              router.push('/agents/approvals');
            }}
            className="px-2 py-2">
            <Text className="text-muted-foreground text-xs">Inbox</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}
