import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAnimationPrefs } from "@/lib/animation-prefs";

export function AnimationsCard() {
  const enabled = useAnimationPrefs((s) => s.animationsEnabled);
  const setEnabled = useAnimationPrefs((s) => s.setAnimationsEnabled);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bewegung & Animationen</CardTitle>
        <CardDescription>
          Dezent choreografierte Übergänge – Magic-Pill, Tape-Reveal und
          Pop-Bloom. Unterbrechen dich nie: du kannst jederzeit weiterklicken,
          während Elemente noch animieren. Respektiert automatisch die
          System-Einstellung „Reduzierte Bewegung“.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          <Checkbox
            id="animations-enabled"
            checked={enabled}
            onCheckedChange={(v) => setEnabled(v === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label
              htmlFor="animations-enabled"
              className="cursor-pointer text-sm font-medium text-foreground"
            >
              Bewegungen aktivieren
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Wenn ausgeschaltet, erscheinen alle Inhalte sofort ohne
              Übergangseffekte.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
