import type { BarSegment } from "@/lib/dashboard/bars";

// 한 도메인의 상태분포 색바 + mono tabular 숫자 행(DESIGN.md "모든 숫자 mono tabular").
// 0건이어도 세그먼트(0)를 보존해 숫자 행이 자리를 지킨다. 실패 시 error prop로 "집계 실패" 표시.
export function StatusBar({
  title,
  segments,
  error,
}: {
  title: string;
  segments: BarSegment[];
  error?: boolean;
}) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-small font-medium text-text">{title}</span>
        {error ? (
          <span className="text-micro text-danger">집계 실패</span>
        ) : (
          <span className="font-mono text-micro tabular-nums text-muted">{total}건</span>
        )}
      </div>
      {error ? (
        <div className="h-2 rounded-sm bg-surface-2" />
      ) : (
        <>
          <div className="flex h-2 overflow-hidden rounded-sm border border-border bg-surface-2">
            {segments.map((s) =>
              s.count > 0 ? (
                <div
                  key={s.key}
                  style={{ width: `${s.pct}%`, minWidth: 6, backgroundColor: s.color }}
                  aria-label={`${s.label} ${s.count}건`}
                />
              ) : null,
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 font-mono text-micro tabular-nums text-muted">
            {segments.map((s) => (
              <span key={s.key}>
                <span style={{ color: s.color }}>●</span> {s.label} {s.count}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
