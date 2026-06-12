import type { ReactNode } from "react";

// 카드 섹션 공통 헤더 — 네이비 세로막대 + 작은 제목 + (선택) 우측 메타/액션 + 하단 구분선.
// 모든 본문 카드(히어로 제외)가 동일한 제목 패턴을 쓰도록 통일(첨부 시안 기준).
export function SectionHeader({
  title,
  meta,
  action,
  badge,
}: {
  title: string;
  meta?: ReactNode; // 우측 보조 텍스트(액션이 없을 때만 표시)
  action?: ReactNode; // 우측 버튼 등(메타보다 우선)
  badge?: ReactNode; // 제목 옆 배지(등록/미등록 등)
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-2.5">
      <div className="flex items-center gap-2">
        {/* 네이비 세로막대 — 페이지 통일색(파인 그린 토큰) */}
        <span aria-hidden className="h-3.5 w-1 shrink-0 rounded-full bg-pine" />
        <h2 className="text-body font-semibold text-text">{title}</h2>
        {badge}
      </div>
      {action ? action : meta ? <span className="shrink-0 text-micro text-muted">{meta}</span> : null}
    </div>
  );
}
