"use client";

// 카탈로그 조회 실패 경계.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-6 py-20 text-center">
      <h1 className="text-h1 font-semibold text-text">목록을 불러오지 못했습니다</h1>
      <p className="text-body text-muted">잠시 후 다시 시도해 주세요.</p>
      <button
        onClick={reset}
        className="rounded-md bg-accent px-5 py-2 text-body font-medium text-white"
      >
        다시 시도
      </button>
    </main>
  );
}
