import Link from "next/link";

// KPI 카드 공용(대시보드 KpiCards + 서비스 리포트 KPI 5박스, #285 #C) — 마크업 복사 대신 추출.
// 집계 실패(null)는 호출부가 "—"로 정직하게 넘긴다(0으로 위장 금지). warn = 코랄 그라데이션(처리 대기 ≥1).
export function StatCard({
  label,
  value,
  sub,
  warn,
  href,
  ariaLabel,
  testId,
}: {
  label: string;
  value: string;
  sub: string | null;
  warn?: boolean;
  href?: string;
  ariaLabel?: string;
  testId?: string;
}) {
  const inner = (
    <div
      data-testid={testId}
      className={`flex h-full flex-col gap-1 rounded-2xl border bg-gradient-to-br p-5 shadow-card transition-shadow ${
        warn ? "border-coral from-coral-soft to-[#FBE2D6]" : "border-border from-surface to-mint-hover"
      } ${href ? "hover:shadow-card-hover" : ""}`}
    >
      <p className={`text-small font-medium ${warn ? "text-coral-text" : "text-muted"}`}>{label}</p>
      <p className={`text-display font-bold tracking-tight tabular-nums ${warn ? "text-coral-text" : "text-text"}`}>{value}</p>
      {sub && <p className={`text-micro ${warn ? "text-coral-text/80" : "text-muted"}`}>{sub}</p>}
    </div>
  );
  return href ? (
    <Link href={href} aria-label={ariaLabel}>
      {inner}
    </Link>
  ) : (
    inner
  );
}
