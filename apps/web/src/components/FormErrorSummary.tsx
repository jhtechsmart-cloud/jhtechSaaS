"use client";
import { useEffect, useRef } from "react";
import type { FieldErrors } from "react-hook-form";
import { collectErrorMessages } from "@/lib/forms/error-summary";

// 폼 상단 에러 요약 — 제출 시도(submitCount) 때마다 1회 스크롤해서 사용자가 무엇을 빠뜨렸는지 바로 안다.
// 긴 공개폼(견적·AS·소모품)에서 한 칸 누락 시 "무반응 제출"로 이탈하는 문제 방지.
export function FormErrorSummary({
  errors,
  submitCount,
}: {
  errors: FieldErrors;
  submitCount: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const messages = collectErrorMessages(errors);

  useEffect(() => {
    if (messages.length > 0) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // 제출 시도마다 1회만(키 입력마다 스크롤 방지). messages는 deps에서 의도적으로 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCount]);

  if (messages.length === 0) return null;

  return (
    <div
      ref={ref}
      role="alert"
      className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3"
    >
      <p className="text-small font-medium text-danger">
        입력하지 않았거나 잘못된 항목이 {messages.length}개 있습니다
      </p>
      <ul className="mt-1 list-disc pl-5 text-small text-danger">
        {messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
