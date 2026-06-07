import Link from "next/link";
import { can } from "@jhtechsaas/shared";
import { requireApplicationsConsole } from "@/lib/auth/guard";
import { listApplications } from "@/lib/applications/admin-queries";
import { ApplicationTable } from "./_components/ApplicationTable";

// 견적 트리아지 목록. 가드: 견적 콘솔 키 중 하나(view_all/assign/status/claim).
// RLS가 행 스코프(본인 배정+미배정 풀+view_all 전체) 강제 → 영업담당도 진입.
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const access = await requireApplicationsConsole();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">견적 조회 권한이 필요합니다.</p>
      </div>
    );
  }
  const { q = "", status = "all" } = await searchParams;
  const { rows, overflow } = await listApplications({ q, status });
  const canQuote = can(access.permissions, "quotes.write");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">견적 신청</h1>
        {canQuote && (
          <Link
            href="/admin/quotes/new"
            className="rounded-md bg-accent px-3 py-1.5 text-small font-medium text-white"
          >
            수기 견적 작성
          </Link>
        )}
      </div>
      <ApplicationTable rows={rows} overflow={overflow} q={q} status={status} />
    </div>
  );
}
