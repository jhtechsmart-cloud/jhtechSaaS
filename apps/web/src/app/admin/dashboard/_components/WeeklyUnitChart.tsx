import type { WeeklyUnitDay } from "@/lib/dashboard/v2-logic";
import { ACTIVITY_META } from "@/lib/dashboard/v2-meta";
import { formatMonthDayWeekday } from "@/lib/format/schedule";

// 주간 활동 — 요일별 단위 블록 스택(블록 1개 = 1건, 막대 높이 비례 금지).
// 열 상단 합계 숫자, 블록 hover = title 툴팁(유형·건명), 12건 초과 "+N".
export function WeeklyUnitChart({ days }: { days: WeeklyUnitDay[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-h2 font-semibold text-text">주간 활동</p>
        <div className="flex gap-3 text-micro text-muted">
          {(Object.keys(ACTIVITY_META) as Array<keyof typeof ACTIVITY_META>).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: ACTIVITY_META[k].color }} />
              {ACTIVITY_META[k].label}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => (
          <div key={d.date} className="flex flex-col items-center gap-1.5">
            <span className="text-small font-semibold text-text tabular-nums">{d.total}</span>
            {/* 블록은 아래에서 위로 쌓임 — 오래된 건이 아래 */}
            <div className="flex min-h-28 w-full flex-col-reverse items-stretch justify-start gap-0.5">
              {d.units.map((u, i) => (
                <span
                  key={i}
                  title={`${ACTIVITY_META[u.type].label}${u.title ? ` · ${u.title}` : ""}`}
                  className="h-2.5 w-full rounded-sm"
                  style={{ backgroundColor: ACTIVITY_META[u.type].color }}
                />
              ))}
              {d.overflow > 0 && (
                <span className="text-center text-micro font-medium text-muted">+{d.overflow}</span>
              )}
            </div>
            <span className="text-micro text-muted tabular-nums">
              {formatMonthDayWeekday(d.date)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
