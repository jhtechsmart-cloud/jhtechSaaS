import { requireServiceReportsRead } from "@/lib/auth/guard";
import { adminKpisAction, adminListReportsAction, adminTabCountsAction } from "@/lib/service-reports/admin-actions";
import { canResolveFollow, defaultTabFor, isReportTabKey } from "@/lib/service-reports/report-tabs";
import { KpiRow } from "./_components/KpiRow";
import { ReportTable } from "./_components/ReportTable";

// 서비스 리포트 목록(admin) — 작성·수정은 현장 콘솔(/field) 전용. (#228 Part 4 → #285 #C 결재 흐름)
// KPI 5박스(탭 링크) + 탭 7종(URL ?tab=, 기본 탭 = 내 권한) + 표(행 클릭 → 상세). 승인·완료·무효화는 상세에서.
// ⚠️ 탭 필터·건수는 서버에서 계산한다 — 최근 N건만 불러와 클라에서 세면 창 밖의 미처리 업무가 사라지고 KPI와 어긋난다.
export const dynamic = "force-dynamic";

export default async function ServiceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string }>;
}) {
  const access = await requireServiceReportsRead();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">서비스 리포트 조회 권한이 필요합니다.</p>
      </div>
    );
  }
  const sp = await searchParams;
  const tab = isReportTabKey(sp.tab) ? sp.tab : defaultTabFor(access.permissions);
  const period = sp.period === "month" ? "month" : "all";
  const [res, kpiRes, countRes] = await Promise.all([
    adminListReportsAction(tab, period),
    adminKpisAction(),
    adminTabCountsAction(period),
  ]);
  const counts = countRes.ok ? countRes.data : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1 font-semibold text-text">서비스 리포트</h1>
        <p className="mt-0.5 text-small text-muted">
          현장 A/S 결과 보고서 — 작성은 현장 콘솔(as.jhtech.co.kr)에서 · 결재(승인·완료)는 상세에서
          {counts ? ` · 전체 ${counts.all.toLocaleString("ko-KR")}건` : ""}
        </p>
      </div>
      <KpiRow kpis={kpiRes.ok ? kpiRes.data : null} mailUnsent={counts?.mail_unsent ?? 0} />
      {!res.ok ? (
        <p className="rounded-md border border-border bg-surface p-4 text-small text-danger">
          목록을 불러오지 못했습니다: {res.error}
        </p>
      ) : (
        <ReportTable
          items={res.data}
          counts={counts}
          tab={tab}
          period={period}
          canResolveFollow={canResolveFollow(access.permissions)}
        />
      )}
    </div>
  );
}
