// 견적 작성/수정 화면 상단 표시 — 상세(읽기) 화면과 헷갈리지 않게 '편집 중'임을 은은하게 알린다.
export function QuoteEditModeBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/[0.05] px-4 py-2 text-small font-medium text-accent">
      <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-8.5 8.5a1 1 0 0 1-.464.263l-3 .75a.5.5 0 0 1-.606-.606l.75-3a1 1 0 0 1 .263-.464l8.5-8.5Z" />
      </svg>
      견적 작성·수정 화면 — 이 화면에서 견적서를 편집합니다.
    </div>
  );
}
