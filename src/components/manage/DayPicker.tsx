"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function DayPicker({ date }: { date: string }) {
  const router = useRouter();

  function go(to: string) {
    router.push(`/manage/attendance?date=${to}`);
  }

  function shift(offset: number) {
    const [year, month, day] = date.split("-").map(Number);
    const moved = new Date(Date.UTC(year, month - 1, day + offset));
    go(moved.toISOString().slice(0, 10));
  }

  return (
    <div className="flex items-center gap-1.5 rounded-2xl border border-border/80 bg-surface/70 p-1 backdrop-blur-md shadow-sm">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Previous day"
        className="grid h-8 w-8 place-items-center rounded-xl text-muted transition hover:bg-surface-muted hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="relative flex items-center">
        <input
          type="date"
          value={date}
          onChange={(event) => event.target.value && go(event.target.value)}
          aria-label="Show this date"
          className="bg-transparent px-2.5 py-1 font-mono text-xs font-semibold text-foreground outline-none cursor-pointer"
        />
      </div>

      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="Next day"
        className="grid h-8 w-8 place-items-center rounded-xl text-muted transition hover:bg-surface-muted hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
