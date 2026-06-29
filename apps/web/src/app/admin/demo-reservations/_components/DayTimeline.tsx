"use client";

import { useMemo, useState } from "react";
import type { DemoReservationRow } from "@/lib/demo-reservations/queries";
import { OPEN_HOUR, CLOSE_HOUR } from "@/lib/demo-reservations/constants";
import { layoutDayReservations } from "@/lib/demo-reservations/timeline-layout";
import { ReservationDetailDialog } from "./ReservationDetailDialog";

// 선택일 타임라인 — 09:00–18:00, 1시간 행 그리드 위에 예약 블록을 분 단위 절대배치.
// 같은 시간대 겹치는 예약(복수장비 개편으로 가능)은 열로 나눠 나란히 표시한다.
// 블록 클릭 → 상세/취소 다이얼로그.

const HOUR_PX = 64; // 1시간 행 높이(px) — 1분 = 64/60px

function minutesFromOpen(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h - OPEN_HOUR) * 60 + m;
}

export function DayTimeline({
  date,
  reservations,
  canWrite,
}: {
  date: string;
  reservations: DemoReservationRow[];
  canWrite: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const hours = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);
  const selected = reservations.find((r) => r.id === openId) ?? null;
  const [, mm, dd] = date.split("-");
  // 겹치는 예약을 열로 나누기 위한 배치(col/cols) 계산.
  const placements = useMemo(
    () =>
      layoutDayReservations(
        reservations.map((r) => ({ id: r.id, start: r.start, end: r.end })),
      ),
    [reservations],
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <p className="text-h2 font-semibold text-text">
          <span className="tabular-nums">{Number(mm)}월 {Number(dd)}일</span> 일정
        </p>
        <p className="text-small text-muted tabular-nums">{reservations.length}건</p>
      </div>

      <div className="relative mt-4" style={{ height: hours.length * HOUR_PX }}>
        {/* 시간 행 그리드 */}
        {hours.map((h, i) => (
          <div
            key={h}
            className="absolute inset-x-0 border-t border-row-line"
            style={{ top: i * HOUR_PX, height: HOUR_PX }}
          >
            <span className="absolute -top-2 left-0 w-12 bg-surface pr-2 text-right text-micro text-faint tabular-nums">
              {String(h).padStart(2, "0")}:00
            </span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-row-line">
          <span className="absolute -top-2 left-0 w-12 bg-surface pr-2 text-right text-micro text-faint tabular-nums">
            {CLOSE_HOUR}:00
          </span>
        </div>

        {/* 예약 블록 — 트랙(시간축 오른쪽) 안에서 겹침은 열로 분할 배치 */}
        <div className="absolute inset-y-0 left-14 right-2">
          {reservations.map((r) => {
            const top = (minutesFromOpen(r.start) * HOUR_PX) / 60;
            const height = (r.durationMin * HOUR_PX) / 60;
            const place = placements.get(r.id) ?? { col: 0, cols: 1 };
            const widthPct = 100 / place.cols;
            const contacts = [
              r.assigneeName ? `담당 ${r.assigneeName}` : null,
              r.visitorName,
              r.visitorPhone,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setOpenId(r.id)}
                className={`absolute overflow-hidden rounded-lg px-3 py-1.5 text-left transition-shadow hover:shadow-card ${
                  r.status === "done" ? "bg-surface-2" : "bg-demo-soft"
                }`}
                style={{
                  top: top + 1,
                  height: Math.max(height - 2, 28),
                  left: `${place.col * widthPct}%`,
                  width: `calc(${widthPct}% - 4px)`,
                }}
              >
                <p className="flex items-center gap-1.5 text-small font-semibold text-text">
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      r.status === "done" ? "bg-inactive" : "bg-demo"
                    }`}
                  />
                  <span className="truncate">
                    {r.equipmentNames.join(", ") || "장비"}
                    <span className="ml-2 font-normal text-muted tabular-nums">
                      {r.start}–{r.end} ({r.durationMin}분)
                    </span>
                  </span>
                </p>
                {height >= 48 && (
                  <p className="truncate text-micro text-muted">
                    {r.customerName}
                    {contacts && <span> · {contacts}</span>}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {reservations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-small text-empty">이 날짜에는 예약이 없습니다</p>
          </div>
        )}
      </div>

      {selected && (
        <ReservationDetailDialog
          reservation={selected}
          canWrite={canWrite}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
