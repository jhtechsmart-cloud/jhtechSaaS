"use client";

import { useEffect } from "react";

// /request 트리 서버컴포넌트(장비 조회 등) 실패 시 폴백.
export default function RequestError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 개발 진단용 — 실제 에러 내용을 콘솔에 출력
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
      <h1 className="text-h1 font-semibold text-text">문제가 발생했습니다</h1>
      <p className="mt-2 text-small text-muted">잠시 후 다시 시도해주세요.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
      >
        다시 시도
      </button>
    </main>
  );
}
