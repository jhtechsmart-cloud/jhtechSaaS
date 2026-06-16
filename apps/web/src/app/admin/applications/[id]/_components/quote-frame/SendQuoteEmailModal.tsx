"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { defaultQuoteEmail } from "@jhtechsaas/shared";
import { enqueueQuoteEmailAction } from "@/lib/quotes/actions";

// 견적 메일 발송 — 버튼 + 확인 모달(수신처·제목·본문 프리필/편집). 발송 상태 배지도 겸함.
// 실제 발송은 워커(고정 IP). 여기선 enqueue만. 담당자 명의·보낸편지함 적재는 서버가 처리.
export function SendQuoteEmailModal({
  quoteId,
  defaultTo,
  quoteNo,
  companyName,
  emailStatus,
}: {
  quoteId: string;
  defaultTo: string;
  quoteNo: string;
  companyName: string | null;
  emailStatus: string | null;
}) {
  const router = useRouter();
  const prefill = defaultQuoteEmail({ quoteNo, companyName });
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(prefill.subject);
  const [body, setBody] = useState(prefill.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const sent = emailStatus === "sent";
  const inFlight = emailStatus === "pending" || emailStatus === "sending";
  const failed = emailStatus === "failed";

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await enqueueQuoteEmailAction(quoteId, { to, subject, body });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh(); // 발송 상태 배지 갱신
    });
  }

  // 이미 발송됨/발송중이면 버튼 대신 상태 배지(중복 발송은 서버가 막지만 UI에서도 선차단).
  if (sent) {
    return (
      <span className="rounded-md bg-mint py-2 text-center text-small font-medium text-accent-2">✓ 메일 발송됨</span>
    );
  }
  if (inFlight) {
    return (
      <span className="rounded-md bg-surface-2 py-2 text-center text-small font-medium text-muted">메일 발송 중…</span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-accent py-2 text-center text-small font-medium text-white hover:opacity-90"
      >
        {failed ? "메일 재발송" : "메일 발송"}
      </button>
      {failed && <span className="text-micro text-danger">직전 발송이 실패했습니다 — 다시 시도하세요.</span>}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-surface p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-body font-semibold text-text">견적서 메일 발송</h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-small">
                <span className="text-muted">받는 사람</span>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="customer@example.com"
                  className="rounded-md border border-border px-3 py-2 text-small"
                />
              </label>
              <label className="flex flex-col gap-1 text-small">
                <span className="text-muted">제목</span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="rounded-md border border-border px-3 py-2 text-small"
                />
              </label>
              <label className="flex flex-col gap-1 text-small">
                <span className="text-muted">본문</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  className="rounded-md border border-border px-3 py-2 text-small"
                />
              </label>
              <p className="text-micro text-muted">
                견적서 PDF 다운로드 링크가 본문에 자동 첨부되며, 담당자 명의로 발송됩니다.
              </p>
              {error && <p className="text-small text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-md border border-border px-4 py-2 text-small font-medium text-text"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-60"
                >
                  {pending ? "발송 중…" : "발송"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
