import Link from "next/link";
import type { PipelineRow } from "@/lib/dashboard/v2-logic";
import { APPLICATION_STATUS_META } from "@/lib/application-status";
import { SectionHeader } from "@/app/admin/_components/SectionHeader";

// 견적 파이프라인 — 세로 행(단계명 74px + 비율 바 + 건수). 가로 박스 나열 금지(스펙).
// 행 클릭 → 견적 목록 해당 단계 필터. 발송 후 7일 경과 건 있으면 코랄 경고 노트.
export function PipelineRows({
  rows,
  staleCount,
}: {
  rows: PipelineRow[];
  staleCount: number;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <SectionHeader title="견적 파이프라인" />
      <div className="flex flex-col gap-1">
        {rows.map((r) => {
          const meta = APPLICATION_STATUS_META[r.status];
          return (
            <Link
              key={r.status}
              href={`/admin/applications?status=${r.status}`}
              className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-mint-hover"
            >
              <span className="w-[74px] shrink-0 text-small font-medium text-muted group-hover:text-text">
                {meta.label}
              </span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full transition-[width]"
                  style={{ width: `${r.pct}%`, backgroundColor: meta.color }}
                />
              </span>
              <span className="w-10 shrink-0 text-right text-small font-semibold text-text tabular-nums">
                {r.count}
              </span>
            </Link>
          );
        })}
      </div>
      {staleCount > 0 && (
        <p className="mt-3 rounded-lg border border-coral bg-coral-soft px-3 py-2 text-small font-medium text-coral-text">
          발송 후 7일 경과 {staleCount}건 — 후속 연락이 필요합니다
        </p>
      )}
    </section>
  );
}
