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
    <div className="flex items-center gap-1 rounded-[10px] border border-border bg-surface p-0.5">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Previous day"
        className="grid h-7 w-7 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="relative flex items-center">
        <input
          type="date"
          value={date}
          onChange={(event) => event.target.value && go(event.target.value)}
          aria-label="Show this date"
          className="cursor-pointer bg-transparent px-2 py-1 font-mono text-xs tnum text-foreground outline-none"
        />
      </div>

      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="Next day"
        className="grid h-7 w-7 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
