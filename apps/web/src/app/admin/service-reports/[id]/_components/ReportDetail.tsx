"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adminApproveAction,
  adminPdfStatusAction,
  adminPdfUrlAction,
  adminResolveFollowAction,
  adminRetryPdfAction,
  adminSendMailAction,
  adminVoidReportAction,
  type AdminReportDetail,
} from "@/lib/service-reports/admin-actions";
import type { PdfStatus } from "@/lib/service-reports/types";
import { buildApprovalTimeline, describeTurn, fmtKstMinute } from "@/lib/service-reports/timeline";
import { SERVICE_REPORT_STATUS_LABEL } from "@/lib/service-reports/status";
import { MailBadge, StatusBadge } from "../../_components/ReportTable";
import { Modal } from "./Modal";
import { CompleteModal } from "./CompleteModal";

// 상세(클라, #285 #C) — D-B15 순서: 헤더(배지·차례·경과) → 요약(청구액 display) → PDF → 타임라인 → 이력.
// 액션은 항상 보이는 바(데스크톱 헤더 우측 / 모바일 하단 고정, D-B6). 권한 없는 버튼은 DOM 미포함.
const won = (n: number) => n.toLocaleString("ko-KR") + "원";
type ModalKind = "approve" | "complete" | "mail" | "void" | null;

export function ReportDetail({ initial }: { initial: AdminReportDetail }) {
  const router = useRouter();
  const r = initial;
  const [modal, setModal] = useState<ModalKind>(null);
  const [pending, startTransition] = useTransition();
  const [pdf, setPdf] = useState<PdfStatus>(r.pdf_url ? { state: "ready", pdf_url: r.pdf_url } : { state: "processing" });
  const [pdfUrl, setPdfUrl] = useState<{ url: string; rev: number } | null>(null); // 세대 바인딩 — 옛 세대 URL 재사용 금지
  const [live, setLive] = useState(""); // aria-live 알림

  // PDF 상태 폴링(5초, 화면이 열려 있는 동안만) — 승인 직후 '재생성 중' → ready 전환.
  useEffect(() => {
    // none(잡 없음)도 종단 — 아니면 draft·폐기된 잡에서 5초마다 영원히 폴링한다.
    if (pdf.state !== "processing") return;
    let stop = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight || document.hidden) return; // 요청 겹침·백그라운드 탭 낭비 방지
      inFlight = true;
      const res = await adminPdfStatusAction(r.id);
      inFlight = false;
      if (stop) return;
      if (res.ok) {
        setPdf(res.data);
        if (res.data.state === "ready") router.refresh();
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [pdf.state, r.id, router]);

  // 데스크톱 iframe용 서명 URL(10분). ready가 아닐 땐 iframe 자체를 그리지 않으므로 옛 URL 리셋 불필요(재생성 후 재조회).
  useEffect(() => {
    if (pdf.state !== "ready") return;
    let stop = false;
    adminPdfUrlAction(r.id).then((res) => {
      if (!stop && res.ok) setPdfUrl({ url: res.data, rev: r.pdf_revision });
    });
    return () => {
      stop = true;
    };
  }, [pdf.state, r.id, r.pdf_revision]);

  // 고객 메일 상태 폴링 — 워커가 pending → sent/failed로 바꾸는 걸 화면이 스스로 받아온다(최대 2분).
  // 없으면 "발송 대기"에 고착돼 재발송 버튼이 계속 잠긴다. 화면이 열려 있는 동안만(세션26 taste).
  useEffect(() => {
    if (r.mail !== "pending") return;
    let left = 24;
    const t = setInterval(() => {
      if (document.hidden) return;
      left -= 1;
      if (left <= 0) {
        clearInterval(t);
        return;
      }
      router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [r.mail, router]);

  const closeModal = useCallback(() => setModal(null), []);
  const turn = describeTurn(r, new Date());
  const timeline = buildApprovalTimeline(r);

  function run(label: string, fn: () => Promise<{ ok: true } | { ok: false; error: string } | { ok: true; data: unknown }>, after?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(label);
      setLive(label);
      setModal(null);
      after?.();
      router.refresh();
    });
  }

  const approveDisabledReason = !r.viewer.hasStamp
    ? "직인이 등록되지 않았습니다 — 관리자에게 요청하세요"
    : pdf.state !== "ready"
      ? "확정 PDF 생성 중 — 잠시 후 승인할 수 있습니다"
      : null;
  const mailDisabledReason = !r.recipient_email
    ? "수신 이메일 없음"
    : !r.viewer.hiworksReady
      ? "내 계정에 하이웍스 ID가 없습니다 — 관리자에게 요청하세요"
      : pdf.state !== "ready"
        ? "승인본 PDF 생성 중"
        : r.mail === "pending"
          ? "발송 대기 중"
          : null;

  const actions = (
    <>
      {r.viewer.canApprove && (
        <button
          type="button"
          onClick={() => setModal("approve")}
          disabled={pending || !!approveDisabledReason}
          title={approveDisabledReason ?? undefined}
          className="min-h-11 rounded-full bg-accent px-5 text-small font-bold text-white disabled:opacity-40"
        >
          승인
        </button>
      )}
      {r.viewer.canComplete && (
        <button
          type="button"
          onClick={() => setModal("complete")}
          disabled={pending || pdf.state !== "ready"}
          title={pdf.state !== "ready" ? "승인본 PDF 생성 중" : undefined}
          className="min-h-11 rounded-full bg-accent px-5 text-small font-bold text-white disabled:opacity-40"
        >
          완료 처리
        </button>
      )}
      {r.viewer.canSendMail && (
        <button
          type="button"
          onClick={() => setModal("mail")}
          disabled={pending || !!mailDisabledReason}
          title={mailDisabledReason ?? undefined}
          className="min-h-11 rounded-full border border-accent bg-accent-soft px-5 text-small font-bold text-accent disabled:opacity-40"
        >
          메일 발송
        </button>
      )}
      {r.viewer.canVoid && (
        <button type="button" onClick={() => setModal("void")} disabled={pending} className="min-h-11 px-3 text-small font-semibold text-danger underline-offset-4 hover:underline">
          무효화
        </button>
      )}
    </>
  );
  const hasActions = r.viewer.canApprove || r.viewer.canComplete || r.viewer.canSendMail || r.viewer.canVoid;

  return (
    <div className="flex flex-col gap-5 pb-24 lg:pb-0">
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      {/* 헤더 */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <Link href="/admin/service-reports" className="text-small text-muted hover:text-text">
            ← 서비스 리포트
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-h1 font-semibold tabular-nums text-text">{r.seq_no}</h1>
            <StatusBadge status={r.status} title={r.void_reason ?? undefined} />
            {(r.status === "approved" || r.status === "completed") && <MailBadge mail={r.mail} />}
          </div>
          <p className="text-body text-text">
            {r.customer_name} · {r.device_name}
            {r.device_serial ? ` (S/N ${r.device_serial})` : ""}
          </p>
          {turn && (
            <p className="text-small font-medium text-coral-text">
              지금 {turn.who} 차례 · {turn.days}일 경과
            </p>
          )}
          {r.status === "voided" && r.void_reason && <p className="text-small text-danger">무효 사유: {r.void_reason}</p>}
        </div>
        {hasActions && <div className="hidden items-center gap-2 lg:flex">{actions}</div>}
      </div>

      {/* 핵심 요약 */}
      <section className="grid grid-cols-1 gap-3 rounded-md border border-border bg-surface p-4 shadow-card sm:grid-cols-3">
        <div>
          <p className="text-small text-muted">청구액 {r.charge_type === "free" ? "" : "(VAT 포함)"}</p>
          <p className="font-mono text-display font-bold tabular-nums text-text">{r.charge_type === "free" ? "무상" : won(r.total)}</p>
          {r.charge_type === "free" && r.free_reason && <p className="text-micro text-muted">사유: {r.free_reason}</p>}
        </div>
        <div className="text-small">
          <p className="text-muted">엔지니어</p>
          <p className="text-text">
            {r.engineer_name ?? "—"}
            {r.engineer_title ? ` ${r.engineer_title}` : ""}
          </p>
          <p className="mt-2 text-muted">확정</p>
          <p className="font-mono tabular-nums text-text">{fmtKstMinute(r.issued_at) ?? "—"}</p>
        </div>
        <div className="text-small">
          <p className="text-muted">고장 분류</p>
          <p className="text-text">{r.faults.length ? r.faults.join(", ") : "—"}</p>
          <p className="mt-2 text-muted">후속조치</p>
          <p className="text-text">
            {r.follow_needed ? (r.follow_resolved_at ? `처리됨 ${(fmtKstMinute(r.follow_resolved_at) ?? "").slice(0, 10)}` : `대기${r.follow_date ? ` · ${r.follow_date}` : ""}`) : "없음"}
            {r.viewer.canResolveFollow && r.follow_needed && !r.follow_resolved_at && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run("후속조치를 처리 완료로 표시했습니다", () => adminResolveFollowAction(r.id))}
                className="ml-2 text-accent underline"
              >
                처리 완료
              </button>
            )}
          </p>
        </div>
      </section>

      {/* PDF */}
      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-body font-semibold text-text">리포트 PDF{r.pdf_revision > 1 ? ` (${r.status === "issued" ? "확정본" : "승인본"} r${r.pdf_revision})` : ""}</h2>
          <div className="flex items-center gap-2">
            {pdf.state === "processing" && <span className="rounded-full bg-lime/30 px-2.5 py-0.5 text-micro font-semibold text-pine-3">PDF {r.status === "issued" ? "생성" : "재생성"} 중…</span>}
            {pdf.state === "failed" && (
              <>
                <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-micro font-semibold text-danger" title={pdf.error}>
                  PDF 생성 실패
                </span>
                {r.viewer.canRetryPdf && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await adminRetryPdfAction(r.id);
                        if (res.ok) setPdf(res.data);
                        else toast.error(res.error);
                      })
                    }
                    className="rounded-full border border-border px-3 py-1 text-micro font-semibold text-text"
                  >
                    재시도
                  </button>
                )}
              </>
            )}
            {pdf.state === "ready" && (
              <button
                type="button"
                onClick={async () => {
                  const w = window.open("", "_blank");
                  const res = await adminPdfUrlAction(r.id);
                  if (res.ok && w) w.location.href = res.data;
                  else {
                    w?.close();
                    if (!res.ok) toast.error(res.error);
                  }
                }}
                className="rounded-full border border-border px-3 py-1 text-micro font-semibold text-text hover:bg-surface-2"
              >
                PDF 열기
              </button>
            )}
          </div>
        </div>
        {pdf.state === "ready" && pdfUrl?.rev === r.pdf_revision ? (
          <iframe title="리포트 PDF" src={pdfUrl.url} className="hidden h-[70vh] w-full rounded-md border border-border lg:block" />
        ) : pdf.state === "ready" ? (
          <div className="hidden h-[70vh] w-full animate-pulse rounded-md bg-surface-2 lg:block" aria-busy="true" />
        ) : null}
        {pdf.state === "ready" && <p className="text-micro text-muted lg:hidden">모바일에서는 [PDF 열기]로 새 창에서 확인합니다.</p>}
      </section>

      {/* 결재 타임라인(D-B4) */}
      <section className="rounded-md border border-border bg-surface p-4 shadow-card" aria-label={`결재 진행: ${turn ? `${turn.who} 대기` : r.status === "completed" ? "완료" : r.status === "voided" ? "무효" : ""}`}>
        <h2 className="mb-3 text-body font-semibold text-text">결재</h2>
        <ol className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-0">
          {timeline.map((s, i) => (
            <li key={s.key} className="flex items-start gap-3 lg:flex-1 lg:flex-col lg:items-center lg:gap-1">
              <span className="flex items-center lg:w-full">
                {i > 0 && <span className="hidden h-px flex-1 bg-border lg:block" aria-hidden />}
                <span
                  aria-hidden
                  className={`inline-block h-4 w-4 shrink-0 rounded-full border-2 ${
                    s.state === "done" ? "border-accent bg-accent" : s.state === "current" ? "border-accent bg-surface" : s.state === "void" ? "border-danger bg-danger/20" : "border-border bg-surface"
                  }`}
                />
                {i < timeline.length - 1 && <span className="hidden h-px flex-1 bg-border lg:block" aria-hidden />}
              </span>
              <span className="flex flex-col lg:items-center">
                <span className={`text-small font-semibold ${s.state === "done" ? "text-text" : s.state === "current" ? "text-accent" : "text-muted"}`}>
                  {s.label}
                  {s.state === "current" ? " (대기)" : s.state === "void" ? " (무효)" : ""}
                </span>
                <span className="text-micro text-muted">
                  {s.by ?? ""}
                  {s.at ? <span className="ml-1 font-mono tabular-nums">{s.at}</span> : null}
                </span>
              </span>
            </li>
          ))}
        </ol>
        {r.status === "completed" && (
          <p className="mt-3 text-small text-text">
            세금계산서: {r.tax_invoice_status === "invoiced" ? `발행함${r.tax_invoice_date ? ` (${r.tax_invoice_date})` : ""}` : "불필요"}
            {r.tax_invoice_memo ? <span className="text-muted"> · {r.tax_invoice_memo}</span> : null}
          </p>
        )}
        {r.approval_notice && r.status === "issued" && (
          <p className="mt-3 text-micro text-muted">
            {r.approval_notice.sent_count > 0
              ? `승인 요청 메일 발송 ${fmtKstMinute(r.approval_notice.last_sent_at) ?? ""} · ${r.approval_notice.sent_count}통`
              : "승인 요청 메일 미발송(발송 대기 또는 실패)"}
          </p>
        )}
      </section>

      {/* 조치 내용 + 교차 링크 */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-surface p-4 shadow-card">
          <h2 className="mb-2 text-body font-semibold text-text">점검·조치</h2>
          <p className="whitespace-pre-wrap text-small text-text">{r.diagnosis || "—"}</p>
          <p className="mt-2 whitespace-pre-wrap text-small text-text">{r.action_text || "—"}</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4 shadow-card text-small">
          <h2 className="mb-2 text-body font-semibold text-text">연결</h2>
          <ul className="flex flex-col gap-1">
            {r.service_request_id && (
              <li>
                <Link href={`/admin/service-requests/${r.service_request_id}`} className="text-accent underline">
                  A/S 의뢰
                </Link>
              </li>
            )}
            {r.company_id && (
              <li>
                <Link href={`/admin/customers/${r.company_id}`} className="text-accent underline">
                  고객: {r.customer_name}
                </Link>
              </li>
            )}
            {r.catalog_equipment_id && (
              <li>
                <Link href={`/admin/equipment/${r.catalog_equipment_id}`} className="text-accent underline">
                  장비 상세(AS 이력)
                </Link>
              </li>
            )}
            {r.parent_report_id && (
              <li>
                <Link href={`/admin/service-reports/${r.parent_report_id}`} className="text-accent underline">
                  원 리포트 — 이 문서는 후속 방문입니다
                </Link>
              </li>
            )}
            {r.children.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/service-reports/${c.id}`} className="text-accent underline">
                  후속 방문 {c.seq_no}
                </Link>
                <span className="ml-1 text-micro text-muted">{SERVICE_REPORT_STATUS_LABEL[c.status]}</span>
              </li>
            ))}
            {!r.service_request_id && !r.company_id && !r.catalog_equipment_id && !r.parent_report_id && r.children.length === 0 && (
              <li className="text-muted">연결된 항목 없음</li>
            )}
          </ul>
        </div>
      </section>

      {/* 고객 메일 이력 */}
      <section className="rounded-md border border-border bg-surface p-4 shadow-card">
        <h2 className="mb-2 text-body font-semibold text-text">고객 메일</h2>
        <p className="text-small text-muted">수신: {r.recipient_email ?? "없음"} · 승인본만 발송할 수 있습니다(수동).</p>
        {r.email_logs.length === 0 ? (
          <p className="mt-2 text-small text-muted">발송 이력 없음</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-small">
            {r.email_logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono tabular-nums text-muted">{fmtKstMinute(l.sent_at ?? l.created_at)}</span>
                <span className="text-text">{l.to_email}</span>
                <MailBadge mail={l.status === "sent" ? "sent" : l.status === "failed" ? "failed" : "pending"} />
                {l.error_msg && <span className="text-micro text-danger">{l.error_msg}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 모바일 하단 고정 액션 바(D-B6) */}
      {hasActions && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,.08)] lg:hidden">
          {actions}
        </div>
      )}

      {modal === "approve" && (
        <Modal title="리포트 승인" onClose={closeModal} busy={pending}>
          <div className="flex items-center gap-4">
            {r.viewer.stampUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.viewer.stampUrl} alt="내 직인" className="h-16 w-16 rounded-md border border-border object-contain" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-center text-micro text-muted">
                미리보기 실패
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
              <dt className="text-muted">고객</dt>
              <dd className="text-text">{r.customer_name}</dd>
              <dt className="text-muted">장비</dt>
              <dd className="text-text">{r.device_name}</dd>
              <dt className="text-muted">청구액</dt>
              <dd className="font-mono tabular-nums text-text">{r.charge_type === "free" ? "무상" : won(r.total)}</dd>
            </dl>
          </div>
          <p className="text-small text-text">직인이 찍힌 최종 문서가 생성됩니다. 승인 후 내용은 바뀌지 않습니다.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeModal} disabled={pending} className="min-h-11 rounded-full border border-border px-5 text-small font-semibold text-text">
              취소
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run("승인했습니다 — 직인이 찍힌 PDF를 다시 만드는 중입니다", () => adminApproveAction(r.id), () => { setPdf({ state: "processing" }); setPdfUrl(null); })
              }
              className="min-h-11 rounded-full bg-accent px-5 text-small font-bold text-white disabled:opacity-50"
            >
              {pending ? "승인 중…" : "승인"}
            </button>
          </div>
        </Modal>
      )}
      {modal === "complete" && (
        <CompleteModal
          reportId={r.id}
          onClose={closeModal}
          onDone={() => {
            setModal(null);
            setLive("완료 처리했습니다");
            toast.success("완료 처리했습니다", {
              action: { label: "완료 탭 보기", onClick: () => router.push("/admin/service-reports?tab=completed&period=month") },
            });
            router.refresh();
          }}
        />
      )}
      {modal === "mail" && (
        <Modal title="고객 메일 발송" onClose={closeModal} busy={pending}>
          <p className="text-small text-text">
            승인본 PDF 다운로드 링크(7일)를 <b className="font-mono">{r.recipient_email}</b> 으로 보냅니다. 발신자는 내 하이웍스 계정입니다.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeModal} disabled={pending} className="min-h-11 rounded-full border border-border px-5 text-small font-semibold text-text">
              취소
            </button>
            <button type="button" disabled={pending} onClick={() => run("발송을 요청했습니다 — 잠시 후 이력에 반영됩니다", () => adminSendMailAction(r.id))} className="min-h-11 rounded-full bg-accent px-5 text-small font-bold text-white disabled:opacity-50">
              {pending ? "요청 중…" : "발송"}
            </button>
          </div>
        </Modal>
      )}
      {modal === "void" && <VoidModal reportId={r.id} seqNo={r.seq_no} onClose={closeModal} pending={pending} onSubmit={(reason) => run("무효 처리했습니다", () => adminVoidReportAction(r.id, reason))} />}
    </div>
  );
}

// 무효화 모달(D-B9) — 사유 필수 ≤200, users.manage. window.prompt 제거.
function VoidModal({ reportId, seqNo, onClose, onSubmit, pending }: { reportId: string; seqNo: string; onClose: () => void; onSubmit: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length > 0 && reason.trim().length <= 200;
  return (
    <Modal title="리포트 무효화" onClose={onClose} busy={pending}>
      <p className="text-small text-text">
        <span className="font-mono">{seqNo}</span> 리포트를 무효 처리합니다. 내용 수정은 불가하며 정정은 새 리포트로 작성합니다.
      </p>
      <label className="flex flex-col gap-1 text-small font-medium text-muted" htmlFor={`void-${reportId}`}>
        무효화 사유 *
        <textarea id={`void-${reportId}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={200} className="rounded-md border border-border px-3 py-2 text-small text-text" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={pending} className="min-h-11 rounded-full border border-border px-5 text-small font-semibold text-text">
          취소
        </button>
        <button type="button" disabled={pending || !valid} onClick={() => onSubmit(reason.trim())} className="min-h-11 rounded-full bg-danger px-5 text-small font-bold text-white disabled:opacity-50">
          {pending ? "처리 중…" : "무효화"}
        </button>
      </div>
    </Modal>
  );
}
