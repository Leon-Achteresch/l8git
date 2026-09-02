import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AppReleaseNotes } from "@/components/app/app-release-notes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    void getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("about.title")}</CardTitle>
          {version ? (
            <CardDescription>{t("about.version", { version })}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{t("about.body")}</CardContent>
      </Card>
      <AppReleaseNotes currentVersion={version} />
    </main>
  );
}
