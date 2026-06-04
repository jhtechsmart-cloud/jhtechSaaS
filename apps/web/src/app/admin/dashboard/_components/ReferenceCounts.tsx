// 하단 참조 숫자 한 줄 — 고객·보유장비·카탈로그 장비. null=집계 실패는 "—".
export function ReferenceCounts({
  customers,
  equipment,
  catalog,
}: {
  customers: number | null;
  equipment: number | null;
  catalog: number | null;
}) {
  const fmt = (n: number | null) => (n == null ? "—" : n);
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 font-mono text-small tabular-nums text-muted">
      <span>고객 {fmt(customers)}</span>
      <span>보유장비 {fmt(equipment)}</span>
      <span>카탈로그 장비 {fmt(catalog)}</span>
    </div>
  );
}
