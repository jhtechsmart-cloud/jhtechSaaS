"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { PdfStatus, EmailStatus, ServiceReportRow } from "@/lib/service-reports/types";
import { emailStatusAction, pdfStatusAction, retryPdfAction } from "@/lib/service-reports/actions";

// 확정 완료 화면 — 문서(PDF)·메일 2행 상태 카드(autoplan F-S4 5변형).
// "발송되었습니다" 단정 금지: 실제 상태를 폴링해 정직하게 표시.
export function DoneScreen({ report }: { report: ServiceReportRow }) {
  const [pdf, setPdf] = useState<PdfStatus>(
    report.pdf_url ? { state: "ready", pdf_url: report.pdf_url } : { state: "processing" },
  );
  const [email, setEmail] = useState<EmailStatus | null>(null);
  const [note, setNote] = useState("");

  // PDF 폴링(3초, ready/failed까지) + 메일 상태.
  useEffect(() => {
    let stop = false;
    async function tick() {
      if (stop) return;
      const p = await pdfStatusAction(report.id);
      if (stop) return;
      if (p.ok) setPdf(p.data);
      const e = await emailStatusAction(report.id);
      if (!stop && e.ok) setEmail(e.data);
      if (p.ok && (p.data.state === "processing" || p.data.state === "none")) {
        setTimeout(tick, 3000);
      }
    }
    void tick();
    return () => {
      stop = true;
    };
  }, [report.id]);

  async function retry() {
    setNote("");
    const res = await retryPdfAction(report.id);
    if (res.ok) setPdf(res.data);
    else setNote(res.error);
  }

  const mailLabel = !report.recipient_email
    ? "수신 이메일 없음 — 발송 생략"
    : !report.sender_hiworks_user_id
      ? "메일 미발송 — 계정에 하이웍스 ID가 없습니다 (PDF 링크로 전달해 주세요)"
      : email === "sent"
        ? `발송됨 → ${report.recipient_email}`
        : email === "failed"
          ? "발송 실패 — 관리자 화면에서 확인해 주세요"
          : email === null
            ? "확인 중…"
            : "발송 대기 중…";

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <div className="py-8 text-center">
        <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-accent-soft text-h1 text-accent">
          ✓
        </div>
        <h2 className="text-h2 font-extrabold text-text">리포트가 확정되었습니다</h2>
        <p className="mt-1 font-mono text-small text-muted">{report.seq_no}</p>
        <p className="mt-2 text-small text-muted">🔒 확정된 리포트는 수정할 수 없습니다</p>
      </div>

      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <p className="text-small font-semibold text-muted">문서 (PDF)</p>
            <p className="mt-0.5 text-body text-text">
              {pdf.state === "ready"
                ? "생성 완료"
                : pdf.state === "failed"
                  ? "생성 실패"
                  : "생성 중…"}
            </p>
          </div>
          {pdf.state === "ready" && (
            // async window.open은 모바일서 팝업 차단·탭 먹통을 유발 — 일반 링크로 제스처 내비게이션.
            <a
              href={`/field/report/pdf?id=${report.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center rounded-full bg-accent px-5 text-small font-bold text-white"
            >
              PDF 보기
            </a>
          )}
          {pdf.state === "failed" && (
            <button
              type="button"
              onClick={() => void retry()}
              className="min-h-11 rounded-full border border-danger px-5 text-small font-bold text-danger"
            >
              다시 시도
            </button>
          )}
        </div>
        <div className="pt-3">
          <p className="text-small font-semibold text-muted">고객 메일</p>
          <p className="mt-0.5 text-body text-text">{mailLabel}</p>
        </div>
        {note && <p className="mt-2 text-small text-danger">{note}</p>}
      </div>

      {report.follow_needed && (
        <div className="rounded-md border border-border bg-surface p-4 shadow-card">
          <h3 className="text-small font-semibold text-muted">📌 후속 조치 대기 등록됨</h3>
          <p className="mt-1 text-body text-text">
            {report.follow_memo}
            {report.follow_date ? ` — 예정일 ${report.follow_date}` : ""}
          </p>
        </div>
      )}

      <Link
        href="/field"
        className="rounded-full border border-border bg-surface px-4 py-3 text-center text-body font-bold text-text"
      >
        홈으로
      </Link>
    </main>
  );
}
