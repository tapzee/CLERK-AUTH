export default function ManageLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="skeleton h-3.5 w-24" />
        <div className="skeleton h-7 w-56" />
        <div className="skeleton h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="skeleton h-3.5 w-20" />
              <div className="skeleton h-6 w-6 rounded-lg" />
            </div>
            <div className="skeleton h-7 w-24" />
            <div className="skeleton h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="skeleton h-5 w-36" />
          <div className="skeleton h-4 w-20" />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-border/50">
              <div className="flex items-center gap-3">
                <div className="skeleton h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <div className="skeleton h-4 w-32" />
                  <div className="skeleton h-3 w-20" />
                </div>
              </div>
              <div className="skeleton h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
