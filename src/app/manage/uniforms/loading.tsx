export default function UniformsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="skeleton h-6 w-44" />
          <div className="skeleton h-4 w-80 max-w-full" />
        </div>
        <div className="skeleton h-10 w-32 rounded-full" />
      </div>

      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="skeleton h-5 w-44" />
              <div className="skeleton h-8 w-16 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="skeleton aspect-square rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
