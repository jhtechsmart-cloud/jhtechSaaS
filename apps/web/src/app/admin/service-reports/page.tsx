import { requireServiceReportsRead } from "@/lib/auth/guard";
import { adminListReportsAction } from "@/lib/service-reports/admin-actions";
import { can } from "@jhtechsaas/shared";
import { ReportTable } from "./_components/ReportTable";

// 서비스 리포트 목록(admin, 읽기 전용) — 작성·수정은 현장 콘솔(/field) 전용. (#228 Part 4)
// 필터: 전체/후속조치 대기/무효. 액션: PDF 보기·후속 처리 완료·무효화(관리자).
export const dynamic = "force-dynamic";

export default async function ServiceReportsPage() {
  const access = await requireServiceReportsRead();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">서비스 리포트 조회 권한이 필요합니다.</p>
      </div>
    );
  }
  const res = await adminListReportsAction();
  const items = res.ok ? res.data : [];
  const canVoid = can(access.permissions, "users.manage");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1 font-semibold text-text">서비스 리포트</h1>
        <p className="mt-0.5 text-small text-muted">
          현장 A/S 결과 보고서 — 작성은 현장 콘솔(as.jhtech.co.kr)에서 · 전체{" "}
          {items.length.toLocaleString("ko-KR")}건
        </p>
      </div>
      {!res.ok ? (
        <p className="rounded-md border border-border bg-surface p-4 text-small text-danger">
          목록을 불러오지 못했습니다: {res.error}
        </p>
      ) : (
        <ReportTable items={items} canVoid={canVoid} />
      )}
    </div>
  );
}
