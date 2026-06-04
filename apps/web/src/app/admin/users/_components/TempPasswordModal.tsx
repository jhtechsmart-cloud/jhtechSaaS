"use client";
import { useState } from "react";

// 🔴 임시 PW 1회 노출 모달 — 생성 직후 mono 표시 + 복사 + "다시 볼 수 없습니다" 경고.
// 닫으면 소실(서버에 저장 안 됨). 닫기 = onClose(목록으로 이동).
export function TempPasswordModal({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="temp-pw-title"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-bg p-6 shadow-lg">
        <div className="flex flex-col gap-1">
          <h2 id="temp-pw-title" className="text-h2 font-semibold text-text">
            계정이 생성되었습니다
          </h2>
          <p className="text-small text-muted">
            아래 임시 비밀번호를 담당자에게 전달하세요. 첫 로그인 후 변경을 권장합니다.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-small text-muted">이메일</span>
            <span className="font-mono text-small text-text">{email}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-small text-muted">임시 비밀번호</span>
            <span
              data-testid="temp-password"
              className="font-mono tabular-nums text-body font-medium text-text select-all"
            >
              {password}
            </span>
          </div>
        </div>

        <p className="rounded-md bg-danger/10 px-3 py-2 text-small font-medium text-danger">
          ⚠️ 이 비밀번호는 다시 볼 수 없습니다. 지금 복사하거나 안전하게 기록하세요.
        </p>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={copy}
            className="rounded-md border border-border bg-surface px-4 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            {copied ? "복사됨 ✓" : "비밀번호 복사"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
