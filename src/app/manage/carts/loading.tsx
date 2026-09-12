export default function CartsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="skeleton h-6 w-36" />
          <div className="skeleton h-4 w-64 max-w-full" />
        </div>
        <div className="skeleton h-10 w-28 rounded-full" />
      </div>

      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="skeleton h-5 w-40" />
              <div className="skeleton h-6 w-16 rounded-full" />
            </div>
            <div className="skeleton h-4 w-72 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
