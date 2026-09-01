import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Package } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchAppReleases,
  sameReleaseVersion,
  type AppRelease,
} from "@/lib/app-releases";

const NOTES_PROSE =
  "space-y-3 text-sm leading-7 text-foreground/90 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h1]:mb-1 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mb-1 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:border-border [&_li]:ml-5 [&_li]:pl-1 [&_ol]:list-decimal [&_p_code]:text-foreground [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-muted/70 [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc";

function formatPublishedAt(value: string | null, localeTag: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag, { dateStyle: "long" }).format(date);
}

export function AppReleaseNotes({
  currentVersion,
}: {
  currentVersion: string | null;
}) {
  const { t, i18n } = useTranslation();
  const [releases, setReleases] = useState<AppRelease[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  const localeTag = i18n.resolvedLanguage ?? i18n.language ?? "en";

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setReleases(null);
    void fetchAppReleases()
      .then((items) => {
        if (!cancelled) setReleases(items);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  const defaultOpen = releases?.[0]?.tag;

  const rows = useMemo(
    () =>
      (releases ?? []).map((release) => ({
        release,
        current: sameReleaseVersion(release.tag, currentVersion),
        published: formatPublishedAt(release.publishedAt, localeTag),
      })),
    [releases, currentVersion, localeTag],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("about.releasesTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-sm text-muted-foreground">{t("about.releasesError")}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>
              {t("common.refresh")}
            </Button>
          </div>
        ) : releases == null ? (
          <div className="space-y-3" aria-busy aria-label={t("common.loading")}>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-1 py-6 text-center">
            <Package className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t("updates.noReleaseNotes")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("changelog.noNotesHint")}</p>
          </div>
        ) : (
          <Accordion type="single" collapsible defaultValue={defaultOpen} className="w-full">
            {rows.map(({ release, current, published }) => (
              <AccordionItem key={release.tag} value={release.tag} className="border-b last:border-b-0">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-medium">{release.tag}</span>
                    {current ? (
                      <Badge variant="success" className="shrink-0">
                        {t("about.currentRelease")}
                      </Badge>
                    ) : null}
                    {release.prerelease ? (
                      <Badge variant="warning" className="shrink-0">
                        {t("about.prerelease")}
                      </Badge>
                    ) : null}
                    {published ? (
                      <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                        {published}
                      </span>
                    ) : null}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {release.notes ? (
                    <div className={NOTES_PROSE}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{release.notes}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("updates.noReleaseNotes")}</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
