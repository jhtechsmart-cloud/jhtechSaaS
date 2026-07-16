import { Suspense } from "react";
import { getReportAction } from "@/lib/service-reports/actions";
import { ReportWizard } from "../_components/ReportWizard";

// 리포트 작성 화면 — ?id 있으면 draft 이어쓰기(발행본이면 완료 화면), 없으면 새 작성.
export const dynamic = "force-dynamic";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  let initial = null;
  if (id) {
    const res = await getReportAction(id);
    if (res.ok) initial = res.data;
  }
  return (
    <Suspense>
      <ReportWizard initial={initial} />
    </Suspense>
  );
}
