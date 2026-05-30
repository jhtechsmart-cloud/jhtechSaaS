"use client";
// 목록 조회 실패 — 재시도(UI-SPEC: error state).
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-md border border-border bg-surface p-6">
      <p className="text-h2 font-semibold text-text">목록을 불러오지 못했습니다</p>
      <button
        onClick={reset}
        className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
      >
        다시 시도
      </button>
    </section>
  );
}
