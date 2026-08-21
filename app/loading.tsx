function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-muted animate-pulse rounded-md ${className ?? ""}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border p-6">
            <Skeleton className="mb-3 h-3 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </section>

      <div className="rounded-xl border p-6">
        <Skeleton className="mb-2 h-6 w-48" />
        <Skeleton className="mb-6 h-4 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>

      <div className="rounded-xl border p-6">
        <Skeleton className="mb-4 h-6 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
