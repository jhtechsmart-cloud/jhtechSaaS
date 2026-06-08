"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { Icon } from "./Icon";
import { SidebarNav, type NavItem } from "./SidebarNav";

const COOKIE = "jh.sidebarCollapsed";

// 콘솔 메인 사이드바(클라).
// - 접기/펴기 토글 버튼(셰브런) — 선택을 쿠키에 저장(서버가 초기값으로 읽어 hydration 일치).
// - 기본값: 의뢰관리(2분할)에선 접힘, 그 외 펴짐. 사용자가 토글하면 그 값 우선.
// - 접힌 상태에서 hover → 콘텐츠 위로 덮으며 펼침(레이아웃 안 밀림), 벗어나면 다시 접힘.
// - 라벨은 항상 렌더 + opacity 전환 → 폭 애니메이션과 함께 부드럽게 나타남(조건부 mount 없음).
export function AdminSidebar({
  items,
  isAdmin,
  initialOverride,
}: {
  items: NavItem[];
  isAdmin: boolean;
  initialOverride: boolean | null;
}) {
  const pathname = usePathname();
  const [override, setOverride] = useState<boolean | null>(initialOverride);
  const [hovering, setHovering] = useState(false);

  const pinnedCollapsed = override ?? pathname.startsWith("/admin/applications");
  const expanded = !pinnedCollapsed || hovering;

  function toggle() {
    const next = !pinnedCollapsed;
    setOverride(next);
    document.cookie = `${COOKIE}=${next ? "1" : "0"};path=/;max-age=31536000;samesite=lax`;
  }

  const fade = (on: boolean) =>
    `whitespace-nowrap transition-opacity duration-150 ${on ? "opacity-100" : "pointer-events-none opacity-0"}`;

  return (
    // 바깥 aside는 레일 폭(접힘 64 / 펴짐 224)만 차지. 안쪽 패널이 hover 시 그 위로 덮어 펼친다.
    <aside className={`relative shrink-0 transition-[width] duration-200 ${pinnedCollapsed ? "w-16" : "w-56"}`}>
      <div
        onMouseEnter={() => pinnedCollapsed && setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`absolute inset-y-0 left-0 z-30 flex flex-col overflow-hidden border-r border-border bg-sidebar text-sidebar-text transition-[width] duration-200 ${
          expanded ? "w-56" : "w-16"
        } ${pinnedCollapsed && hovering ? "shadow-2xl" : ""}`}
      >
        {/* 브랜드 + 토글 */}
        <div className="flex items-center gap-2.5 px-3.5 py-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
            <Icon name="dashboard" size={18} />
          </span>
          <span className={`flex min-w-0 flex-1 flex-col leading-tight ${fade(expanded)}`}>
            <span className="truncate text-body font-semibold text-white">재현테크</span>
            <span className="truncate text-micro text-sidebar-text">견적관리 콘솔</span>
          </span>
          <button
            onClick={toggle}
            title={pinnedCollapsed ? "사이드바 고정(펼친 채 유지)" : "사이드바 접기"}
            aria-label="사이드바 접기/펴기"
            className={`shrink-0 rounded-md p-1 text-sidebar-text hover:bg-navy-2 hover:text-white ${fade(expanded)}`}
          >
            <Icon name={pinnedCollapsed ? "chevronRight" : "chevronLeft"} size={18} />
          </button>
        </div>

        <SidebarNav items={items} expanded={expanded} />

        {/* 프로필 */}
        <div className="mx-3 mb-4 mt-2 flex items-center gap-3 rounded-lg bg-navy-2 px-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-3 text-small font-semibold text-white">
            {isAdmin ? "관" : "영"}
          </span>
          <span className={`flex min-w-0 flex-1 flex-col leading-tight ${fade(expanded)}`}>
            <span className="truncate text-small font-medium text-white">{isAdmin ? "관리자" : "영업담당"}</span>
            <span className="truncate text-micro text-sidebar-text">재현테크</span>
          </span>
          <form action={signOut} className={`shrink-0 ${fade(expanded)}`}>
            <button className="text-sidebar-text transition-colors hover:text-white" aria-label="로그아웃" title="로그아웃">
              <Icon name="logout" size={18} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
