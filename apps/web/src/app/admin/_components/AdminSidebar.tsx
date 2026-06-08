"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { Icon } from "./Icon";
import { SidebarNav, type NavItem } from "./SidebarNav";

const STORAGE_KEY = "jh.sidebarCollapsed";

// 콘솔 메인 사이드바(클라).
// - 접기/펴기 토글 버튼(셰브런) — 선택을 localStorage에 기억. 한 번 누르면 그 선택이 우선.
// - 기본값: 의뢰관리(2분할)에선 접힘, 그 외엔 펴짐. (사용자가 토글하면 그 값으로 고정.)
// - 접힌 상태에서 hover하면 콘텐츠 위로 덮으며 임시로 펼쳐지고(레이아웃 안 밀림), 벗어나면 다시 접힘.
export function AdminSidebar({ items, isAdmin }: { items: NavItem[]; isAdmin: boolean }) {
  const pathname = usePathname();
  // 사용자 토글값(localStorage)을 lazy 초기화로 읽는다. 서버/미설정 시 null → 경로 기본 사용.
  const [override, setOverride] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      return v === "1" ? true : v === "0" ? false : null;
    } catch {
      return null;
    }
  });
  const [hovering, setHovering] = useState(false);

  // 지속 의도: 사용자 토글값(override)이 있으면 그것, 없으면 경로 기본(의뢰관리=접힘).
  const pinnedCollapsed = override ?? pathname.startsWith("/admin/applications");
  // 실제 표시: 접힘 고정이 아니거나, 접힘 상태에서 hover 중이면 펼침.
  const expanded = !pinnedCollapsed || hovering;

  function toggle() {
    const next = !pinnedCollapsed;
    setOverride(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* 무시 */
    }
  }

  return (
    // 바깥 aside는 레일 폭(접힘 64 / 펴짐 224)만 차지. 안쪽 패널이 hover 시 그 위로 덮어 펼친다.
    <aside className={`relative shrink-0 ${pinnedCollapsed ? "w-16" : "w-56"}`}>
      <div
        onMouseEnter={() => pinnedCollapsed && setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`absolute inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-sidebar text-sidebar-text transition-[width] duration-200 ${
          expanded ? "w-56" : "w-16"
        } ${pinnedCollapsed && hovering ? "shadow-2xl" : ""}`}
      >
        {/* 브랜드 + 토글 */}
        <div className={`flex items-center py-5 ${expanded ? "gap-2.5 px-5" : "justify-center px-0"}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
            <Icon name="dashboard" size={18} />
          </span>
          {expanded && (
            <>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-body font-semibold text-white">재현테크</span>
                <span className="truncate text-micro text-sidebar-text">견적관리 콘솔</span>
              </span>
              <button
                onClick={toggle}
                title={pinnedCollapsed ? "사이드바 고정(펼친 채 유지)" : "사이드바 접기"}
                aria-label="사이드바 접기/펴기"
                className="shrink-0 rounded-md p-1 text-sidebar-text transition-colors hover:bg-navy-2 hover:text-white"
              >
                <Icon name={pinnedCollapsed ? "chevronRight" : "chevronLeft"} size={18} />
              </button>
            </>
          )}
        </div>

        <SidebarNav items={items} collapsed={!expanded} />

        {/* 프로필 */}
        <div
          className={`mx-3 mb-4 mt-2 flex items-center rounded-lg bg-navy-2 py-3 ${
            expanded ? "gap-3 px-3" : "flex-col gap-2 px-0"
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-3 text-small font-semibold text-white">
            {isAdmin ? "관" : "영"}
          </span>
          {expanded && (
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
      </div>
    </aside>
  );
}
