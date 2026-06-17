"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { Icon } from "./Icon";
import { SidebarNav, type NavItem } from "./SidebarNav";

// 모바일(lg 미만) 전용 네비게이션 — 상단바 ☰ 버튼 + 왼쪽에서 슬라이드되는 오버레이 드로어.
// 데스크톱 고정 사이드바(AdminSidebar)는 lg 미만에서 hidden 처리되므로 그 자리를 대신한다.
// 열림 상태는 전환용(영속 불필요) → 매 로드 닫힘으로 시작, 쿠키 안 씀(hydration 안전).
export function MobileNav({ items, isAdmin }: { items: NavItem[]; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 경로 변경(메뉴 항목 선택 등) → 드로어 닫기.
  // React 권장: effect가 아니라 렌더 중 경로 변화 감지로 조정(ApplicationListPane 전례).
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setOpen(false);
  }

  // Esc로 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // 드로어 열린 동안 뒤 배경 스크롤 잠금(닫히면 복원).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* ☰ — 모바일에서만 보임 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-muted lg:hidden"
      >
        <Icon name="menu" size={18} />
      </button>

      {/* 드로어 + 배경 — 열렸을 때만 마운트 */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* 배경 탭 → 닫힘 */}
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          {/* 패널 */}
          <aside
            role="dialog"
            aria-modal="true"
            id="mobile-nav-drawer"
            aria-label="모바일 메뉴"
            className="absolute inset-y-0 left-0 z-10 flex w-64 flex-col border-r border-border bg-sidebar text-sidebar-text shadow-xl"
          >
            <div className="flex items-center gap-2.5 px-3.5 py-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
                <Icon name="dashboard" size={18} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-body font-extrabold tracking-tight text-accent-2">재현테크</span>
                <span className="truncate text-micro text-sidebar-text">견적관리 콘솔</span>
              </span>
            </div>

            <SidebarNav items={items} expanded />

            <div className="mx-3 mb-4 mt-2 flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3 py-3 shadow-card">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-small font-bold text-accent">
                {isAdmin ? "관" : "영"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-small font-semibold text-text">{isAdmin ? "관리자" : "영업담당"}</span>
                <span className="truncate text-micro text-sidebar-text">재현테크</span>
              </span>
              <form action={signOut} className="shrink-0">
                <button type="submit" className="text-sidebar-text transition-colors hover:text-danger" aria-label="로그아웃" title="로그아웃">
                  <Icon name="logout" size={18} />
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
