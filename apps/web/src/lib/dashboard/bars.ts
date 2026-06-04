// 대시보드 색바·빈상태 순수 함수 — server-only 아님(단위 테스트 대상, 컴포넌트가 표시만).

export interface BarSegment {
  key: string;
  label: string;
  color: string;
  count: number;
  pct: number; // 0~100, 전체 0이면 0
}

// count record + 상태 메타 + 순서 → 세그먼트 배열. 0건도 세그먼트를 보존(색바가 "0·0·0" 자리 유지).
export function toBarSegments<K extends string>(
  counts: Record<K, number>,
  meta: Record<K, { label: string; color: string }>,
  order: readonly K[],
): BarSegment[] {
  const total = order.reduce((s, k) => s + (counts[k] ?? 0), 0);
  return order.map((k) => {
    const count = counts[k] ?? 0;
    return {
      key: k,
      label: meta[k].label,
      color: meta[k].color,
      count,
      pct: total === 0 ? 0 : Math.round((count / total) * 100),
    };
  });
}

// 전체 도메인 건수 합이 0이면 빈 대시보드(온보딩 노출).
export function isDashboardEmpty(totals: { applications: number; service: number; supply: number }): boolean {
  return totals.applications === 0 && totals.service === 0 && totals.supply === 0;
}
