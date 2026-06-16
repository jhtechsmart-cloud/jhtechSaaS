"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

// 콘솔 본문 래퍼(클라) — 의뢰관리 2분할은 폭 제한·패딩 없이 전체 폭을 써 상세를 넓게,
// 그 외 화면은 max-w-1180 중앙정렬 + 하단 pb-16(64px)로 숨 쉴 여백(저장/취소 버튼이 밑단에 붙지 않게).
// 의뢰관리(full)는 고정높이 2분할이라 여백은 자체 layout의 상세 스크롤 칸에서 처리(여기서 pb를 주면 2분할이 잘림).
export function ConsoleMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const full = pathname.startsWith("/admin/applications");
  if (full) return <main className="min-w-0 flex-1 overflow-hidden">{children}</main>;
  return <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 pt-6 pb-16">{children}</main>;
}
