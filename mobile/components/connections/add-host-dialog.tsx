import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { ClipboardPaste, QrCode, ScanLine } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { PairSuccess } from '~/components/connections/pair-success';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';
import { useConnections } from '~/lib/connections';
import { parsePairing } from '~/lib/protocol/client';

type Mode = 'choose' | 'scan' | 'manual' | 'done';

export function AddHostDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addHost = useConnections((state) => state.addHost);
  const connect = useConnections((state) => state.connect);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = React.useState<Mode>('choose');
  const [payload, setPayload] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pairedName, setPairedName] = React.useState('');
  const scanned = React.useRef(false);

  React.useEffect(() => {
    if (open) {
      return;
    }
    setMode('choose');
    setPayload('');
    setError(null);
    setBusy(false);
    scanned.current = false;
  }, [open]);

  const submit = React.useCallback(
    async (raw: string) => {
      if (busy) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const pairing = parsePairing(raw);
        const meta = await addHost(pairing);
        setPairedName(meta.name);
        setMode('done');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void connect(meta.hostId);
      } catch (cause) {
        scanned.current = false;
        setError(cause instanceof Error ? cause.message : String(cause));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setBusy(false);
      }
    },
    [addHost, busy, connect]
  );

  const openScanner = React.useCallback(async () => {
    setError(null);
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        setError('Camera permission is required to scan a pairing code.');
        return;
      }
    }
    scanned.current = false;
    setMode('scan');
  }, [permission?.granted, requestPermission]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>{mode === 'done' ? 'Paired' : 'Add a host'}</DialogTitle>
          <DialogDescription>
            {mode === 'done'
              ? 'The host was stored securely on this device.'
              : 'Run `l8gitd pair` on the machine, then scan the QR code or paste the JSON payload.'}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert icon={ScanLine} variant="destructive">
            <AlertTitle>Pairing failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {mode === 'choose' ? (
          <View className="gap-2">
            <Button onPress={() => void openScanner()}>
              <Icon as={QrCode} className="text-primary-foreground size-4" />
              <Text>Scan QR code</Text>
            </Button>
            <Button variant="outline" onPress={() => setMode('manual')}>
              <Icon as={ClipboardPaste} className="text-foreground size-4" />
              <Text>Paste pairing JSON</Text>
            </Button>
          </View>
        ) : null}

        {mode === 'scan' ? (
          <View className="gap-3">
            <View className="border-border bg-muted h-64 overflow-hidden rounded-xl border">
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (scanned.current) {
                    return;
                  }
                  scanned.current = true;
                  void Haptics.selectionAsync();
                  void submit(data);
                }}
              />
            </View>
            <Button variant="ghost" onPress={() => setMode('choose')}>
              <Text>Cancel</Text>
            </Button>
          </View>
        ) : null}

        {mode === 'manual' ? (
          <View className="gap-3">
            <Input
              value={payload}
              onChangeText={setPayload}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              placeholder='{"v":1,"hostId":"…","psk":"…","endpoints":["ws://…"]}'
              className="h-28 py-2 font-mono text-xs"
            />
            <View className="flex-row gap-2">
              <Button variant="ghost" className="flex-1" onPress={() => setMode('choose')}>
                <Text>Back</Text>
              </Button>
              <Button
                className="flex-1"
                disabled={busy || payload.trim().length === 0}
                onPress={() => void submit(payload)}>
                {busy ? <ActivityIndicator size="small" /> : <Text>Pair</Text>}
              </Button>
            </View>
          </View>
        ) : null}

        {mode === 'done' ? (
          <View className="gap-3">
            <PairSuccess name={pairedName} />
            <DialogFooter>
              <Button onPress={() => onOpenChange(false)}>
                <Text>Done</Text>
              </Button>
            </DialogFooter>
          </View>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
