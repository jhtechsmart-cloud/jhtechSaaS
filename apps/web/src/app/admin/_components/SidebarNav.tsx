"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

// 사이드바 nav — active(현재 경로) 항목을 스틸블루로 강조. 서버 layout에서 items를 받는다.
// collapsed=true면 아이콘만(라벨 숨김, 배지=점, title 툴팁) — 의뢰관리 2분할에서 폭 확보.
export function SidebarNav({ items, collapsed = false }: { items: NavItem[]; collapsed?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={`flex flex-1 flex-col gap-0.5 py-2 ${collapsed ? "px-2" : "px-3"}`}>
      {items.map((it) => {
        // 정확 일치 또는 하위 경로(예: /admin/applications/[id])도 active
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            title={collapsed ? it.label : undefined}
            className={`group relative flex items-center rounded-lg py-2.5 text-body font-medium transition-colors ${
              collapsed ? "justify-center px-2" : "gap-3 px-3"
            } ${active ? "bg-navy-2 text-white" : "text-sidebar-text hover:bg-navy-2 hover:text-white"}`}
          >
            <Icon
              name={it.icon}
              size={18}
              className={`shrink-0 transition-colors ${active ? "text-white" : "text-sidebar-text group-hover:text-white"}`}
            />
            {!collapsed && <span className="flex-1">{it.label}</span>}
            {it.badge != null && it.badge > 0 &&
              (collapsed ? (
                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-sidebar-text" aria-label={`${it.badge}건`} />
              ) : (
                <span className="rounded-full bg-sidebar-text px-2 py-0.5 text-micro font-semibold text-navy">
                  {it.badge}
                </span>
              ))}
          </Link>
        );
      })}
    </nav>
  );
}
