import Link from "next/link";

type Field = { label: string; value: string | null; mono?: boolean };

// 신청기업 정보 그리드 + 요청 배경. 주업종·사업자등록일은 후속(없으면 미표시).
export function ApplicantInfo({
  companyId, fields, requirements, equipmentName,
}: {
  companyId: string | null;
  fields: Field[];
  requirements: string | null;
  equipmentName: string | null;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-text">신청기업 정보</h2>
        <span className="text-micro text-muted">접수 시 자동 수집</span>
      </div>
      {companyId && (
        <Link href={`/admin/customers/${companyId}`} className="mb-2 inline-block text-small font-medium text-accent hover:underline">
          이 고객의 통합 이력 보기 →
        </Link>
      )}
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label}>
            <div className="text-micro text-muted">{f.label}</div>
            <div className={`text-body text-text ${f.mono ? "font-mono tabular-nums" : ""}`}>{f.value || "-"}</div>
          </div>
        ))}
      </div>
      {equipmentName && (
        <div className="mt-3 border-t border-border pt-3">
          <span className="text-small text-muted">요청 장비 </span>
          <span className="text-body font-medium text-text">{equipmentName}</span>
        </div>
      )}
      {requirements && (
        <div className="mt-3 rounded-sm border-l-2 border-accent bg-surface-2 p-3">
          <p className="whitespace-pre-wrap text-body text-text">{requirements}</p>
        </div>
      )}
    </section>
  );
}
