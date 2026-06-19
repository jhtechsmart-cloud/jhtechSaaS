// 재고 로딩 — 제목 + 테이블 스켈레톤.
export default function Loading() {
  return (
    <section className="flex flex-col gap-4">
      <div className="h-8 w-32 animate-pulse rounded-md bg-surface-2" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-md bg-surface-2" />
        ))}
      </div>
    </section>
  );
}
