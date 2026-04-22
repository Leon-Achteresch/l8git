import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          l8git — ein einfacher Git-Frontend-Client, gebaut mit Tauri, React,
          TanStack Router und shadcn/ui.
        </CardContent>
      </Card>
    </main>
  );
}
