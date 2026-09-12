export default function StaffLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="skeleton h-6 w-40" />
          <div className="skeleton h-4 w-72 max-w-full" />
        </div>
        <div className="skeleton h-10 w-28 rounded-full" />
      </div>

      <div className="space-y-2.5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="skeleton h-10 w-10 rounded-xl" />
              <div className="space-y-1.5">
                <div className="skeleton h-4 w-36" />
                <div className="skeleton h-3 w-48" />
              </div>
            </div>
            <div className="skeleton h-8 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
