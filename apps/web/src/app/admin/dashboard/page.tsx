import { can } from "@jhtechsaas/shared";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { countNewApplications } from "@/lib/applications/admin-queries";
import { countUnreadServiceRequests } from "@/lib/service-requests/queries";
import { countUnreadSupplyRequests } from "@/lib/supply-requests/queries";
import {
  countApplicationsByStatus,
  countServiceByStatus,
  countSupplyByStatus,
  countCustomers,
  countCompanyEquipment,
  countActiveEquipment,
  assigneeLoad,
} from "@/lib/dashboard/aggregates";
import { toBarSegments, isDashboardEmpty } from "@/lib/dashboard/bars";
import { listRecentRequests } from "@/lib/dashboard/recent";
import { APPLICATION_STATUS_META, APPLICATION_STATUSES } from "@/lib/application-status";
import { STATUS_META } from "@/lib/request-status";
import { SERVICE_REQUEST_STATUSES } from "@/lib/service-requests/status";
import { SUPPLY_REQUEST_STATUSES } from "@/lib/supply-requests/status";
import { ActionQueue } from "./_components/ActionQueue";
import { StatusDonut } from "./_components/StatusDonut";
import { ReferenceCounts } from "./_components/ReferenceCounts";
import { EmptyOnboarding } from "./_components/EmptyOnboarding";
import { AssigneeLoad } from "./_components/AssigneeLoad";
import { RightRail } from "./_components/RightRail";

// settled 결과 → 값 또는 null(실패). 블록별 에러 흡수(한 집계 실패가 전체를 무너뜨리지 않음).
function val<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

export default async function DashboardPage() {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">콘솔 접근 권한이 필요합니다.</p>
      </div>
    );
  }

  const [
    newApps, unreadSvc, unreadSup,
    appByStatus, svcByStatus, supByStatus,
    customers, equipment, catalog,
  ] = await Promise.allSettled([
    countNewApplications(), countUnreadServiceRequests(), countUnreadSupplyRequests(),
    countApplicationsByStatus(), countServiceByStatus(), countSupplyByStatus(),
    countCustomers(), countCompanyEquipment(), countActiveEquipment(),
  ]);

  const appCounts = val(appByStatus);
  const svcCounts = val(svcByStatus);
  const supCounts = val(supByStatus);

  const totals = {
    applications: appCounts ? Object.values(appCounts).reduce((s, n) => s + n, 0) : 0,
    service: svcCounts ? Object.values(svcCounts).reduce((s, n) => s + n, 0) : 0,
    supply: supCounts ? Object.values(supCounts).reduce((s, n) => s + n, 0) : 0,
  };
  // 모든 도메인 집계가 성공 + 전부 0일 때만 빈상태(집계 실패를 빈상태로 위장 금지).
  const allFetched = appCounts != null && svcCounts != null && supCounts != null;
  const empty = allFetched && isDashboardEmpty(totals);

  // 담당자별 부하 — users.manage만(profiles 이름 RLS). 실패는 null로 흡수.
  const loadRows = can(access.permissions, "users.manage")
    ? await assigneeLoad().catch(() => null)
    : null;

  // 우측 레일(캘린더 + 이번 달 신청) — 실패는 빈 배열로 흡수.
  const recent = await listRecentRequests().catch(() => []);

  // 현황 라벨은 가시 범위에 정직하게 — view_all 보유자는 "전체", 본인 스코프 영업은 "내".
  // (RLS가 영업에겐 본인+미배정 풀만 보여주므로 "전체"라 적으면 거짓 현황이 된다.)
  const hasFullView =
    can(access.permissions, "applications.view_all") ||
    can(access.permissions, "service_requests.view_all") ||
    can(access.permissions, "supply_requests.view_all");
  const statusTitle = hasFullView ? "전체 현황" : "내 현황";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-h1 font-semibold text-text">대시보드</h1>
        <p className="text-small text-muted">오늘 처리할 일과 전체 현황을 한눈에</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        {/* 본문 */}
        <div className="flex flex-col gap-5">
          {empty ? (
            <EmptyOnboarding permissions={access.permissions} />
          ) : (
            <ActionQueue counts={{ applications: val(newApps), service: val(unreadSvc), supply: val(unreadSup) }} />
          )}

          <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-md">
            <p className="text-h2 font-semibold text-text">{statusTitle}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatusDonut
                title="견적"
                error={appCounts == null}
                segments={appCounts ? toBarSegments(appCounts, APPLICATION_STATUS_META, APPLICATION_STATUSES) : []}
              />
              <StatusDonut
                title="A/S"
                error={svcCounts == null}
                segments={svcCounts ? toBarSegments(svcCounts, STATUS_META, SERVICE_REQUEST_STATUSES) : []}
              />
              <StatusDonut
                title="소모품"
                error={supCounts == null}
                segments={supCounts ? toBarSegments(supCounts, STATUS_META, SUPPLY_REQUEST_STATUSES) : []}
              />
            </div>
            <ReferenceCounts customers={val(customers)} equipment={val(equipment)} catalog={val(catalog)} />
            {can(access.permissions, "users.manage") && loadRows && <AssigneeLoad rows={loadRows} />}
          </section>
        </div>

        {/* 우측 레일 */}
        <RightRail requests={recent} />
      </div>
    </div>
  );
}
