import Link from "next/link";
import type { DemoReservationRow } from "@/lib/demo-reservations/queries";
import { formatMonthDayWeekday } from "@/lib/format/schedule";
import { SectionHeader } from "@/app/admin/_components/SectionHeader";

// 캘린더 아래 "이번 달 예약" 리스트 — 선택 월의 데모 예약을 시작시각 순으로 표시.
// 행 클릭 = 그 날짜로 타임라인 이동(?date=). 데모는 보라 좌측 보더, 완료는 중립 회색.
export function MonthReservationList({
  month,
  selected,
  reservations,
}: {
  month: number;
  selected: string; // 현재 선택일 KST "YYYY-MM-DD"
  reservations: DemoReservationRow[];
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <SectionHeader
        title={`${month}월 예약`}
        meta={<span className="tabular-nums">{reservations.length}건</span>}
      />
      {reservations.length === 0 ? (
        <p className="py-3 text-small text-empty">이번 달 예약이 없습니다</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {reservations.map((r) => {
            const done = r.status === "done";
            const isSel = r.date === selected;
            return (
              <li key={r.id}>
                <Link
                  href={`/admin/demo-reservations?date=${r.date}`}
                  className={`block rounded-lg border-l-4 px-3 py-2 transition-colors ${
                    done ? "border-inactive bg-surface-2" : "border-demo bg-demo-soft/50 hover:bg-demo-soft"
                  } ${isSel ? "ring-1 ring-demo" : ""}`}
                >
                  <p className="flex items-center gap-2 text-small font-semibold text-text">
                    <span className="tabular-nums">{formatMonthDayWeekday(r.date)}</span>
                    <span className="font-normal text-muted tabular-nums">
                      {r.start}–{r.end}
                    </span>
                    {done && (
                      <span className="ml-auto shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-micro font-medium text-muted">
                        완료
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-micro text-muted">
                    {r.customerName} · {r.equipmentNames.join(", ") || "장비"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
