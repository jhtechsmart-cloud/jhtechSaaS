import { requirePermission } from "@/lib/auth/guard";
import { listServiceRequests } from "@/lib/service-requests/queries";
import { ServiceRequestTable } from "./_components/ServiceRequestTable";

// A/S 신청 목록(admin). 페이지 가드: service_requests.view_all.
// ⚠️ admin layout이 equipment.manage로 콘솔 전체를 게이트(백로그 #29) → 둘 다 필요(또는 admin).
export default async function ServiceRequestsPage() {
  const access = await requirePermission("service_requests.view_all");
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">A/S 조회 권한(service_requests.view_all)이 필요합니다.</p>
      </div>
    );
  }
  const items = await listServiceRequests();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">A/S 신청</h1>
      <ServiceRequestTable items={items} />
    </div>
  );
}
