export default function ReviewLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="space-y-1.5">
        <div className="skeleton h-6 w-36" />
        <div className="skeleton h-4 w-64 max-w-full" />
      </div>

      <div className="space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card p-0 overflow-hidden grid sm:grid-cols-[16rem_1fr]">
            <div className="skeleton aspect-[3/4] sm:aspect-auto" />
            <div className="p-5 space-y-4">
              <div className="skeleton h-5 w-40" />
              <div className="skeleton h-14 w-full" />
              <div className="flex gap-2">
                <div className="skeleton h-9 w-24 rounded-full" />
                <div className="skeleton h-9 w-24 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
