"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavActive } from "./nav";

// 상단바 — 워드마크 + 데스크톱 메뉴(현재 영역 active 인디고). 모바일에선 메뉴 숨김(하단탭이 대신).
export function PortalHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        {/* 워드마크 — 로고색 미확정이라 텍스트 워드마크 + accent 점. 홈으로. */}
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-small font-bold text-white">
            재
          </span>
          <span className="text-h2 font-semibold text-text">재현테크</span>
          <span className="hidden text-small text-muted sm:inline">고객센터</span>
        </Link>

        {/* 데스크톱 메뉴 — 짧은 라벨(견적/A/S/소모품). 모바일은 하단탭이 담당. */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((it) => {
            const active = isNavActive(pathname, it);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-4 py-2 text-body font-medium transition-colors ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
