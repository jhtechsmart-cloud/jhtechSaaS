import Link from "next/link";

// KPI 4장 — 처리 대기(≥1 코랄 경고) / 진행 중 견적(건수+합계) / 이번 주 데모·납품(+가동률) / 전체 고객(+이번 달 신규).
// 집계 실패(null)는 "—"로 정직하게 표시(0으로 위장 금지).

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

function Card({
  label,
  value,
  sub,
  warn,
  href,
}: {
  label: string;
  value: string;
  sub: string | null;
  warn?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={`flex h-full flex-col gap-1 rounded-2xl border bg-gradient-to-br p-5 shadow-card transition-shadow ${
        warn
          ? "border-coral from-coral-soft to-[#FBE2D6]"
          : "border-border from-surface to-mint-hover"
      } ${href ? "hover:shadow-card-hover" : ""}`}
    >
      <p className={`text-small font-medium ${warn ? "text-coral-text" : "text-muted"}`}>{label}</p>
      <p className={`text-display font-bold tracking-tight tabular-nums ${warn ? "text-coral-text" : "text-text"}`}>
        {value}
      </p>
      {sub && <p className={`text-micro ${warn ? "text-coral-text/80" : "text-muted"}`}>{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function KpiCards({
  pending,
  inProgress,
  weekSchedule,
  customers,
}: {
  pending: { total: number; apps: number; service: number; supply: number } | null;
  inProgress: { count: number; totalSum: number } | null;
  weekSchedule: { demoCount: number; deliveryCount: number; utilization: number } | null;
  customers: { total: number; newThisMonth: number } | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        label="처리 대기"
        value={pending ? `${pending.total}건` : "—"}
        sub={
          pending
            ? pending.total > 0
              ? `견적 ${pending.apps} · A/S ${pending.service} · 소모품 ${pending.supply}`
              : "모두 처리됨"
            : "집계 실패"
        }
        warn={!!pending && pending.total > 0}
        href="/admin/applications"
      />
      <Card
        label="진행 중 견적"
        value={inProgress ? `${inProgress.count}건` : "—"}
        sub={inProgress ? `합계 ${won(inProgress.totalSum)}` : "집계 실패"}
        href="/admin/applications"
      />
      <Card
        label="이번 주 데모·납품"
        value={weekSchedule ? `${weekSchedule.demoCount + weekSchedule.deliveryCount}건` : "—"}
        sub={
          weekSchedule
            ? `데모 ${weekSchedule.demoCount} · 납품 ${weekSchedule.deliveryCount} · 데모센터 가동률 ${weekSchedule.utilization}%`
            : "집계 실패"
        }
        href="/admin/demo-reservations"
      />
      <Card
        label="전체 고객"
        value={customers ? customers.total.toLocaleString("ko-KR") : "—"}
        sub={customers ? `이번 달 신규 +${customers.newThisMonth}` : "집계 실패"}
        href="/admin/customers"
      />
    </div>
  );
}
