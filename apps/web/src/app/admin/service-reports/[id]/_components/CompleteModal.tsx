"use client";
import { useState, useTransition } from "react";
import { adminCompleteAction } from "@/lib/service-reports/admin-actions";
import { completeReportSchema } from "@/lib/service-reports/complete-schema";
import { Modal } from "./Modal";

// 관리부 완료 모달(#285) — 세금계산서 발행함/불필요(필수) + 발행일(발행함이면 필수) + 메모(≤500, D-B11 힌트).
// zod 인라인 오류 → RPC. 성공 시 onDone(부모가 새로고침 + toast + 완료 탭 이동 제안).
export function CompleteModal({ reportId, onClose, onDone }: { reportId: string; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<"invoiced" | "not_required" | "">("");
  const [date, setDate] = useState("");
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setServerError("");
    const parsed = completeReportSchema.safeParse({ tax_invoice_status: status, tax_invoice_date: date, memo });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0] ?? "form")] = i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await adminCompleteAction(reportId, { tax_invoice_status: status as "invoiced" | "not_required", tax_invoice_date: date, memo });
      if (!res.ok) return setServerError(res.error);
      onDone();
    });
  }

  return (
    <Modal title="A/S 완료 처리" onClose={onClose} busy={pending}>
      <p className="text-small text-muted">승인본을 확인했고 세금계산서 처리가 끝났으면 완료로 표시합니다. 완료 후에는 무효화할 수 없습니다.</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-small font-semibold text-text">세금계산서 *</legend>
        <div className="flex gap-2">
          {(
            [
              { v: "invoiced", label: "발행함" },
              { v: "not_required", label: "불필요" },
            ] as const
          ).map((o) => (
            <label
              key={o.v}
              className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-full border text-small font-semibold ${
                status === o.v ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted"
              }`}
            >
              <input type="radio" name="tax" value={o.v} checked={status === o.v} onChange={() => setStatus(o.v)} className="sr-only" />
              {o.label}
            </label>
          ))}
        </div>
        {errors.tax_invoice_status && <p className="text-small text-danger">{errors.tax_invoice_status}</p>}
      </fieldset>
      {status === "invoiced" && (
        <label className="flex flex-col gap-1 text-small font-medium text-muted">
          발행일 *
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-border px-3 py-2 font-mono text-small text-text" />
          {errors.tax_invoice_date && <span className="text-danger">{errors.tax_invoice_date}</span>}
        </label>
      )}
      <label className="flex flex-col gap-1 text-small font-medium text-muted">
        메모
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={status === "not_required" ? "사유를 남기면 감사 시 도움이 됩니다" : "계산서 번호·비고 등"}
          className="rounded-md border border-border px-3 py-2 text-small text-text"
        />
        {errors.memo && <span className="text-danger">{errors.memo}</span>}
      </label>
      {serverError && <p className="rounded-md bg-danger/10 px-3 py-2 text-small font-medium text-danger">{serverError}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={pending} className="min-h-11 rounded-full border border-border px-5 text-small font-semibold text-text">
          취소
        </button>
        <button type="button" onClick={submit} disabled={pending} className="min-h-11 rounded-full bg-accent px-5 text-small font-bold text-white disabled:opacity-50">
          {pending ? "처리 중…" : "완료 처리"}
        </button>
      </div>
    </Modal>
  );
}
