export default function MeLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="skeleton h-3.5 w-24" />
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-32" />
        </div>
        <div className="skeleton h-9 w-28 rounded-full" />
      </div>

      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-8 w-20 rounded-full" />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-6 w-16" />
          </div>
        ))}
      </div>

      <div className="card p-5 space-y-3">
        <div className="skeleton h-5 w-36" />
        <div className="skeleton h-24 w-full" />
      </div>
    </div>
  );
}
