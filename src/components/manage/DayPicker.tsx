"use client";

import { useRouter } from "next/navigation";

/**
 * Moves the day sheet between dates.
 *
 * The date lives in the query string rather than in component state so a
 * manager can bookmark or share "the 3rd", and so the page stays a server
 * component that fetches exactly the day it renders.
 */
export function DayPicker({ date }: { date: string }) {
  const router = useRouter();

  function go(to: string) {
    router.push(`/manage/attendance?date=${to}`);
  }

  /** `offset` in days, applied in UTC so it cannot skip one at a DST edge. */
  function shift(offset: number) {
    const [year, month, day] = date.split("-").map(Number);
    const moved = new Date(Date.UTC(year, month - 1, day + offset));
    go(moved.toISOString().slice(0, 10));
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Previous day"
        className="btn btn-ghost px-3"
      >
        ‹
      </button>

      <input
        type="date"
        value={date}
        onChange={(event) => event.target.value && go(event.target.value)}
        aria-label="Show this date"
        className="input w-auto"
      />

      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="Next day"
        className="btn btn-ghost px-3"
      >
        ›
      </button>
    </div>
  );
}
