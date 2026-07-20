import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { fmtCentsSigned } from "@/lib/money";
import { iso, monthTitle, type DateRange } from "@/lib/dates";
import { fullMonthRange } from "@/pages/insights/months";
import { useConnection } from "@/hooks/useConnection";
import { useCalendar, type CalendarDay } from "@/api/calendar";
import { useRecurrences, type Recurrence } from "@/api/recurrences";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // Monday-start

interface Cell {
  date: string; // YYYY-MM-DD
  day: number; // 1-31
  inMonth: boolean;
  data?: CalendarDay;
  recurrences: Recurrence[];
}

/// Day-of-month a recurrence lands on within the visible month: the explicit
/// anchorDay when set, else the day component of its nextDate.
function recurrenceDayOfMonth(r: Recurrence): number {
  if (r.anchorDay != null) return r.anchorDay;
  return Number.parseInt(r.nextDate.slice(8, 10), 10);
}

export function CalendarPage() {
  const { connected, openDialog } = useConnection();
  const navigate = useNavigate();

  // Visible month, anchored to the 1st. Prev/next shift by one month.
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = anchor.getFullYear();
  const monthIndex = anchor.getMonth();
  const range = useMemo<DateRange>(() => fullMonthRange(year, monthIndex), [year, monthIndex]);
  const todayStr = useMemo(() => iso(new Date()), []);

  const calQ = useCalendar(range, undefined, connected);
  const recQ = useRecurrences(connected);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of calQ.data ?? []) m.set(d.date, d);
    return m;
  }, [calQ.data]);

  const recByDay = useMemo(() => {
    const m = new Map<number, Recurrence[]>();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    for (const r of recQ.data ?? []) {
      const dom = recurrenceDayOfMonth(r);
      if (!Number.isFinite(dom) || dom < 1 || dom > daysInMonth) continue;
      const list = m.get(dom) ?? [];
      list.push(r);
      m.set(dom, list);
    }
    return m;
  }, [recQ.data, year, monthIndex]);

  // Grid cells: Monday-start weeks covering the whole month, padded to full
  // weeks on both ends (up to 6 rows / 42 cells).
  const cells = useMemo<Cell[]>(() => {
    const first = new Date(year, monthIndex, 1);
    // JS getDay(): 0=Sun..6=Sat. Offset to Monday-start (Mon=0..Sun=6).
    const lead = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const total = Math.ceil((lead + daysInMonth) / 7) * 7;
    const out: Cell[] = [];
    for (let i = 0; i < total; i++) {
      const d = new Date(year, monthIndex, 1 - lead + i);
      const inMonth = d.getMonth() === monthIndex;
      const dateStr = iso(d);
      out.push({
        date: dateStr,
        day: d.getDate(),
        inMonth,
        data: inMonth ? byDate.get(dateStr) : undefined,
        recurrences: inMonth ? (recByDay.get(d.getDate()) ?? []) : [],
      });
    }
    return out;
  }, [year, monthIndex, byDate, recByDay]);

  const activeCells = useMemo(
    () => cells.filter((c) => c.inMonth && (c.data || c.recurrences.length > 0)),
    [cells],
  );

  const goToDay = (date: string) => navigate(`/transactions?date=${date}`);
  const shiftMonth = (delta: number) =>
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));

  if (!connected) {
    return (
      <>
        <PageHeader title="Calendar" subtitle="Your month, day by day." />
        <EmptyState
          title="Not connected."
          hint="Add your pi-server API key to see your spending calendar."
          action={{ label: "Connect", onClick: openDialog }}
        />
      </>
    );
  }

  const loading = calQ.isLoading || recQ.isLoading;

  const monthNav = (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Previous month"
        onClick={() => shiftMonth(-1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[8.5rem] text-center text-xs font-semibold uppercase tracking-wider text-ink">
        {monthTitle(anchor)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Next month"
        onClick={() => shiftMonth(1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader title="Calendar" subtitle="Your month, day by day." />

      {calQ.isError ? (
        <ErrorState message={(calQ.error as Error)?.message} onRetry={() => calQ.refetch()} />
      ) : (
        <Panel title="Month" right={monthNav}>
          {loading ? (
            <Skeleton className="m-4 h-96" />
          ) : (
            <>
              {/* Desktop / tablet: the 7-column month grid, hairline dividers. */}
              <div className="hidden md:block">
                <div className="grid grid-cols-7 border-b border-rule bg-card">
                  {WEEKDAYS.map((w) => (
                    <div
                      key={w}
                      className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-ink-2"
                    >
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-px bg-rule">
                  {cells.map((c) => (
                    <DayCell key={c.date} cell={c} isToday={c.date === todayStr} onClick={goToDay} />
                  ))}
                </div>
              </div>

              {/* Mobile: a vertical list of days with activity. */}
              <div className="md:hidden">
                {activeCells.length === 0 ? (
                  <div className="px-4">
                    <EmptyState title={`Nothing logged in ${monthTitle(anchor)}.`} />
                  </div>
                ) : (
                  <ul className="flex flex-col">
                    {activeCells.map((c) => (
                      <DayRow key={c.date} cell={c} isToday={c.date === todayStr} onClick={goToDay} />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </Panel>
      )}
    </>
  );
}

function RecurrenceDots({ recurrences }: { recurrences: Recurrence[] }) {
  if (recurrences.length === 0) return null;
  const shown = Math.min(recurrences.length, 3);
  const extra = recurrences.length - shown;
  return (
    <div className="flex items-center gap-0.5" aria-label={`${recurrences.length} recurring`}>
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className="size-1.5 rounded-full bg-warn" />
      ))}
      {extra > 0 ? <span className="text-[10px] leading-none text-ink-2">+{extra}</span> : null}
    </div>
  );
}

function netClass(netCents: number | undefined): string {
  if (!netCents) return "text-ink-2";
  return netCents < 0 ? "text-neg" : "text-pos";
}

function DayCell({
  cell,
  isToday,
  onClick,
}: {
  cell: Cell;
  isToday: boolean;
  onClick: (date: string) => void;
}) {
  if (!cell.inMonth) {
    return (
      <div className="min-h-20 bg-paper-2/50 p-1.5 text-right">
        <span className="tabular-nums text-xs text-ink-2/60">{cell.day}</span>
      </div>
    );
  }
  const net = cell.data?.netCents;
  return (
    <button
      type="button"
      onClick={() => onClick(cell.date)}
      className={cn(
        "flex min-h-20 flex-col gap-1 bg-card p-1.5 text-left transition-colors",
        "hover:bg-paper-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isToday && "bg-pill-brand-bg ring-1 ring-inset ring-brand/40 hover:bg-pill-brand-bg",
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "tabular-nums text-xs font-semibold",
            isToday ? "text-brand" : "text-ink",
          )}
        >
          {cell.day}
        </span>
        <RecurrenceDots recurrences={cell.recurrences} />
      </div>
      {net ? (
        <span className={cn("mt-auto text-xs font-semibold tabular-nums", netClass(net))}>
          {fmtCentsSigned(net)}
        </span>
      ) : null}
    </button>
  );
}

function DayRow({
  cell,
  isToday,
  onClick,
}: {
  cell: Cell;
  isToday: boolean;
  onClick: (date: string) => void;
}) {
  const net = cell.data?.netCents;
  return (
    <li>
      <button
        type="button"
        onClick={() => onClick(cell.date)}
        className={cn(
          "flex w-full items-center justify-between gap-3 border-b border-rule px-4 py-3 text-left transition-colors hover:bg-paper-2/60",
          isToday && "bg-pill-brand-bg",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "w-8 text-lg font-semibold tabular-nums",
              isToday ? "text-brand" : "text-ink",
            )}
          >
            {cell.day}
          </span>
          <RecurrenceDots recurrences={cell.recurrences} />
        </div>
        <div className="flex items-center gap-3">
          {cell.data ? (
            <span className="text-xs tabular-nums text-ink-2">
              {cell.data.txnCount} txn{cell.data.txnCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {net ? (
            <span className={cn("text-sm font-semibold tabular-nums", netClass(net))}>
              {fmtCentsSigned(net)}
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}
