export function FeedSkeleton() {
  return (
    <div className="space-y-5 px-5 py-6">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="overflow-hidden rounded-card border border-line bg-elevated shadow-soft"
        >
          <div className="aspect-[4/3] animate-skeleton bg-elev-2" />
          <div className="space-y-3 p-4">
            <div className="h-5 w-3/4 animate-skeleton rounded-md bg-elev-2" />
            <div className="h-6 w-28 animate-skeleton rounded-md bg-elev-2" />
            <div className="h-3 w-1/2 animate-skeleton rounded bg-elev-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
