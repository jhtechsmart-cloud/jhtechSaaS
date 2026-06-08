"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

// 사이드바 nav — active(현재 경로) 항목을 스틸블루로 강조. 서버 layout에서 items를 받는다.
// expanded=false면 라벨은 opacity-0(폭 애니메이션과 함께 부드럽게 사라짐, mount/unmount 없음),
// 배지는 점으로. 아이콘은 항상 같은 위치라 펼칠 때 깜박이지 않는다.
export function SidebarNav({ items, expanded = true }: { items: NavItem[]; expanded?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
      {items.map((it) => {
        // 정확 일치 또는 하위 경로(예: /admin/applications/[id])도 active
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            title={expanded ? undefined : it.label}
            className={`group relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-body font-medium transition-colors ${
              active ? "bg-navy-2 text-white" : "text-sidebar-text hover:bg-navy-2 hover:text-white"
            }`}
          >
            <Icon
              name={it.icon}
              size={18}
              className={`shrink-0 transition-colors ${active ? "text-white" : "text-sidebar-text group-hover:text-white"}`}
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
                <span className="shrink-0 rounded-full bg-sidebar-text px-2 py-0.5 text-micro font-semibold text-navy">
                  {it.badge}
                </span>
              ) : (
                <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-sidebar-text" aria-label={`${it.badge}건`} />
              ))}
          </Link>
        );
      })}
    </nav>
  );
}
