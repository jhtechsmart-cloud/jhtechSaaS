import Link from "next/link";
import { Icon } from "../../_components/Icon";

// 상단 "지금 처리할 일" 3카드 — 아이콘 칩 + 큰 숫자. 라벨에 미배정/미열람 명시. 클릭 시 해당 목록으로.
// count가 null이면(집계 실패) "—" 표시(0과 구분).
const CARDS = [
  { href: "/admin/applications", label: "견적 미배정", icon: "applications", key: "applications" as const },
  { href: "/admin/service-requests", label: "A/S 미열람", icon: "service", key: "service" as const },
  { href: "/admin/supply-requests", label: "소모품 미열람", icon: "supply", key: "supply" as const },
];

export function ActionQueue({ counts }: { counts: Record<"applications" | "service" | "supply", number | null> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="dashboard-action-queue">
      {CARDS.map((c) => {
        const n = counts[c.key];
        return (
          <Link
            key={c.key}
            href={c.href}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
              <Icon name={c.icon} size={22} />
            </span>
            <span className="flex flex-col">
              <span className="text-small text-muted">{c.label}</span>
              <span className="font-mono text-display tabular-nums font-semibold leading-tight text-text">
                {n == null ? "—" : n}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
