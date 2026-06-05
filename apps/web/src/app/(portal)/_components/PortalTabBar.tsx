"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavActive } from "./nav";
import { PortalIcon } from "./PortalIcon";

// 모바일 하단 고정 탭바 — 엄지로 기능 전환(앱 느낌). 데스크톱은 숨김(상단 메뉴가 대신).
// 라벨은 짧게(견적/A/S/소모품) → 홈 카드 풀네임과 접근명 분리(E2E 중복매칭 회피).
export function PortalTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="기능 이동"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex w-full max-w-md">
        {NAV_ITEMS.map((it) => {
          const active = isNavActive(pathname, it);
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-micro font-medium transition-colors ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <PortalIcon name={it.icon} size={22} />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
