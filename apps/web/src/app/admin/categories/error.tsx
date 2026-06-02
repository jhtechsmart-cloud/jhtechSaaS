"use client";

// 분류 페이지 에러 바운더리 — 서버 컴포넌트 fetch 실패 시 표시.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-10">
      <p className="text-body text-text">분류를 불러오지 못했습니다</p>
      <button onClick={reset} className="text-small text-accent underline">
        다시 시도
      </button>
    </div>
  );
}
