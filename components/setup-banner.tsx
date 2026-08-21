import { Card, CardContent } from "@/components/ui/card";

export function SetupBanner() {
  return (
    <Card className="border-dashed">
      <CardContent className="text-sm leading-6">
        <p className="font-medium">Connect Supabase to load live data.</p>
        <p className="text-muted-foreground mt-1">
          Copy <code>.env.example</code> to <code>.env.local</code>, create a project, run the migration
          in <code>supabase/migrations</code>, then <code>PYTHONPATH=scraper python3 -m mtprop seed</code>.
        </p>
      </CardContent>
    </Card>
  );
}
