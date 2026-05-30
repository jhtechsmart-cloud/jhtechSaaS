// 목록 로딩 — 테이블 스켈레톤(UI-SPEC: loading state).
export default function Loading() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-semibold text-text">장비</h1>
        <div className="h-9 w-24 rounded-md bg-surface-2" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full rounded-md bg-surface-2" />
        ))}
      </div>
    </section>
  );
}
