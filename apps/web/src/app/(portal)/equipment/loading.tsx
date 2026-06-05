// 카탈로그 스켈레톤(서버 fetch 동안).
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-8 h-9 w-48 animate-pulse rounded-md bg-surface-2" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-md bg-surface-2" />
        ))}
      </div>
    </main>
  );
}
