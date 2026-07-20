import Link from "next/link";
import { myDraftsAction } from "@/lib/service-reports/actions";
import { DraftList } from "./_components/DraftList";

// 현장 콘솔 홈 — 작성 중(draft) 이어쓰기 카드 + 새 리포트 CTA. (autoplan F-H4)
export const dynamic = "force-dynamic";

export default async function FieldHome() {
  const drafts = await myDraftsAction();

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <Link
        href="/field/report"
        className="rounded-full bg-accent px-4 py-4 text-center text-body font-bold text-white"
      >
        + 새 리포트 작성
      </Link>

      <section className="flex flex-col gap-2">
        <h2 className="text-small font-semibold text-muted">작성 중인 리포트</h2>
        {!drafts.ok ? (
          <p className="rounded-md border border-border bg-surface p-4 text-small text-danger">
            목록을 불러오지 못했습니다 — 새로고침해 주세요.
          </p>
        ) : (
          <DraftList initial={drafts.data} />
        )}
      </section>
    </main>
  );
}
