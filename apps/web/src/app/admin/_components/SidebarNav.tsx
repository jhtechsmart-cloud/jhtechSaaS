"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

export type NavItem = { href: string; label: string; icon: string; badge?: number; section: string };

// 사이드바 nav — 라이트 민트 테마: 활성 = 파인 pill(흰 텍스트+그림자), hover = 흰 pill+보더.
// 섹션 라벨(업무/카탈로그/관리)로 그룹 구분. 아이콘은 기존 lucide 그대로(색만 상태 따라감).
// expanded=false면 라벨·섹션은 opacity-0, 배지는 점으로.
// 아이콘은 고정 40px 레일(size-10)에 중앙 배치 → 펼침/접힘 무관하게 x좌표 불변(토글 시 흔들림 없음).
// 접힘 시 Link 폭 = 40px 정사각 → 활성 배경이 정원, 아이콘과 정확히 정렬.
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
                className={`group relative flex items-center rounded-full border text-body font-semibold transition-colors ${expanded ? "w-full" : "w-10"} ${
                  active
                    ? "border-transparent bg-accent text-white shadow-[0_4px_12px_rgba(23,100,85,.22)]"
                    : "border-transparent text-sidebar-text hover:border-border hover:bg-surface hover:text-text"
                }`}
              >
                {/* 고정 40px 아이콘 레일 — 펼침/접힘 무관 아이콘 중앙 고정 */}
                <span className="flex size-10 shrink-0 items-center justify-center">
                  <Icon
                    name={it.icon}
                    size={18}
                    className={`transition-colors ${active ? "text-white" : "text-sidebar-text group-hover:text-text"}`}
                  />
                </span>
                <span
                  className={`min-w-0 truncate whitespace-nowrap transition-opacity duration-150 ${
                    expanded ? "flex-1 pr-3 opacity-100" : "w-0 flex-none opacity-0"
                  }`}
                >
                  {it.label}
                </span>
                {it.badge != null && it.badge > 0 &&
                  (expanded ? (
                    <span
                      className={`mr-3 shrink-0 rounded-full px-2 py-0.5 font-mono text-micro font-bold tabular-nums ${
                        active ? "bg-white/25 text-white" : "bg-mint text-accent-2"
                      }`}
                    >
                      {it.badge}
                    </span>
                  ) : (
                    <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent-ring" aria-label={`${it.badge}건`} />
                  ))}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
