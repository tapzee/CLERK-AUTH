export default function PunchLoading() {
  return (
    <div className="mx-auto max-w-md space-y-4 animate-pulse">
      <div className="space-y-1 text-center sm:text-left">
        <div className="skeleton h-3 w-20 mx-auto sm:mx-0" />
        <div className="skeleton h-6 w-44 mx-auto sm:mx-0" />
        <div className="skeleton h-3.5 w-64 max-w-full mx-auto sm:mx-0" />
      </div>

      <div className="card p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="skeleton h-5 w-32" />
          <div className="skeleton h-4 w-24" />
        </div>
        <div className="skeleton h-4 w-40" />
      </div>

      <div className="skeleton h-10 w-full rounded-2xl" />

      <div className="skeleton aspect-[3/4] w-full rounded-2xl sm:aspect-[4/3]" />

      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-12 w-full rounded-xl" />
        <div className="skeleton h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
