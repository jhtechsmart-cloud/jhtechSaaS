import type { PortalIconName } from "./PortalIcon";

// 포털 네비게이션 단일 출처 — 상단바·하단탭이 공유.
// label은 짧게(견적/A/S/소모품): 홈 카드의 풀네임("견적 요청" 등)과 접근명이 겹치지 않게 해
// E2E getByRole strict 중복매칭을 피한다(home-nav.spec 계약).
export type NavItem = {
  href: string;
  label: string;
  icon: PortalIconName;
  // active 판정용 경로 프리픽스(견적은 카탈로그·상세·견적폼을 한 묶음으로 본다).
  match: string[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/equipment", label: "견적", icon: "quote", match: ["/equipment", "/request"] },
  { href: "/support", label: "A/S", icon: "service", match: ["/support"] },
  { href: "/supply", label: "소모품", icon: "supply", match: ["/supply"] },
];

// 현재 경로가 해당 메뉴 영역에 속하는지.
export function isNavActive(pathname: string, item: NavItem): boolean {
  return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
