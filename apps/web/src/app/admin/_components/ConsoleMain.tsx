"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

// 콘솔 본문 래퍼(클라) — 의뢰관리 2분할은 폭 제한·패딩 없이 전체 폭을 써 상세를 넓게,
// 그 외 화면은 기존대로 max-w-1320 중앙정렬 + p-6.
export function ConsoleMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const full = pathname.startsWith("/admin/applications");
  if (full) return <main className="min-w-0 flex-1 overflow-hidden">{children}</main>;
  return <main className="mx-auto w-full max-w-[1320px] flex-1 p-6">{children}</main>;
}
