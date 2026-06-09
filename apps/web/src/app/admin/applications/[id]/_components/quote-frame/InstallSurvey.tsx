export function InstallSurvey({ rows, extra }: { rows: { label: string; value: string }[]; extra: string | null }) {
  if (rows.length === 0 && !extra) return null;
  return (
    <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
      <h2 className="mb-2 text-h2 font-medium text-text">설치 설문</h2>
      <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3 py-1 text-body">
            <span className="w-24 shrink-0 text-small text-muted">{r.label}</span>
            <span className="text-text">{r.value}</span>
          </div>
        ))}
      </div>
      {extra && (
        <div className="mt-2"><div className="text-small text-muted">기타 요청사항</div>
          <p className="mt-1 whitespace-pre-wrap text-body text-text">{extra}</p></div>
      )}
    </section>
  );
}
