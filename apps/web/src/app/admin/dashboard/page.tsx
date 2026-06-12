import { can } from "@jhtechsaas/shared";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { countNewApplications } from "@/lib/applications/admin-queries";
import { countUnreadServiceRequests } from "@/lib/service-requests/queries";
import { countUnreadSupplyRequests } from "@/lib/supply-requests/queries";
import { countApplicationsByStatus } from "@/lib/dashboard/aggregates";
import { listRecentRequests } from "@/lib/dashboard/recent";
import {
  customersWithNewThisMonth,
  inProgressQuotes,
  listCalendarEvents,
  staleQuoteSentCount,
  weekDemoDelivery,
} from "@/lib/dashboard/v2-queries";
import {
  buildTwoWeekDays,
  buildWeeklyUnits,
  demoUtilization,
  pipelineRows,
  type ActivityType,
} from "@/lib/dashboard/v2-logic";
import { listUpcomingSchedules } from "@/lib/demo-reservations/queries";
import { addDaysKst, kstDateOf, todayKst } from "@/lib/format/kst";
import { KpiCards } from "./_components/KpiCards";
import { TwoWeekCalendar } from "./_components/TwoWeekCalendar";
import { PipelineRows } from "./_components/PipelineRows";
import { WeeklyUnitChart } from "./_components/WeeklyUnitChart";
import { DashboardRightRail } from "./_components/DashboardRightRail";
import { RecentActivity } from "./_components/RecentActivity";

// 대시보드 v2 — "현황 + 2주 일정" 중심: KPI 4장 / 2주 캘린더(전체 폭) / 파이프라인 세로 행 /
// 주간 단위블록 / 우측 일정 레일 / 최근 활동. 역할 분기는 RLS 행 스코프가 자동 적용
// (영업 = 본인 배정+미배정, 관리자 = 전체) — 라벨도 가시 범위에 정직하게.

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

  const today = todayKst();
  const days = buildTwoWeekDays(today);
  const weekStart = days[0].date; // 이번 주 월
  const weekEndExclusive = days[7].date; // 다음 주 월(미포함 경계)
  const twoWeekEndExclusive = addDaysKst(days[13].date, 1);
  const monthFirst = `${today.slice(0, 7)}-01`;
  const nowIso = new Date().toISOString();

  const [
    newApps, unreadSvc, unreadSup,
    appByStatus, inProgress, weekSched, customers, stale,
    events, upcoming, recent,
  ] = await Promise.allSettled([
    countNewApplications(),
    countUnreadServiceRequests(),
    countUnreadSupplyRequests(),
    countApplicationsByStatus(),
    inProgressQuotes(),
    weekDemoDelivery(weekStart, weekEndExclusive),
    customersWithNewThisMonth(monthFirst),
    staleQuoteSentCount(nowIso),
    listCalendarEvents(weekStart, twoWeekEndExclusive),
    listUpcomingSchedules(today, 5),
    listRecentRequests(40),
  ]);

  // KPI ① 처리 대기 — 셋 다 성공해야 합산 표시(부분 실패를 작은 수로 위장 금지)
  const nApps = val(newApps);
  const nSvc = val(unreadSvc);
  const nSup = val(unreadSup);
  const pending =
    nApps != null && nSvc != null && nSup != null
      ? { total: nApps + nSvc + nSup, apps: nApps, service: nSvc, supply: nSup }
      : null;

  const weekRaw = val(weekSched);
  const weekSchedule = weekRaw
    ? {
        demoCount: weekRaw.demoCount,
        deliveryCount: weekRaw.deliveryCount,
        utilization: demoUtilization(weekRaw.demoMinutes),
      }
    : null;

  const appCounts = val(appByStatus);
  const recentRows = val(recent) ?? [];

  // 주간 활동 — 이번 주(월~일) 신청 3종을 KST 날짜로 그룹(블록 1개=1건)
  const domainToType: Record<string, ActivityType> = {
    application: "quote",
    service: "service",
    supply: "supply",
  };
  const weekItems = recentRows
    .map((r) => ({
      date: kstDateOf(r.created_at) ?? "",
      type: domainToType[r.domain],
      title: `${r.company} ${r.typeLabel}`,
    }))
    .filter((i) => i.date >= weekStart && i.date < weekEndExclusive);
  const weeklyUnits = buildWeeklyUnits(
    weekItems,
    days.slice(0, 7).map((d) => d.date),
  );

  // 이번 달 신청(우측 레일) — recent에서 월초 이후만 5건
  const monthRequests = recentRows
    .filter((r) => (kstDateOf(r.created_at) ?? "") >= monthFirst)
    .slice(0, 5);

  // 현황 라벨은 가시 범위에 정직하게(영업의 RLS 스코프 = 본인+미배정)
  const hasFullView =
    can(access.permissions, "applications.view_all") ||
    can(access.permissions, "users.manage");
  const scopeLabel = hasFullView ? "전체" : "내 담당";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-h1 font-semibold text-text">대시보드</h1>
        <p className="text-small text-muted">{scopeLabel} 현황과 2주 일정을 한눈에</p>
      </div>

      <KpiCards
        pending={pending}
        inProgress={val(inProgress)}
        weekSchedule={weekSchedule}
        customers={val(customers)}
      />

      <TwoWeekCalendar days={days} events={val(events) ?? []} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_330px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <PipelineRows
              rows={pipelineRows(
                appCounts ?? { new: 0, assigned: 0, quoted: 0, quote_sent: 0, closed: 0 },
              )}
              staleCount={val(stale) ?? 0}
            />
            <WeeklyUnitChart days={weeklyUnits} />
          </div>
          <RecentActivity requests={recentRows.slice(0, 8)} />
        </div>
        <DashboardRightRail upcoming={val(upcoming) ?? []} monthRequests={monthRequests} />
      </div>
    </div>
  );
}
