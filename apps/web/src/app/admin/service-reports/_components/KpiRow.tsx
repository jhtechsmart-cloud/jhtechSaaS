import { StatCard } from "@/components/StatCard";
import type { ServiceReportKpis } from "@/lib/service-reports/admin-actions";
import { kpiTabHref } from "@/lib/service-reports/report-tabs";

// #285 KPI 5박스 — A/S 접수 · 후속조치 중 · 승인 대기(≥1 코랄) · 세금계산서 미발행 · 이번 달 완료.
// 각 박스 = 탭 링크(D-B8). 집계 실패는 "—"(0으로 위장 금지). 모바일 2열(5번째 전폭).
export function KpiRow({ kpis, mailUnsent }: { kpis: ServiceReportKpis | null; mailUnsent: number }) {
  const v = (n: number | undefined) => (kpis && n !== undefined ? `${n.toLocaleString("ko-KR")}건` : "—");
  const sub = (s: string) => (kpis ? s : "집계 실패");
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="report-kpis">
      <StatCard label="A/S 접수" value={v(kpis?.received)} sub={sub("접수·진행·보류 의뢰")} href={kpiTabHref("received")} testId="kpi-received" />
      <StatCard label="후속조치 중" value={v(kpis?.follow_open)} sub={sub("재방문 예정")} href={kpiTabHref("follow_open")} testId="kpi-follow" />
      <StatCard
        label="승인 대기"
        value={v(kpis?.awaiting_approval)}
        sub={sub(mailUnsent > 0 ? `메일 미발송 ${mailUnsent}` : "결재 대기")}
        warn={!!kpis && kpis.awaiting_approval > 0}
        href={kpiTabHref("awaiting_approval")}
        ariaLabel={kpis ? `승인 대기 ${kpis.awaiting_approval}건, 탭 열기` : undefined}
        testId="kpi-awaiting-approval"
      />
      <StatCard label="세금계산서 미발행" value={v(kpis?.awaiting_tax)} sub={sub("관리부 확인 대기")} href={kpiTabHref("awaiting_tax")} testId="kpi-awaiting-tax" />
      <div className="col-span-2 lg:col-span-1">
        <StatCard label="A/S 완료 (이번 달)" value={v(kpis?.completed_this_month)} sub={sub("완료 처리 기준")} href={kpiTabHref("completed_this_month")} testId="kpi-completed" />
      </div>
    </div>
  );
}
