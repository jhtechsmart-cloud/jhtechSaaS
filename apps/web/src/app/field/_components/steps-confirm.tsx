"use client";
import { useState } from "react";
import {
  calculateServiceCharge,
  judgeWarranty,
  FREE_REASONS,
} from "@jhtechsaas/shared";
import { AmountInput } from "@/app/admin/_components/AmountInput";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { ReportPayload, ServiceReportRow } from "@/lib/service-reports/types";
import { issueReportAction } from "@/lib/service-reports/actions";
import { SignaturePad } from "./SignaturePad";

// 7·8단계 — 청구(유/무상·금액)·요약+서명 잠금 뷰(고객 핸드오프, F-J1)+2단 확정.

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

export function Step7Charge({
  draft,
  patch,
}: {
  draft: ReportPayload;
  patch: (p: Partial<ReportPayload>) => void;
}) {
  const warranty = judgeWarranty(draft.purchased_at || null, new Date());
  const calc = calculateServiceCharge({
    chargeType: draft.charge_type,
    visitFee: draft.visit_fee,
    overtimeFee: draft.overtime_fee,
    parts: draft.parts,
  });
  const isFree = draft.charge_type === "free";

  return (
    <>
      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <h3 className="mb-2 text-small font-semibold text-muted">유상 · 무상</h3>
        <div className="mb-2 flex rounded-full bg-surface-2 p-1">
          {(
            [
              { v: "paid", label: "유상" },
              { v: "free", label: "무상" },
            ] as const
          ).map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => patch({ charge_type: t.v, free_reason: t.v === "paid" ? "" : draft.free_reason })}
              className={`min-h-11 flex-1 rounded-full text-small font-semibold ${
                draft.charge_type === t.v ? "bg-accent text-white" : "text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-small text-muted">
          {warranty
            ? warranty.inWarranty
              ? `시스템 판정: 구매 후 ${warranty.months}개월 — 무상 대상 (필요 시 변경)`
              : `시스템 판정: 구매 후 ${warranty.months}개월 — 유상`
            : "구매일 미입력 — 기본 유상"}
        </p>
        {isFree && (
          <div className="mt-3">
            <p className="mb-2 text-small font-medium text-muted">무상 사유 *</p>
            <div className="flex flex-wrap gap-2">
              {FREE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => patch({ free_reason: r })}
                  className={`min-h-11 rounded-full border px-4 text-small ${
                    draft.free_reason === r
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-surface text-text"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={`rounded-md border border-border bg-surface p-4 shadow-card ${isFree ? "opacity-60" : ""}`}>
        <h3 className="mb-2 text-small font-semibold text-muted">청구 내역</h3>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-small font-medium text-muted">
            출장비 (원)
            <AmountInput
              value={draft.visit_fee}
              onChange={(v) => patch({ visit_fee: Number.isFinite(v) ? Math.min(v, 100000000) : 0 })}
              aria-label="출장비"
              disabled={isFree}
              className="rounded-full border border-border bg-surface px-4 py-3 text-right font-mono text-body text-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-muted">
            시간외 출장비 (원) — 평일 18시 이후·주말·공휴일
            <AmountInput
              value={draft.overtime_fee}
              onChange={(v) => patch({ overtime_fee: Number.isFinite(v) ? Math.min(v, 100000000) : 0 })}
              aria-label="시간외 출장비"
              disabled={isFree}
              className="rounded-full border border-border bg-surface px-4 py-3 text-right font-mono text-body text-text"
            />
          </label>
        </div>
        <table className="mt-4 w-full text-body">
          <tbody>
            {(
              [
                ["출장비", calc.supply - calc.partsTotal - (isFree ? 0 : draft.overtime_fee)],
                ["시간외 출장비", isFree ? 0 : draft.overtime_fee],
                ["부품비", calc.partsTotal],
                ["부가세 (10%)", calc.vat],
              ] as const
            ).map(([label, v]) => (
              <tr key={label} className="border-b border-border">
                <td className="py-2 text-muted">{label}</td>
                <td className="py-2 text-right font-mono tabular-nums">{won(v)}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-3 text-body font-extrabold">총 청구액</td>
              <td className="pt-3 text-right font-mono text-h2 font-extrabold tabular-nums text-accent">
                {isFree ? "무상 (0원)" : won(calc.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <label className="flex flex-col gap-1 text-small font-medium text-muted">
          리포트 사본 수신 이메일 — 비우면 발송 생략
          <input
            value={draft.recipient_email}
            onChange={(e) => patch({ recipient_email: e.target.value })}
            type="email"
            inputMode="email"
            placeholder="customer@example.com"
            className="rounded-full border border-border bg-surface px-4 py-3 font-mono text-body text-text"
          />
        </label>
      </div>
    </>
  );
}

export function Step8Summary({
  draft,
  patch,
  reportId,
  persist,
  gotoStep,
  onIssued,
}: {
  draft: ReportPayload;
  patch: (p: Partial<ReportPayload>) => void;
  reportId: string | null;
  persist: () => Promise<{ ok: boolean; id: string | null; error?: string }>;
  gotoStep: (n: number) => void;
  onIssued: (row: ServiceReportRow) => void;
}) {
  const [lockView, setLockView] = useState(false);
  const [signBlob, setSignBlob] = useState<Blob | null>(null);
  const [signed, setSigned] = useState(!!draft.signature_path);
  const [busy, setBusy] = useState<"" | "upload" | "issue">("");
  const [error, setError] = useState("");

  const calc = calculateServiceCharge({
    chargeType: draft.charge_type,
    visitFee: draft.visit_fee,
    overtimeFee: draft.overtime_fee,
    parts: draft.parts,
  });
  const isFree = draft.charge_type === "free";
  const totalLabel = isFree ? `무상 (0원) · ${draft.free_reason}` : won(calc.total);

  const rows: [string, string, number][] = [
    ["고객", draft.customer_name + (draft.company_id ? "" : " (신규)"), 1],
    ["장비", `${draft.device_name}${draft.device_serial ? ` · S/N ${draft.device_serial}` : ""}`, 2],
    ["고장 분류", draft.faults.join(", "), 3],
    ["조치", draft.action_text, 4],
    ["향후 일정", draft.follow_needed ? `${draft.follow_memo}${draft.follow_date ? ` (${draft.follow_date})` : ""}` : "조치 완료", 5],
    ["부품", draft.parts.length ? draft.parts.map((p) => `${p.name} ×${p.qty}`).join(", ") : "없음", 6],
    ["청구", `${totalLabel}${isFree ? "" : " (VAT 포함)"}`, 7],
    ["수신 이메일", draft.recipient_email || "발송 생략", 7],
  ];

  // 고객 서명 저장(잠금 뷰에서 서명 완료 시) — 스토리지 업로드 후 draft에 경로 반영·저장.
  async function saveSignature(): Promise<boolean> {
    if (!signBlob) return false;
    setBusy("upload");
    setError("");
    // 리포트 id 확보(미저장이면 저장부터)
    let id = reportId;
    if (!id) {
      const saved = await persist();
      if (!saved.ok || !saved.id) {
        setBusy("");
        setError(saved.error ?? "임시저장에 실패했습니다");
        return false;
      }
      id = saved.id;
    }
    const path = `${id}/signature.png`;
    const supabase = createSupabaseBrowserClient();
    // 스토리지에 UPDATE 정책이 없어 upsert(덮어쓰기)는 재서명 시 거부됨 — 삭제 후 새로 업로드.
    await supabase.storage.from("service-reports").remove([path]);
    const { error: upErr } = await supabase.storage
      .from("service-reports")
      .upload(path, signBlob, { contentType: "image/png" });
    if (upErr) {
      setBusy("");
      setError("서명 업로드 실패 — 네트워크 확인 후 다시 시도해 주세요 (서명은 유지됩니다)");
      return false;
    }
    patch({ signature_path: path });
    setSigned(true);
    setBusy("");
    return true;
  }

  // 기사 최종 확정(2단) — 서명 경로 포함 draft 저장 → issue RPC. 실패 시 서명 보존(F-S1).
  async function finalIssue() {
    setBusy("issue");
    setError("");
    const saved = await persist();
    if (!saved.ok || !saved.id) {
      setBusy("");
      setError(saved.error ?? "저장에 실패했습니다 — 다시 시도해 주세요");
      return;
    }
    const res = await issueReportAction(saved.id);
    setBusy("");
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onIssued(res.data);
  }

  if (lockView) {
    // ── 고객 핸드오프 잠금 뷰 — 총액·요약·확인문·서명만. 단계 레일·이전·내부 정보 없음(F-J1).
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-bg">
        <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-4 p-5">
          <button
            type="button"
            onClick={() => setLockView(false)}
            className="self-start text-small text-muted underline"
          >
            ← 이전 화면으로
          </button>
          <div className="rounded-md border border-border bg-surface p-5 text-center shadow-card">
            <p className="text-small text-muted">총 청구액 {isFree ? "" : "(VAT 포함)"}</p>
            <p className="mt-1 font-mono text-[28px] font-extrabold tabular-nums text-accent">
              {isFree ? "무상 (0원)" : won(calc.total)}
            </p>
            {isFree && <p className="text-small text-muted">사유: {draft.free_reason}</p>}
          </div>
          <table className="w-full text-small">
            <tbody>
              {rows.slice(0, 6).map(([k, v]) => (
                <tr key={k} className="border-b border-border align-top">
                  <td className="w-20 whitespace-nowrap py-2 text-muted">{k}</td>
                  <td className="py-2 text-text">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rounded-md bg-accent-soft px-4 py-3 text-small leading-relaxed text-text">
            상기 내용과 같이 장비를 점검·수리하였으며, 청구 금액을 확인합니다.
          </p>
          <SignaturePad onChange={setSignBlob} />
          {error && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-small font-medium text-danger">{error}</p>
          )}
          <button
            type="button"
            disabled={!signBlob || busy !== ""}
            onClick={async () => {
              const ok = await saveSignature();
              if (ok) setLockView(false);
            }}
            className="min-h-12 rounded-full bg-accent text-body font-bold text-white disabled:opacity-40"
          >
            {busy === "upload" ? "서명 저장 중…" : "서명 완료"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <h3 className="mb-2 text-small font-semibold text-muted">리포트 요약 — 항목을 탭하면 수정</h3>
        <table className="w-full text-small">
          <tbody>
            {rows.map(([k, v, step]) => (
              <tr key={k} className="border-b border-border align-top last:border-b-0">
                <td className="w-20 whitespace-nowrap py-2 text-muted">{k}</td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => gotoStep(step)}
                    className="w-full text-left text-text underline decoration-border underline-offset-4"
                  >
                    {v || "—"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        {signed ? (
          <div className="flex items-center justify-between">
            <p className="text-body font-semibold text-accent">✓ 고객 서명 완료</p>
            <button
              type="button"
              onClick={() => {
                setSigned(false);
                setSignBlob(null);
                patch({ signature_path: "" });
                setLockView(true);
              }}
              className="min-h-11 px-2 text-small text-muted underline"
            >
              다시 받기
            </button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-small text-muted">
              고객에게 화면을 건네 서명을 받습니다. 서명 화면에는 총액과 요약만 표시됩니다.
            </p>
            <button
              type="button"
              onClick={() => setLockView(true)}
              className="min-h-12 w-full rounded-full bg-accent text-body font-bold text-white"
            >
              고객 확인 요청 (서명 받기)
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-small font-medium text-danger">{error}</p>
      )}

      <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 gap-2 border-t border-border bg-surface/95 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur">
        <button
          type="button"
          onClick={() => gotoStep(7)}
          className="min-h-12 flex-[0.5] rounded-full border border-border bg-surface text-body font-bold text-text"
        >
          이전
        </button>
        <button
          type="button"
          disabled={!signed || busy !== ""}
          onClick={() => void finalIssue()}
          className="min-h-12 flex-1 rounded-full bg-accent text-body font-bold text-white disabled:opacity-40"
        >
          {busy === "issue" ? "확정 중…" : "리포트 확정"}
        </button>
      </nav>
    </>
  );
}
