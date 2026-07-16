import Link from "next/link";
import { myDraftsAction } from "@/lib/service-reports/actions";

// 현장 콘솔 홈 — 작성 중(draft) 이어쓰기 카드 + 새 리포트 CTA. (autoplan F-H4)
export const dynamic = "force-dynamic";

function relativeLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default async function FieldHome() {
  const drafts = await myDraftsAction();
  const list = drafts.ok ? drafts.data : [];

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
        ) : list.length === 0 ? (
          <p className="rounded-md border border-border bg-surface p-4 text-small text-muted">
            작성 중인 리포트가 없습니다. 새 리포트를 시작하세요.
          </p>
        ) : (
          list.map((d) => (
            <Link
              key={d.id}
              href={`/field/report?id=${d.id}`}
              className="rounded-md border border-border bg-surface p-4 shadow-card"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-body font-bold text-text">
                  {d.customer_name || "고객 미입력"}
                </span>
                <span className="whitespace-nowrap text-micro text-muted">
                  {relativeLabel(d.created_at)}
                </span>
              </div>
              <div className="mt-1 text-small text-muted">{d.device_name || "장비 미입력"}</div>
              <div className="mt-2 text-small font-medium text-accent">이어서 작성 →</div>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
