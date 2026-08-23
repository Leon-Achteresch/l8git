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
import { Glass, SolidPill } from '~/components/ui/glass';
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
      className="absolute left-4 right-4 z-50">
      <Glass
        intensity={50}
        style={{
          borderRadius: 28,
          backgroundColor:
            danger === 'danger' ? 'rgba(255,69,58,0.16)' : 'rgba(28,28,32,0.78)',
          shadowColor: '#000',
          shadowOpacity: 0.5,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open thread" onPress={open}>
          <View className="flex-row items-start gap-3 px-4 pb-3 pt-4">
            <View
              className={cn(
                'h-9 w-9 items-center justify-center rounded-full',
                danger === 'danger' ? 'bg-destructive/20' : 'bg-warning/15'
              )}>
              <Icon
                as={ShieldAlert}
                size={16}
                className={danger === 'danger' ? 'text-destructive' : 'text-warning'}
              />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
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
              className="bg-white/10 h-7 w-7 items-center justify-center rounded-full">
              <Icon as={X} size={13} className="text-foreground" />
            </Pressable>
          </View>
        </Pressable>

        <View className="border-white/5 flex-row items-center gap-2 border-t px-4 py-3">
          {quick ? (
            <>
              <SolidPill
                icon={Check}
                label={danger === 'danger' ? 'Approve anyway' : 'Approve'}
                disabled={busy}
                onPress={() => decide('accept')}
                style={{ flex: 1, height: 42, borderRadius: 21, paddingHorizontal: 14 }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Deny"
                disabled={busy}
                onPress={() => decide('decline')}
                className={cn(
                  'bg-white/10 active:bg-white/15 h-[42px] flex-row items-center justify-center gap-1.5 rounded-full px-4',
                  busy && 'opacity-50'
                )}>
                <Icon as={X} size={14} className="text-destructive" />
                <Text className="text-destructive text-sm font-semibold">Deny</Text>
              </Pressable>
            </>
          ) : (
            <SolidPill
              label="Answer now"
              onPress={open}
              style={{ flex: 1, height: 42, borderRadius: 21, paddingHorizontal: 14 }}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open approvals inbox"
            onPress={() => {
              setActive(null);
              router.push('/agents/approvals');
            }}
            className="active:opacity-70 px-2.5 py-2">
            <Text className="text-muted-foreground text-sm font-medium">Inbox</Text>
          </Pressable>
        </View>
      </Glass>
    </Animated.View>
  );
}
