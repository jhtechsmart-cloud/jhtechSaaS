"use client";
import { Copy } from "lucide-react";
import { toast } from "sonner";

// 사업자번호 클립보드 복사 — 복사 성공 시 토스트.
export function CopyBizNoButton({ bizNo }: { bizNo: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(bizNo);
      toast.success("사업자번호가 복사되었습니다");
    } catch {
      toast.error("복사에 실패했습니다");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="사업자번호 복사"
      className="ml-1 inline-flex size-5 items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-text"
    >
      <Copy className="size-3" aria-hidden />
    </button>
  );
}
