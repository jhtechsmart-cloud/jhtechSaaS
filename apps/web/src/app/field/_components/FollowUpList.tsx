import Link from "next/link";
import type { FollowUpCard } from "@/lib/service-reports/types";

// 후속 방문 대기(#285 #D) — 확정본 중 후속조치가 남은 리포트. 카드를 누르면 고객·장비가 채워진
// 새 리포트가 열리고(원 리포트가 부모), 확정하면 원 리포트의 후속조치가 자동으로 처리 완료된다.
const d10 = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export function FollowUpList({ items }: { items: FollowUpCard[] }) {
  if (items.length === 0) {
    return <p className="rounded-md border border-border bg-surface p-4 text-small text-muted">후속 방문 대기 건이 없습니다.</p>;
  }
  return (
    <>
      {items.map((f) => (
        <div key={f.id} className="rounded-md border border-border bg-surface p-4 shadow-card">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-body font-bold text-text">{f.customer_name || "고객 미입력"}</span>
            {f.follow_date && (
              <span className="whitespace-nowrap rounded-full bg-coral-soft px-2 py-0.5 text-micro font-bold text-coral-text">
                예정 {f.follow_date}
              </span>
            )}
          </div>
          <div className="mt-1 text-small text-muted">{f.device_name || "장비 미입력"}</div>
          {f.follow_memo && <p className="mt-1 text-small text-text">{f.follow_memo}</p>}
          <div className="mt-2 flex items-center justify-between">
            <Link href={`/field/report?parent=${f.id}`} className="text-small font-medium text-accent">
              후속 리포트 작성 →
            </Link>
            <span className="font-mono text-micro text-muted">
              {f.seq_no} · {d10(f.issued_at)}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}
