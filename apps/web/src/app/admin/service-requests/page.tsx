import { requireServiceConsole } from "@/lib/auth/guard";
import { listServiceRequests } from "@/lib/service-requests/queries";
import { ServiceListShell } from "./_components/ServiceListShell";

// A/S 신청 목록(admin) — 고객목록과 동일 레이아웃(KPI 빠른필터+툴바+데이터 테이블).
// 페이지 가드: A/S 콘솔 키 중 하나(view_all/status/claim).
// RLS가 행 스코프(본인 배정+미배정 풀+view_all) 강제 → 영업담당도 진입.
export default async function ServiceRequestsPage() {
  const access = await requireServiceConsole();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">A/S 조회 권한이 필요합니다.</p>
      </div>
    );
  }
  const items = await listServiceRequests();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1 font-semibold text-text">A/S 신청</h1>
        <p className="mt-0.5 text-small text-muted">
          고객 A/S 접수·처리 — 전체 {items.length.toLocaleString("ko-KR")}건
        </p>
      </div>
      <ServiceListShell items={items} />
    </div>
  );
}
