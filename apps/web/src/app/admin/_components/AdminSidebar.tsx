"use client";

import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { Icon } from "./Icon";
import { SidebarNav, type NavItem } from "./SidebarNav";

// 콘솔 메인 사이드바(클라) — 의뢰관리(2분할) 화면에선 아이콘만 남기고 접어 폭을 확보한다.
// 다른 화면에선 224px 풀 사이드바. items는 서버 layout에서 권한 필터링해 전달.
export function AdminSidebar({ items, isAdmin }: { items: NavItem[]; isAdmin: boolean }) {
  const pathname = usePathname();
  const collapsed = pathname.startsWith("/admin/applications");

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-text transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-[224px]"
      }`}
    >
      {/* 브랜드 */}
      <div className={`flex items-center py-5 ${collapsed ? "justify-center px-0" : "gap-2.5 px-5"}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
          <Icon name="dashboard" size={18} />
        </span>
        {!collapsed && (
          <span className="flex flex-col leading-tight">
            <span className="text-body font-semibold text-white">재현테크</span>
            <span className="text-micro text-sidebar-text">견적관리 콘솔</span>
          </span>
        )}
      </div>

      <SidebarNav items={items} collapsed={collapsed} />

      {/* 프로필 */}
      <div
        className={`mx-3 mb-4 mt-2 flex items-center rounded-lg bg-navy-2 py-3 ${
          collapsed ? "flex-col gap-2 px-0" : "gap-3 px-3"
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-3 text-small font-semibold text-white">
          {isAdmin ? "관" : "영"}
        </span>
        {!collapsed && (
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-small font-medium text-white">{isAdmin ? "관리자" : "영업담당"}</span>
            <span className="truncate text-micro text-sidebar-text">재현테크</span>
          </span>
        )}
        <form action={signOut}>
          <button className="text-sidebar-text transition-colors hover:text-white" aria-label="로그아웃" title="로그아웃">
            <Icon name="logout" size={18} />
          </button>
        </form>
      </div>
    </aside>
  );
}
