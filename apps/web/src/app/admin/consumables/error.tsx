"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-10">
      <p className="text-body text-text">소모품을 불러오지 못했습니다</p>
      <button onClick={reset} className="text-small text-accent underline">다시 시도</button>
    </div>
  );
}
