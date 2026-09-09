import Link from "next/link";
import { Toaster } from "@/components/ui/sonner";
import { requireServiceReportsRead } from "@/lib/auth/guard";
import { adminGetReportAction } from "@/lib/service-reports/admin-actions";
import { ReportDetail } from "./_components/ReportDetail";

// 서비스 리포트 상세(admin, #285 #C) — 결재 허브. 1순위 "지금 내 할 일"(액션 바) → 타임라인 → PDF → 요약 → 이력(D-B15).
export const dynamic = "force-dynamic";

export default async function ServiceReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireServiceReportsRead();
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">서비스 리포트 조회 권한이 필요합니다.</p>
      </div>
    );
  }
  const { id } = await params;
  const res = /^[0-9a-f-]{36}$/i.test(id) ? await adminGetReportAction(id) : ({ ok: false, error: "잘못된 주소" } as const);
  if (!res.ok) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">리포트를 찾을 수 없습니다</p>
        <p className="text-small text-muted">{res.error}</p>
        <Link href="/admin/service-reports" className="text-small text-accent underline">
          목록으로
        </Link>
      </div>
    );
  }
  return (
    <>
      <ReportDetail initial={res.data} />
      <Toaster position="bottom-center" />
    </>
  );
}
