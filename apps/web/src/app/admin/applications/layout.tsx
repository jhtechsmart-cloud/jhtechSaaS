import type { ReactNode } from "react";
import { can } from "@jhtechsaas/shared";
import { requireApplicationsConsole } from "@/lib/auth/guard";
import { listApplicationsPage, countApplicationsByGroup } from "@/lib/applications/admin-queries";
import { ApplicationListPane } from "./_components/ApplicationListPane";

const PAGE = 30;

// 의뢰관리 2분할 셸 — 왼쪽 목록 패널(고정) + 오른쪽 상세({children}).
// 레이아웃은 자식 네비게이션 시 리렌더되지 않아 목록이 유지된다(마스터-디테일).
export default async function ApplicationsLayout({ children }: { children: ReactNode }) {
  const access = await requireApplicationsConsole();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">견적 조회 권한이 필요합니다.</p>
      </div>
    );
  }
  const [first, counts] = await Promise.all([
    listApplicationsPage({ scope: "active", offset: 0, limit: PAGE }),
    countApplicationsByGroup(),
  ]);
  return (
    <div className="-m-6 flex h-[calc(100dvh-57px)]">
      <ApplicationListPane
        initialRows={first.rows}
        initialHasMore={first.hasMore}
        counts={counts}
        canQuote={can(access.permissions, "quotes.write")}
      />
      <div className="min-w-0 flex-1 overflow-y-auto p-6">{children}</div>
    </div>
  );
}
