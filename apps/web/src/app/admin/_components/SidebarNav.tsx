"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

export type NavItem = { href: string; label: string; icon: string; badge?: number; section: string };

// 사이드바 nav — 라이트 민트 테마: 활성 = 파인 pill(흰 텍스트+그림자), hover = 흰 pill+보더.
// 섹션 라벨(업무/카탈로그/관리)로 그룹 구분. 아이콘은 기존 lucide 그대로(색만 상태 따라감).
// expanded=false면 라벨·섹션은 opacity-0, 배지는 점으로.
export function SidebarNav({ items, expanded = true }: { items: NavItem[]; expanded?: boolean }) {
  const pathname = usePathname();

  // 섹션 순서 보존 그룹화
  const sections: { name: string; items: NavItem[] }[] = [];
  for (const it of items) {
    const last = sections[sections.length - 1];
    if (last && last.name === it.section) last.items.push(it);
    else sections.push({ name: it.section, items: [it] });
  }

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-1">
      {sections.map((sec, si) => (
        <div key={sec.name} className="flex flex-col gap-0.5">
          {/* 섹션 라벨 — 접힘 상태에선 가는 구분선으로 대체 */}
          {expanded ? (
            <div className={`px-2.5 ${si === 0 ? "pt-1" : "pt-4"} pb-1 text-[10.5px] font-extrabold uppercase tracking-[.08em] text-faint`}>
              {sec.name}
            </div>
          ) : (
            si > 0 && <div className="mx-2 my-2 border-t border-border" aria-hidden />
          )}
          {sec.items.map((it) => {
            // 정확 일치 또는 하위 경로(예: /admin/applications/[id])도 active
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link
                key={it.href}
                href={it.href}
                title={expanded ? undefined : it.label}
                className={`group relative flex items-center gap-3 rounded-full border px-3 py-2 text-body font-semibold transition-colors ${
                  active
                    ? "border-transparent bg-accent text-white shadow-[0_4px_12px_rgba(23,100,85,.22)]"
                    : "border-transparent text-sidebar-text hover:border-border hover:bg-surface hover:text-text"
                }`}
              >
                <Icon
                  name={it.icon}
                  size={18}
                  className={`shrink-0 transition-colors ${active ? "text-white" : "text-sidebar-text group-hover:text-text"}`}
                />
                <span
                  className={`flex-1 truncate whitespace-nowrap transition-opacity duration-150 ${
                    expanded ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {it.label}
                </span>
                {it.badge != null && it.badge > 0 &&
                  (expanded ? (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-micro font-bold tabular-nums ${
                        active ? "bg-white/25 text-white" : "bg-mint text-accent-2"
                      }`}
                    >
                      {it.badge}
                    </span>
                  ) : (
                    <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-accent-ring" aria-label={`${it.badge}건`} />
                  ))}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
