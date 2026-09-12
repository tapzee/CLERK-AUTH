export default function PayrollLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="space-y-1.5">
        <div className="skeleton h-3.5 w-24" />
        <div className="skeleton h-7 w-40" />
        <div className="skeleton h-4 w-72 max-w-full" />
      </div>

      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-8 w-24 rounded-full" />
        ))}
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-7 w-28 rounded-full" />
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-border">
              <div className="skeleton h-4 w-36" />
              <div className="skeleton h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
