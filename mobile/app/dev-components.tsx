import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Bell,
  CircleDot,
  Cloud,
  GitBranch,
  Plus,
  Rocket,
  Settings2,
  Sparkles,
  TriangleAlert,
} from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/empty-state';
import { ListGroup, ListRow } from '~/components/list-row';
import { GitToast, useGitToast } from '~/components/repo/git-toast';
import { QueryErrorState } from '~/components/repo/repo-states';
import {
  OptionRow,
  Sheet,
  SheetAction,
  SheetField,
  SheetInput,
  SheetNote,
  SheetToggle,
} from '~/components/repo/sheet';
import { Spinner } from '~/components/shared/spinner';
import { ScreenTitle } from '~/components/screen';
import { SectionHeader } from '~/components/section-header';
import {
  BranchRow,
  CommitRow,
  DetailHeader,
  DiffSkeleton,
  DiffView,
  FileChangeRow,
  FileStatusBadge,
  HostBadge,
  MarkdownView,
  PressableRow,
  RowGroup,
  StatusPill,
  initials,
  useBottomInset,
  middleTruncate,
  relativeTime,
  shortHash,
  type PillTone,
} from '~/components/shared';
import { SkeletonList } from '~/components/skeleton-list';
import { StatusDot, type StatusTone } from '~/components/status-dot';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Glass, GlassCircle, GlassPill, SolidPill } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Progress } from '~/components/ui/progress';
import { Separator } from '~/components/ui/separator';
import { Skeleton } from '~/components/ui/skeleton';
import { Switch } from '~/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Text } from '~/components/ui/text';
import { newOpId, useRemoteOps } from '~/lib/repo/remote-ops';
import { palette } from '~/lib/theme';

const PILL_TONES: readonly PillTone[] = [
  'neutral',
  'success',
  'danger',
  'warning',
  'info',
  'accent',
  'added',
  'removed',
  'modified',
  'branch',
  'merge',
];

const DOT_TONES: readonly StatusTone[] = [
  'online',
  'offline',
  'connecting',
  'error',
  'added',
  'removed',
  'modified',
  'branch',
  'neutral',
];

const SAMPLE_DIFF = `diff --git a/lib/protocol/client.ts b/lib/protocol/client.ts
index 8f2a1c4..b0d51e9 100644
--- a/lib/protocol/client.ts
+++ b/lib/protocol/client.ts
@@ -18,7 +18,9 @@ export class ProtocolClient {
   private counter = 0;

-  async request(cmd: string) {
-    return this.send(cmd, {});
+  async request(cmd: string, args: Record<string, unknown> = {}) {
+    const id = ++this.counter;
+    return this.send({ type: 'req', id, cmd, args });
   }
 }
`;

const SAMPLE_MARKDOWN = `## Release notes

Adds the **remote progress toast** and a shared component bench.

- \`ProgressToastHost\` mounts once in the root layout
- Deep links resolve into the repo shell
- Skeletons everywhere

> Long-press a dashboard tile to open its repository.

\`\`\`ts
const client = getClient(hostId);
await client?.request('git_status', { path });
\`\`\`

See [the concept](https://l8git.dev) for the full contract.`;

function Bench({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2.5">
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View className="flex-row flex-wrap items-center gap-2">{children}</View>;
}

export default function DevComponentsScreen() {
  const router = useRouter();
  const toast = useGitToast();
  const [switched, setSwitched] = React.useState(true);
  const [value, setValue] = React.useState('feature/mobile-shell');
  const [tab, setTab] = React.useState('overview');
  const [checked, setChecked] = React.useState(true);
  const [progress, setProgress] = React.useState(38);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [strategy, setStrategy] = React.useState('rebase');
  const [sheetInput, setSheetInput] = React.useState('release/0.1');
  const [sheetToggle, setSheetToggle] = React.useState(false);
  const bottomInset = useBottomInset(24);

  const simulateRemoteOp = React.useCallback(() => {
    const store = useRemoteOps.getState();
    const opId = newOpId();
    store.setResult(null);
    store.start({
      opId,
      hostId: 'bench',
      repoPath: '/Users/dev/Repositories/l8git',
      op: 'fetch',
      phase: 'Receiving objects',
      percent: 0,
      detail: 'origin/main',
      startedAt: Date.now(),
    });

    let percent = 0;
    const timer = setInterval(() => {
      percent += 12;
      if (percent >= 100) {
        clearInterval(timer);
        useRemoteOps.getState().finish(opId);
        useRemoteOps.getState().setResult({
          id: opId,
          op: 'fetch',
          tone: 'success',
          message: 'Fetched 12 objects from origin.',
        });
        return;
      }
      useRemoteOps.getState().progress('bench', {
        opId,
        repoPath: '/Users/dev/Repositories/l8git',
        op: 'fetch',
        phase: 'Receiving objects',
        percent,
        detail: `${percent} of 100 objects`,
      });
    }, 320);
  }, []);

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <DetailHeader
        title="Component bench"
        subtitle="Every shared primitive on the dark scaffold"
        right={<StatusPill label="dev" tone="accent" size="xs" mono />}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
      />

      <ScrollView
        contentContainerClassName="gap-3 px-5 pt-1"
        contentContainerStyle={{ paddingBottom: bottomInset + 48 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Bench title="Palette">
          <Row>
            {(
              [
                ['background', palette.background],
                ['card', palette.card],
                ['muted', palette.muted],
                ['primary', palette.primary],
                ['success', palette.success],
                ['warning', palette.warning],
                ['destructive', palette.destructive],
                ['branch', palette.git.branch],
                ['merge', palette.git.merge],
                ['tag', palette.git.tag],
              ] as const
            ).map(([name, color]) => (
              <View key={name} className="items-center gap-1">
                <View style={{ backgroundColor: color }} className="h-9 w-9 rounded-full" />
                <Text className="text-muted-foreground text-2xs">{name}</Text>
              </View>
            ))}
          </Row>
        </Bench>

        <Bench title="Headers">
          <ScreenTitle
            title="Inbox"
            subtitle="4 repos on 2 hosts"
            right={<StatusPill label={7} tone="info" mono />}
          />
        </Bench>

        <Bench title="Typography">
          <View className="gap-1">
            <Text className="text-foreground text-2xl font-semibold tracking-tight">
              Display 24 / semibold
            </Text>
            <Text className="text-foreground text-base">Body 15 / regular</Text>
            <Text className="text-muted-foreground text-sm">Secondary 13 / muted</Text>
            <Text className="text-git-hash font-mono text-xs">mono 11 · 4f2c9ab</Text>
            <Text className="text-muted-foreground text-2xs uppercase tracking-widest">
              Overline 10
            </Text>
          </View>
        </Bench>

        <Bench title="Glass and pills">
          <Row>
            <GlassCircle icon={ArrowLeft} label="Back" onPress={() => toast.showInfo('Back')} />
            <GlassCircle icon={Settings2} label="Settings" onPress={() => toast.showInfo('Settings')} />
            <GlassCircle icon={Bell} label="Alerts" badge={3} onPress={() => toast.showInfo('Alerts')} />
            <GlassCircle icon={Plus} label="Add" size={36} onPress={() => toast.showInfo('Add')} />
          </Row>
          <Row>
            <GlassPill icon={GitBranch} label="Glass pill" onPress={() => toast.showInfo('Glass pill')} />
            <GlassPill label="Plain" onPress={() => toast.showInfo('Plain pill')} />
          </Row>
          <SolidPill
            icon={Rocket}
            label="Solid pill"
            onPress={() => toast.showSuccess('Solid pill pressed')}
          />
          <SolidPill label="Disabled" disabled />
          <Glass
            style={{
              height: 46,
              borderRadius: 23,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}>
            <Icon as={Sparkles} size={16} color={palette.foreground} />
            <Text className="text-foreground flex-1 text-sm font-semibold">Glass surface</Text>
            <StatusPill label="live" tone="success" size="xs" dot />
          </Glass>
        </Bench>

        <Bench title="Buttons">
          <Row>
            <Button size="sm">
              <Text>Primary</Text>
            </Button>
            <Button size="sm" variant="secondary">
              <Text>Secondary</Text>
            </Button>
            <Button size="sm" variant="outline">
              <Text>Outline</Text>
            </Button>
            <Button size="sm" variant="ghost">
              <Text>Ghost</Text>
            </Button>
            <Button size="sm" variant="destructive">
              <Text>Destructive</Text>
            </Button>
            <Button size="icon" variant="secondary" accessibilityLabel="Icon button">
              <Icon as={Sparkles} className="text-foreground size-4" />
            </Button>
            <Button size="sm" disabled>
              <Text>Disabled</Text>
            </Button>
          </Row>
        </Bench>

        <Bench title="Status pills">
          <Row>
            {PILL_TONES.map((tone) => (
              <StatusPill key={tone} label={tone} tone={tone} size="xs" dot />
            ))}
          </Row>
          <Row>
            <StatusPill label={12} tone="added" icon={GitBranch} mono />
            <StatusPill label="draft" tone="neutral" />
            <StatusPill label="merged" tone="merge" icon={CircleDot} />
            <Badge>
              <Text>Badge</Text>
            </Badge>
            <Badge variant="outline">
              <Text>Outline</Text>
            </Badge>
            <HostBadge hostId="bench-host" name="studio" showStatus />
          </Row>
          <Row>
            {DOT_TONES.map((tone) => (
              <View key={tone} className="flex-row items-center gap-1.5">
                <StatusDot tone={tone} />
                <Text className="text-muted-foreground text-2xs">{tone}</Text>
              </View>
            ))}
          </Row>
        </Bench>

        <Bench title="Form controls">
          <View className="gap-2">
            <Label>
              <Text>Branch name</Text>
            </Label>
            <Input value={value} onChangeText={setValue} autoCapitalize="none" />
            <View className="flex-row items-center justify-between py-1">
              <Text className="text-foreground text-sm">Haptic feedback</Text>
              <Switch checked={switched} onCheckedChange={setSwitched} />
            </View>
            <Progress value={progress} className="h-1.5" />
            <Row>
              <Button size="sm" variant="outline" onPress={() => setProgress((p) => (p + 17) % 100)}>
                <Text>Advance progress</Text>
              </Button>
              <Spinner size={16} className="text-muted-foreground" />
            </Row>
          </View>
        </Bench>

        <Bench title="Tabs">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-row">
              <TabsTrigger value="overview" className="flex-1">
                <Text>Overview</Text>
              </TabsTrigger>
              <TabsTrigger value="files" className="flex-1">
                <Text>Files</Text>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Text className="text-muted-foreground py-2 text-sm">
                Segmented control from react-native-reusables.
              </Text>
            </TabsContent>
            <TabsContent value="files">
              <Text className="text-muted-foreground py-2 text-sm">Second pane content.</Text>
            </TabsContent>
          </Tabs>
        </Bench>

        <Bench title="Surfaces">
          <Card>
            <CardHeader>
              <CardTitle>
                <Text>Card title</Text>
              </CardTitle>
              <CardDescription>
                <Text>Cards wrap dense metric panels on the dashboard.</Text>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Text className="text-muted-foreground text-sm">
                Content sits on the borderless card surface.
              </Text>
            </CardContent>
          </Card>
          <Alert icon={TriangleAlert} variant="destructive">
            <AlertTitle>Push rejected</AlertTitle>
            <AlertDescription>The remote contains work you do not have locally.</AlertDescription>
          </Alert>
          <Separator />
          <Row>
            <Avatar alt="l8git" className="size-9">
              <AvatarFallback>
                <Text className="text-xs font-semibold">{initials('Leon Achteresch')}</Text>
              </AvatarFallback>
            </Avatar>
            <Text className="text-muted-foreground text-xs">
              {`${shortHash('4f2c9abf19d3')} · ${relativeTime(Date.now() - 5_400_000)} · ${middleTruncate('/Users/dev/Repositories/l8git/mobile/components', 28)}`}
            </Text>
          </Row>
        </Bench>

        <Bench title="Rows">
          <ListGroup>
            <ListRow
              icon={Cloud}
              title="List row"
              subtitle="Settings-style row with chevron"
              chevron
              onPress={() => toast.showInfo('List row tapped')}
            />
            <ListRow
              icon={Rocket}
              title="With trailing switch"
              subtitle="No chevron"
              trailing={<Switch checked={switched} onCheckedChange={setSwitched} />}
            />
          </ListGroup>

          <RowGroup>
            <PressableRow onPress={() => toast.showSuccess('Pressable row')}>
              <View className="px-3 py-3">
                <Text className="text-foreground text-sm font-medium">PressableRow</Text>
                <Text className="text-muted-foreground text-xs">
                  Scale + highlight on press, haptic long-press
                </Text>
              </View>
            </PressableRow>
            <PressableRow selected onLongPress={() => toast.showInfo('Long pressed')}>
              <View className="px-3 py-3">
                <Text className="text-foreground text-sm font-medium">Selected state</Text>
              </View>
            </PressableRow>
          </RowGroup>

          <RowGroup>
            <CommitRow
              hash="4f2c9abf19d3aa71"
              subject="feat(mobile): mount the global progress toast"
              author="Leon Achteresch"
              email="leon@l8git.dev"
              date={new Date(Date.now() - 3_600_000).toISOString()}
              tags={['v0.1.0']}
              parents={['aa11bb22']}
            />
            <CommitRow
              hash="91bd7c0e5521"
              subject="Merge branch 'release/0.1'"
              author="CI Bot"
              date={new Date(Date.now() - 86_400_000).toISOString()}
              parents={['aa11bb22', 'cc33dd44']}
            />
          </RowGroup>

          <RowGroup>
            <BranchRow
              name="main"
              current
              tip="4f2c9abf"
              upstream="origin/main"
              subject="feat: shared bench"
              date={new Date(Date.now() - 7_200_000).toISOString()}
              ahead={2}
              behind={1}
            />
            <BranchRow name="origin/feature/mobile-shell" remote tip="91bd7c0e" />
            <BranchRow name="chore/stale" gone upstream="origin/chore/stale" />
          </RowGroup>

          <RowGroup>
            <FileChangeRow
              path="mobile/components/shared/progress-toast-host.tsx"
              status="A"
              additions={142}
              deletions={0}
              check={checked ? 'checked' : 'unchecked'}
              onToggle={() => setChecked((current) => !current)}
            />
            <FileChangeRow
              path="mobile/lib/repo/route.ts"
              status="M"
              additions={38}
              deletions={12}
              check="indeterminate"
            />
            <FileChangeRow path="mobile/lib/repo-registry.ts" status="D" deletions={54} />
            <FileChangeRow
              path="mobile/assets/images/icon.png"
              oldPath="mobile/assets/icon.png"
              status="R"
              binary
            />
          </RowGroup>

          <Row>
            {(['A', 'M', 'D', 'R', 'C', 'T', 'U', '?'] as const).map((code) => (
              <FileStatusBadge key={code} status={code} />
            ))}
          </Row>
        </Bench>

        <Bench title="Diff">
          <DiffView diff={SAMPLE_DIFF} />
          <DiffSkeleton rows={5} />
        </Bench>

        <Bench title="Markdown">
          <MarkdownView content={SAMPLE_MARKDOWN} />
        </Bench>

        <Bench title="Loading, empty and error">
          <SkeletonList rows={3} avatar />
          <Skeleton className="h-16 rounded-3xl" />
          <EmptyState
            icon={Sparkles}
            title="Nothing here yet"
            description="Empty states carry an icon, a title, a hint and one action."
            action={<SolidPill label="Retry" onPress={() => toast.showInfo('Retry pressed')} />}
          />
          <QueryErrorState
            title="Could not load commits"
            error={new Error('host studio is not connected')}
            onRetry={() => toast.showError('Still offline')}
          />
        </Bench>

        <Bench title="Action sheet">
          <GlassPill
            label="Open sheet"
            onPress={() => setSheetOpen(true)}
            style={{ alignSelf: 'flex-start' }}
          />
        </Bench>

        <Bench title="Toasts">
          <Row>
            <GlassPill label="Success toast" onPress={() => toast.showSuccess('Pushed to origin/main')} />
            <GlassPill
              label="Error toast"
              onPress={() => toast.showError('Push failed', new Error('non-fast-forward'))}
            />
            <GlassPill label="Progress toast" onPress={simulateRemoteOp} />
          </Row>
        </Bench>
      </ScrollView>

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Pull"
        description="Sheet, actions, options, fields, toggles and notes."
        footer={<SolidPill label="Close" onPress={() => setSheetOpen(false)} />}>
        <SheetAction
          icon={Rocket}
          label="Pull now"
          description="Fetch and integrate the upstream branch"
          onPress={() => setSheetOpen(false)}
        />
        <SheetAction
          icon={TriangleAlert}
          label="Force push"
          description="Overwrites the remote branch"
          tone="danger"
          onPress={() => setSheetOpen(false)}
        />
        <SheetField label="Strategy" hint="Applied to every pull on this repo">
          <OptionRow
            label="Rebase"
            description="Replay local commits on top"
            selected={strategy === 'rebase'}
            onPress={() => setStrategy('rebase')}
          />
          <OptionRow
            label="Merge"
            description="Create a merge commit"
            selected={strategy === 'merge'}
            onPress={() => setStrategy('merge')}
          />
        </SheetField>
        <SheetField label="Branch">
          <SheetInput value={sheetInput} onChangeText={setSheetInput} placeholder="branch name" />
        </SheetField>
        <SheetToggle
          label="Prune deleted branches"
          description="Drop remote-tracking refs that vanished"
          checked={sheetToggle}
          onCheckedChange={setSheetToggle}
        />
        <SheetNote tone="danger">This cannot be undone.</SheetNote>
      </Sheet>

      <GitToast notice={toast.notice} onDismiss={toast.dismiss} />
    </SafeAreaView>
  );
}
