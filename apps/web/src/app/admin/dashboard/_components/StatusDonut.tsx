import type { BarSegment } from "@/lib/dashboard/bars";

// 상태 키 → 파스텔 색. 도넛/범례 공통. (진한 상태 스파인 색 대신 부드러운 파스텔)
const PASTEL: Record<string, string> = {
  new: "#34B8A5", // 접수 — 틸
  assigned: "#D3E478", // 배정 — 라임
  quoted: "#BFE6C1", // 견적중 — 파인
  closed: "#176455", // 완료 — 파인
  received: "#34B8A5", // 접수
  in_progress: "#BFE6C1", // 진행중
  on_hold: "#C8D8D2", // 보류 — 뉴트럴
  done: "#176455", // 완료
  canceled: "#E98668", // 취소 — 코랄
};

function pastelize(segments: BarSegment[]): BarSegment[] {
  return segments.map((s) => ({ ...s, color: PASTEL[s.key] ?? s.color }));
}

// 전체현황 도넛 — 도메인 1개 = 링 1개, 가운데 총계, 아래 범례. 집계 실패 시 error.
export function StatusDonut({
  title,
  segments,
  error = false,
}: {
  title: string;
  segments: BarSegment[];
  error?: boolean;
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-4">
        <span className="text-body font-semibold text-text">{title}</span>
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-surface-2">
          <span className="text-small text-muted">집계 실패</span>
        </div>
      </div>
    );
  }

  const segs = pastelize(segments);
  const total = segs.reduce((s, x) => s + x.count, 0);
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-4">
      <span className="text-body font-semibold text-text">{title}</span>
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-surface-2)" strokeWidth="4.5" />
          {total > 0 &&
            segs.map((s) => {
              if (s.count === 0) return null;
              const dash = `${s.pct} ${100 - s.pct}`;
              const el = (
                <circle
                  key={s.key}
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke={s.color}
                  strokeWidth="4.5"
                  pathLength={100}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                />
              );
              offset += s.pct;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-h1 font-bold tabular-nums text-text">{total}</span>
          <span className="text-micro text-muted">건</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-1">
        {segs
          .filter((s) => s.count > 0)
          .map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1 text-micro text-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label} <span className="font-mono tabular-nums">{s.count}</span>
            </span>
          ))}
      </div>
    </div>
  );
}
