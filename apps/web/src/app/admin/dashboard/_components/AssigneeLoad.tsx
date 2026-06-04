type Load = { id: string; name: string; applications: number; service: number; supply: number };

export function AssigneeLoad({ rows }: { rows: Load[] }) {
  const active = rows.filter((r) => r.applications + r.service + r.supply > 0);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-small font-semibold text-muted">담당자별 부하 (미완료)</p>
      {active.length === 0 ? (
        <p className="text-small text-muted">진행 중인 배정 건이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-small tabular-nums text-text">
          {active.map((r) => (
            <span key={r.id}>{r.name} 견적{r.applications}·A/S{r.service}·소모품{r.supply}</span>
          ))}
        </div>
      )}
    </div>
  );
}
