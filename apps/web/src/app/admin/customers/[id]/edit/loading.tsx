// 고객 수정 폼 로딩 스켈레톤
export default function Loading() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">고객 수정</h1>
      <div className="flex max-w-[720px] flex-col gap-5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="h-4 w-20 animate-pulse rounded-sm bg-surface-2" />
            <div className="h-10 w-full animate-pulse rounded-md bg-surface-2" />
          </div>
        ))}
      </div>
    </section>
  );
}
