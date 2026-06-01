"use client";
import { useState } from "react";
import type { UseFormRegister, FieldError } from "react-hook-form";
import type { RequestFormInputRaw } from "@/lib/applications/schema";

// 개인정보 동의 — 필수 체크박스 + 전문 인라인 아코디언.
export function ConsentAccordion({
  register,
  error,
  policyBody,
}: {
  register: UseFormRegister<RequestFormInputRaw>;
  error?: FieldError;
  policyBody: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
      <label className="flex items-start gap-2 text-body text-text">
        <input type="checkbox" {...register("privacy_consent")} className="mt-1" />
        <span>
          개인정보 수집·이용에 동의합니다 <span className="text-danger">(필수)</span>
        </span>
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="self-start text-small text-accent hover:underline"
      >
        {open ? "▾ 전문 닫기" : "▸ 전문 보기"}
      </button>
      {open && (
        <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-sm bg-surface-2 p-3 text-small text-muted">
          {policyBody}
        </div>
      )}
      {error && <p className="text-small text-danger">{error.message}</p>}
    </div>
  );
}
