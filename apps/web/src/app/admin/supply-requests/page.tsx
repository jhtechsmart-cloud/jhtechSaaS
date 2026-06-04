import { requireSupplyConsole } from "@/lib/auth/guard";
import { listSupplyRequests } from "@/lib/supply-requests/queries";
import { SupplyRequestTable } from "./_components/SupplyRequestTable";

// 소모품신청 목록(admin). 페이지 가드: 소모품신청 콘솔 키 중 하나(view_all/status/claim).
// RLS가 행 스코프(본인 배정+미배정 풀+view_all) 강제 → 영업담당도 진입.
export default async function SupplyRequestsPage() {
  const access = await requireSupplyConsole();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">소모품신청 조회 권한이 필요합니다.</p>
      </div>
    );
  }
  const items = await listSupplyRequests();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">소모품 신청</h1>
      <SupplyRequestTable items={items} />
    </div>
  );
}
