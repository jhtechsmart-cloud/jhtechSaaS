import type { QuoteDiff } from "@/lib/quotes/diff";
import { SectionHeader } from "./SectionHeader";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("ko-KR")}원`;
const kindLabel = (k?: "included" | "extra") => (k === "included" ? "포함옵션" : k === "extra" ? "추가옵션" : "장비");

// 직전 버전 대비 변경 내역 — 추가(민트 +)·삭제(코랄 취소선)·단가/수량 변경(전→후).
export function VersionDiff({
  prevVersion, currVersion, diff,
}: {
  prevVersion: number;
  currVersion: number;
  diff: QuoteDiff;
}) {
  const empty = diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
  return (
    <section className="rounded-lg border border-border/60 bg-surface p-5 shadow-sm">
      <SectionHeader
        title={`변경 내역 (v${prevVersion} → v${currVersion})`}
        meta={`합계 ${signed(diff.totalDelta)} · ${won(diff.totalBefore)} → ${won(diff.totalAfter)}`}
      />
      {empty ? (
        <p className="text-small text-muted">이전 버전과 품목·금액 변경이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-small">
          {diff.added.map((c, i) => (
            <li key={`a${i}`} className="flex items-center gap-2">
              <Tag className="bg-mint text-accent-2">추가</Tag>
              <span className="text-faint">[{kindLabel(c.kind)}]</span>
              <span className="font-medium text-text">{c.name}</span>
              <span className="ml-auto font-mono tabular-nums text-accent-2">+{won(c.unitPrice * c.quantity)}</span>
            </li>
          ))}
          {diff.removed.map((c, i) => (
            <li key={`r${i}`} className="flex items-center gap-2">
              <Tag className="bg-coral-soft text-danger">삭제</Tag>
              <span className="text-faint">[{kindLabel(c.kind)}]</span>
              <span className="font-medium text-muted line-through">{c.name}</span>
              <span className="ml-auto font-mono tabular-nums text-danger">−{won(c.unitPrice * c.quantity)}</span>
            </li>
          ))}
          {diff.changed.map((c, i) => (
            <li key={`c${i}`} className="flex flex-wrap items-center gap-2">
              <Tag className="bg-surface-2 text-text">변경</Tag>
              <span className="text-faint">[{kindLabel(c.kind)}]</span>
              <span className="font-medium text-text">{c.name}</span>
              <span className="ml-auto font-mono tabular-nums text-muted">
                {won(c.before.unitPrice)}×{c.before.quantity} → <span className="text-text">{won(c.after.unitPrice)}×{c.after.quantity}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-micro font-semibold ${className}`}>{children}</span>;
}
