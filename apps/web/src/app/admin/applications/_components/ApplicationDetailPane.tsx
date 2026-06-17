"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isApplicationDetailPath } from "@/lib/applications/is-detail-path";

// 의뢰 상세 영역 래퍼 — 모바일(lg 미만)에선 상세 라우트일 때만 표시 + ‹ 목록 뒤로가기.
// lg 이상에선 항상 표시(기존 2분할 우측 칸 그대로).
export function ApplicationDetailPane({ children }: { children: ReactNode }) {
  const detail = isApplicationDetailPath(usePathname());
  return (
    <div className={`${detail ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col`}>
      {detail && (
        <Link
          href="/admin/applications"
          className="flex items-center gap-1 border-b border-border px-4 py-2.5 text-small font-semibold text-accent lg:hidden"
        >
          ‹ 목록
        </Link>
      )}
      {/* 상세 자체 스크롤 칸 — 하단 pb-16으로 저장/취소 버튼 아래 여백 */}
      <div className="min-w-0 flex-1 overflow-y-auto px-6 pt-6 pb-16">{children}</div>
    </div>
  );
}
