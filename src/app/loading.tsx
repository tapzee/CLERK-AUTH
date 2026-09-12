export default function GlobalLoading() {
  return (
    <div className="w-full space-y-6 py-6 animate-pulse">
      {/* Top micro progress indicator */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 overflow-hidden bg-surface-muted/50">
        <div className="h-full w-2/3 bg-accent animate-pulse" />
      </div>
      <div className="space-y-2.5">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="card p-6 space-y-4">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-40 w-full" />
      </div>
    </div>
  );
}
