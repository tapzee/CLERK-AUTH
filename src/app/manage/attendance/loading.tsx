export default function AttendanceLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="skeleton h-3.5 w-24" />
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-80 max-w-full" />
        </div>
        <div className="skeleton h-10 w-36 rounded-xl" />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b border-border/80 bg-surface-muted/50 p-3.5 flex gap-4">
          <div className="skeleton h-3.5 w-28" />
          <div className="skeleton h-3.5 w-24" />
          <div className="skeleton h-3.5 w-20" />
          <div className="skeleton h-3.5 w-20" />
          <div className="skeleton h-3.5 w-32" />
        </div>
        <div className="divide-y divide-border/60 p-2 space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <div className="skeleton h-8 w-8 rounded-lg" />
                <div className="space-y-1">
                  <div className="skeleton h-4 w-36" />
                  <div className="skeleton h-3 w-24" />
                </div>
              </div>
              <div className="skeleton h-4 w-28 hidden sm:block" />
              <div className="skeleton h-6 w-20 rounded-full" />
              <div className="skeleton h-6 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
