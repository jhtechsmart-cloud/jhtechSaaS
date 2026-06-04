import Link from "next/link";

// 상단 "지금 처리할 일" 3카드. 라벨에 미배정/미열람 명시. 클릭 시 해당 목록으로.
// count가 null이면(집계 실패) "—" 표시(0과 구분).
const CARDS = [
  { href: "/admin/applications", label: "견적 미배정", key: "applications" as const },
  { href: "/admin/service-requests", label: "A/S 미열람", key: "service" as const },
  { href: "/admin/supply-requests", label: "소모품 미열람", key: "supply" as const },
];

export function ActionQueue({ counts }: { counts: Record<"applications" | "service" | "supply", number | null> }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="dashboard-action-queue">
      {CARDS.map((c) => {
        const n = counts[c.key];
        return (
          <Link
            key={c.key}
            href={c.href}
            className="flex flex-col gap-1 rounded-md border border-border bg-surface p-4 hover:bg-surface-2"
          >
            <span className="text-small text-muted">{c.label}</span>
            <span className="font-mono text-h1 tabular-nums font-semibold text-text">
              {n == null ? "—" : n}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
