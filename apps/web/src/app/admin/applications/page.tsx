import { requirePermission } from "@/lib/auth/guard";
import { listApplications } from "@/lib/applications/admin-queries";
import { ApplicationTable } from "./_components/ApplicationTable";

// 견적 트리아지 목록. 가드: applications.view_all.
// ⚠️ admin layout이 equipment.manage로 콘솔 전체를 게이트(백로그 #29) → 둘 다 필요(또는 admin).
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const access = await requirePermission("applications.view_all");
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">견적 조회 권한(applications.view_all)이 필요합니다.</p>
      </div>
    );
  }
  const { q = "", status = "all" } = await searchParams;
  const { rows, overflow } = await listApplications({ q, status });
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">견적 신청</h1>
      <ApplicationTable rows={rows} overflow={overflow} q={q} status={status} />
    </div>
  );
}
