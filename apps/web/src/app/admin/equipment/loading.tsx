// 목록 로딩 — 테이블 스켈레톤(UI-SPEC: loading state, shimmer, 툴바 즉시 렌더).
export default function Loading() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">장비</h1>
        <div className="h-9 w-24 animate-pulse rounded-md bg-surface-2" />
      </div>
      {/* 툴바 스켈레톤: 검색 + 상태 필터 3개 */}
      <div className="flex items-center gap-2">
        <div className="h-9 w-60 animate-pulse rounded-md bg-surface-2" />
        <div className="flex gap-1">
          <div className="h-9 w-16 animate-pulse rounded-md bg-surface-2" />
          <div className="h-9 w-16 animate-pulse rounded-md bg-surface-2" />
          <div className="h-9 w-16 animate-pulse rounded-md bg-surface-2" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-md bg-surface-2" />
        ))}
      </div>
    </section>
  );
}
