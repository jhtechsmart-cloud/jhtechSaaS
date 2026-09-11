import { Suspense } from "react";
import Link from "next/link";
import { followUpSeedAction, getReportAction } from "@/lib/service-reports/actions";
import { ReportWizard } from "../_components/ReportWizard";

// 리포트 작성 화면 — ?id 있으면 draft 이어쓰기(발행본이면 완료 화면), ?parent 있으면 후속 방문 리포트(#285 #D),
// 둘 다 없으면 새 작성.
export const dynamic = "force-dynamic";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; parent?: string }>;
}) {
  const { id, parent } = await searchParams;
  let initial = null;
  if (id) {
    const res = await getReportAction(id);
    if (res.ok) initial = res.data;
  }
  // 후속 시드는 새 작성일 때만(이어쓰기 중인 draft가 우선 — 이미 저장된 부모 링크가 있다).
  const follow = !id && parent ? await followUpSeedAction(parent) : null;
  if (follow && !follow.ok) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-body font-semibold text-text">후속 리포트를 시작할 수 없습니다</p>
        <p className="text-small text-muted">{follow.error}</p>
        <Link href="/field" className="text-small text-accent underline">
          현장 콘솔로
        </Link>
      </main>
    );
  }
  return (
    <Suspense>
      <ReportWizard initial={initial} followUp={follow?.ok ? follow.data : null} />
    </Suspense>
  );
}
