"use client";

import type { DemoReservationRow } from "@/lib/demo-reservations/queries";

// 등록 화면 우측 패널 — 선택일 기존 예약 요약 + 데모센터 단일 안내.
export function DaySummaryPanel({
  date,
  reservations,
  loading,
}: {
  date: string;
  reservations: DemoReservationRow[];
  loading: boolean;
}) {
  const [, mm, dd] = date.split("-");
  return (
    <aside className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <p className="text-body font-semibold text-text">
          <span className="tabular-nums">{Number(mm)}월 {Number(dd)}일</span> 기존 예약
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {loading ? (
            <p className="text-small text-faint">불러오는 중…</p>
          ) : reservations.length === 0 ? (
            <p className="text-small text-empty">예약 없음 — 모든 시간이 비어 있습니다</p>
          ) : (
            reservations.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-lg border-l-4 border-demo bg-demo-soft/60 px-3 py-2"
              >
                <span className="shrink-0 text-small font-semibold text-text tabular-nums">
                  {r.start}–{r.end}
                </span>
                <span className="truncate text-small text-text">
                  {r.customerName} · {r.equipmentNames.join(", ") || "장비"}
                  {r.assigneeName ? ` · 담당 ${r.assigneeName}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-mint-hover p-5">
        <p className="text-small font-semibold text-accent">장비별 시간 중복 차단</p>
        <p className="mt-1.5 text-small leading-relaxed text-muted">
          한 예약에 여러 장비를 담을 수 있고, 같은 장비가 같은 시간대에 겹칠 때만 충돌로
          막습니다. 다른 장비는 같은 시간대도 가능합니다. 저장 시점에 같은 장비 예약이 먼저
          등록되면 충돌 안내가 표시됩니다.
        </p>
      </div>
    </aside>
  );
}
