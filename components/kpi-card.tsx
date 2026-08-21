import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  up: "bg-emerald-50/90 ring-emerald-200/70",
  down: "bg-rose-50/90 ring-rose-200/70",
  ask: "bg-amber-50/90 ring-amber-200/70",
  index: "bg-sky-50/90 ring-sky-200/70",
};

const VALUE: Record<string, string> = {
  up: "text-emerald-800",
  down: "text-rose-800",
  ask: "text-amber-900",
  index: "text-sky-900",
};

export function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down" | "ask" | "index";
}) {
  return (
    <Card className={cn(tone ? TONE[tone] : null)}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", tone ? VALUE[tone] : null)}>{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-muted-foreground text-xs leading-5">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
