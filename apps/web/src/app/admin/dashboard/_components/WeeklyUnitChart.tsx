import type { WeeklyUnitDay } from "@/lib/dashboard/v2-logic";
import { ACTIVITY_META } from "@/lib/dashboard/v2-meta";
import { formatMonthDayWeekday } from "@/lib/format/schedule";
import { SectionHeader } from "@/app/admin/_components/SectionHeader";

// 주간 활동 — 요일별 단위 블록 스택(블록 1개 = 1건, 막대 높이 비례 금지).
// 열 상단 합계 숫자, 블록 hover = title 툴팁(유형·건명), 12건 초과 "+N".
export function WeeklyUnitChart({ days }: { days: WeeklyUnitDay[] }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <SectionHeader
        title="주간 활동"
        meta={
          <span className="flex gap-3">
            {(Object.keys(ACTIVITY_META) as Array<keyof typeof ACTIVITY_META>).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: ACTIVITY_META[k].color }} />
                {ACTIVITY_META[k].label}
              </span>
            ))}
          </span>
        }
      />
      {/* 하루 = 한 레인 — hairline 세로 구분선으로 요일 경계를 또렷하게 */}
      <div className="grid grid-cols-7 divide-x divide-row-line">
        {days.map((d, di) => {
          // "6/7 (일)" → 날짜 위·요일 아래 두 줄(라벨이 열 단위로 묶여 하루 구분이 명확)
          const [md, dow] = (formatMonthDayWeekday(d.date) ?? d.date).split(" ");
          const isWeekend = di === 0 || di === 6;
          return (
            <div key={d.date} className="flex flex-col items-center gap-1.5 px-1.5">
              <span className="text-small font-semibold text-text tabular-nums">{d.total}</span>
              {/* 블록은 아래에서 위로 쌓임 — 오래된 건이 아래. 높이 고정(최대 12블록+오버플로)으로 하단 날짜 라벨 위치 불변 */}
              <div className="flex h-40 w-full flex-col-reverse items-stretch justify-start gap-0.5">
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
              <span className="flex flex-col items-center leading-tight">
                <span className="whitespace-nowrap text-micro font-medium text-text tabular-nums">{md}</span>
                {/* 주말 흐림은 AA 충족 토큰으로(faint #92ACA4는 작은 글씨 금지 — DESIGN.md) */}
                <span className={`text-micro ${isWeekend ? "text-muted-foreground" : "text-muted"}`}>{dow}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
