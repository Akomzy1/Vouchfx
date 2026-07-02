"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { signedCompact, signed, toneClass } from "./format";

export interface CalendarDay {
  day: string; // YYYY-MM-DD
  netPnl: number;
  tradeCount: number;
  winCount: number;
}

interface Props {
  month: Date; // first of the displayed month (local)
  days: CalendarDay[];
  loading: boolean;
  todayKey: string;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (day: string) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (n: number) => String(n).padStart(2, "0");

export default function PnlCalendar({ month, days, loading, todayKey, onPrev, onNext, onSelectDay }: Props) {
  const year = month.getFullYear();
  const monthIdx = month.getMonth();

  const byDay = new Map(days.map((d) => [d.day, d]));
  const monthNet = days.reduce((s, d) => s + d.netPnl, 0);
  const tradingDays = days.filter((d) => d.tradeCount > 0).length;

  const firstWeekday = new Date(year, monthIdx, 1).getDay(); // 0=Sun
  const leadingBlanks = (firstWeekday + 6) % 7; // Monday-first offset
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  const cells: Array<{ key: string; dayNum: number; weekend: boolean } | null> = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const wd = new Date(year, monthIdx, d).getDay();
    cells.push({ key: `${year}-${pad(monthIdx + 1)}-${pad(d)}`, dayNum: d, weekend: wd === 0 || wd === 6 });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={onPrev} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary" aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <h2 className="min-w-[130px] text-center text-[15px] font-semibold text-text-primary sm:min-w-[150px]">
            {MONTHS[monthIdx]} {year}
          </h2>
          <button onClick={onNext} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary" aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text-muted">Month P&amp;L</div>
            <div className={`num text-[14px] font-bold tabular-nums ${toneClass(monthNet)}`}>{signed(monthNet)}</div>
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] uppercase tracking-wide text-text-muted">Trading days</div>
            <div className="num text-[14px] font-bold tabular-nums text-text-primary">{tradingDays}</div>
          </div>
        </div>
      </div>

      {/* Weekday header */}
      <div className="mb-1.5 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-medium uppercase tracking-wide text-text-muted">
            {w}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className={`grid grid-cols-7 gap-1.5 ${loading ? "opacity-50" : ""}`}>
        {cells.map((c, i) => {
          if (!c) return <div key={`b${i}`} />;
          const data = byDay.get(c.key);
          const hasTrades = !!data && data.tradeCount > 0;
          const isToday = c.key === todayKey;
          const bg = data ? (data.netPnl > 0 ? "bg-profit/10" : data.netPnl < 0 ? "bg-loss/10" : "bg-surface-elevated") : c.weekend ? "bg-bg/40" : "bg-surface-elevated/40";
          return (
            <button
              key={c.key}
              disabled={!hasTrades}
              onClick={() => hasTrades && onSelectDay(c.key)}
              className={[
                "flex min-h-[58px] flex-col rounded-lg border p-1.5 text-left transition-colors sm:min-h-[76px]",
                bg,
                isToday ? "border-primary/50" : "border-border/60",
                hasTrades ? "cursor-pointer hover:border-primary/40" : "cursor-default",
              ].join(" ")}
            >
              <span className={`num text-[10px] tabular-nums ${isToday ? "font-bold text-primary-light" : "text-text-muted"}`}>
                {c.dayNum}
              </span>
              {hasTrades && data && (
                <span className="mt-auto">
                  <span className={`num block text-[11px] font-bold tabular-nums leading-tight sm:text-[12px] ${toneClass(data.netPnl)}`}>
                    {signedCompact(data.netPnl)}
                  </span>
                  <span className="num hidden text-[9px] tabular-nums text-text-muted sm:block">
                    {data.tradeCount}t · {data.tradeCount > 0 ? Math.round((data.winCount / data.tradeCount) * 100) : 0}%
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
