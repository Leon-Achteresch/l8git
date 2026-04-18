import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTheme } from "@/lib/use-theme";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Einstellungen</h1>

      <Card>
        <CardHeader>
          <CardTitle>Darstellung</CardTitle>
          <CardDescription>
            Wähle, wie gitit aussieht. „System“ folgt deiner OS-Einstellung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid grid-cols-3 gap-3"
          >
            {THEMES.map(({ value, label, icon: Icon }) => {
              const active = theme === value;
              return (
                <Button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  variant={active ? "default" : "outline"}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "h-auto flex-col gap-2 py-4",
                    active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm">{label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
