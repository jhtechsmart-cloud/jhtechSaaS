"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReportPayload, ServiceReportRow, EquipmentItem, OpenRequest } from "@/lib/service-reports/types";
import { upsertReportAction } from "@/lib/service-reports/actions";
import { applyDraftPatch } from "@/lib/service-reports/draft";
import { emptyPayloadBase, rowToPayload } from "@/lib/service-reports/payload";
import type { FollowUpReference } from "@/lib/service-reports/followup";
import { Step1Customer, Step2Equipment } from "./steps-basic";
import { Step3Fault, Step4Action, Step5Follow, Step6Parts } from "./steps-detail";
import { Step7Charge, Step8Summary } from "./steps-confirm";
import { DoneScreen } from "./DoneScreen";

// 현장 서비스 리포트 8단계 마법사(#228 Part 3, 목업 V4 UX + autoplan 보완).
// - 단계 = URL 쿼리(step) → 브라우저 뒤로가기/스와이프 = 이전 단계(F-J4)
// - 단계 이동·명시 버튼마다 draft upsert(저장 실패해도 이동 허용, 상태 표시 — F-S3)
// - 확정은 SignLockView(고객 핸드오프 잠금 뷰) → 기사 최종 확정 2단(F-J1, Step8 내부)

export const STEP_TITLES = [
  "고객 정보",
  "장비 정보",
  "점검·고장 내역",
  "조치·수리 내역",
  "향후 일정",
  "교체 부품",
  "청구 내역",
  "고객 확인·서명",
] as const;



// 단계별 컨텍스트(고객 검색 결과 등 payload 밖 화면 상태)
export interface WizardCtx {
  equipment: EquipmentItem[];
  openRequests: OpenRequest[];
  manualCustomer: boolean;
  manualEquipment: boolean;
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; msg: string };

export function ReportWizard({
  initial,
  followUp = null,
}: {
  initial: ServiceReportRow | null;
  // #285 #D 후속 방문 — 부모에서 고객·장비를 프리필하고, 원 리포트 내용을 읽기 전용 참고 카드로 보여준다.
  followUp?: { seed: ReportPayload; reference: FollowUpReference } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = Math.min(8, Math.max(1, Number(searchParams.get("step") ?? "1") || 1));

  const [reportId, setReportId] = useState<string | null>(initial?.id ?? null);
  const [seqNo, setSeqNo] = useState<string>(initial?.seq_no ?? "");
  const [draft, setDraft] = useState<ReportPayload>(
    initial ? rowToPayload(initial) : (followUp?.seed ?? emptyPayloadBase()),
  );
  const [ctx, setCtx] = useState<WizardCtx>({
    equipment: [],
    openRequests: [],
    manualCustomer: initial
      ? initial.company_id === null && !!initial.customer_name
      : !!followUp && followUp.seed.company_id === null && !!followUp.seed.customer_name,
    manualEquipment: initial
      ? initial.company_equipment_id === null && !!initial.device_name
      : !!followUp && followUp.seed.company_equipment_id === null && !!followUp.seed.device_name,
  });
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [stepError, setStepError] = useState("");
  const [issued, setIssued] = useState<ServiceReportRow | null>(
    initial && initial.status !== "draft" ? initial : null,
  );
  // 최신 draft/id를 콜백(persist)에서 참조 — 렌더 중 ref 쓰기 금지(lint) → effect로 동기화.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const idRef = useRef(reportId);
  useEffect(() => {
    idRef.current = reportId;
  }, [reportId]);
  // 사용자가 마지막으로 "가려고 한" 단계. 첫 저장 뒤 id를 URL에 심는 replace가, 방금 push한 단계를
  // 되돌리지 않게 한다(push는 RSC 응답이 와야 window.location에 반영되므로 replace가 옛 step을 읽는다).
  const pendingStepRef = useRef(step);
  useEffect(() => {
    pendingStepRef.current = step;
  }, [step]);

  const patch = useCallback((p: Partial<ReportPayload>) => {
    // 서명 후 내용이 바뀌면 고객·기사 서명 무효화 — 서명한 내용과 다른 문서로 확정 불가(규칙은 draft.ts 순수 함수).
    setDraft((d) => applyDraftPatch(d, p));
  }, []);

  // draft 저장 — 신규면 id 획득 후 URL에 반영(새로고침·이어쓰기 성립).
  const persist = useCallback(async (): Promise<{ ok: boolean; id: string | null; error?: string }> => {
    setSave({ kind: "saving" });
    const res = await upsertReportAction(idRef.current, draftRef.current);
    if (!res.ok) {
      setSave({ kind: "error", msg: res.error });
      return { ok: false, id: idRef.current, error: res.error };
    }
    setSave({ kind: "saved" });
    setSeqNo(res.data.seq_no);
    if (!idRef.current) {
      setReportId(res.data.id);
      // 저장 완료 시점의 실제 URL 기준으로 id만 심는다 — 렌더 스냅샷(searchParams)을 쓰면
      // 저장 중에 단계가 넘어간 경우 옛 step으로 되돌리는 replace가 돼 단계가 튕긴다.
      const q = new URLSearchParams(window.location.search);
      q.set("id", res.data.id);
      q.set("step", String(pendingStepRef.current));
      q.delete("parent"); // id가 생기면 부모는 행에 저장돼 있다 — URL에 남기면 새로고침 시 시드를 다시 만든다
      router.replace(`/field/report?${q.toString()}`, { scroll: false });
    }
    return { ok: true, id: res.data.id };
  }, [router]);

  const goto = useCallback(
    (next: number) => {
      pendingStepRef.current = next;
      const q = new URLSearchParams(searchParams.toString());
      if (idRef.current) {
        q.set("id", idRef.current);
        q.delete("parent");
      }
      q.set("step", String(next));
      router.push(`/field/report?${q.toString()}`, { scroll: false });
      window.scrollTo({ top: 0 });
    },
    [router, searchParams],
  );

  // 단계 검증(목업 규칙 + 필수 최소화: 사진·부품·후속은 선택)
  function validate(s: number): string {
    const d = draftRef.current;
    if (s === 1) {
      if (!d.company_id && !d.customer_name.trim()) return "고객을 선택하거나 직접 입력해 주세요";
    }
    if (s === 2) {
      if (!d.company_equipment_id && !d.device_name.trim()) return "장비를 선택하거나 직접 입력해 주세요";
    }
    if (s === 3) {
      if (d.faults.length === 0) return "고장 분류를 1개 이상 선택해 주세요";
      if (!d.diagnosis.trim()) return "점검 내역을 입력해 주세요";
    }
    if (s === 4 && !d.action_text.trim()) return "조치 내역을 입력해 주세요";
    if (s === 5 && d.follow_needed && !d.follow_memo.trim()) return "후속 조치 예정 내용을 입력해 주세요";
    if (s === 7 && d.charge_type === "free" && !d.free_reason) return "무상 사유를 선택해 주세요";
    return "";
  }

  async function next() {
    const err = validate(step);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError("");
    // 저장 실패해도 이동은 허용(현장 흐름 유지) — 저장 상태 텍스트가 실패를 표시(F-S3).
    void persist();
    goto(step + 1);
  }

  // 저장 상태 배지 자동 소거
  useEffect(() => {
    if (save.kind !== "saved") return;
    const t = setTimeout(() => setSave({ kind: "idle" }), 2000);
    return () => clearTimeout(t);
  }, [save]);

  if (issued) {
    return <DoneScreen report={issued} />;
  }

  const contextLine =
    step >= 2 && (draft.customer_name || draft.device_name)
      ? [draft.customer_name, draft.device_name].filter(Boolean).join(" · ")
      : "";

  return (
    <main className="flex flex-1 flex-col pb-28">
      <div className="sticky top-[49px] z-10 border-b border-border bg-bg px-4 pb-2 pt-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-body font-extrabold text-text">{STEP_TITLES[step - 1]}</h1>
          <span className="font-mono text-micro text-muted">
            {seqNo || (followUp ? "후속 리포트" : "임시 작성 중")} · {step} / 8
          </span>
        </div>
        {contextLine && <p className="mt-0.5 truncate text-small text-muted">{contextLine}</p>}
        <div className="mt-2 flex gap-1" aria-label={`8단계 중 ${step}단계`}>
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i + 1 < step ? "bg-accent/40" : i + 1 === step ? "bg-accent" : "bg-border"
              }`}
            />
          ))}
        </div>
        <div className="mt-1 h-4 text-micro">
          {save.kind === "saving" && <span className="text-muted">저장 중…</span>}
          {save.kind === "saved" && <span className="text-muted">저장됨 · 방금</span>}
          {save.kind === "error" && (
            <button type="button" onClick={() => void persist()} className="text-danger underline">
              저장 실패 — 다시 시도
            </button>
          )}
        </div>
      </div>

      {followUp && (
        <details className="mx-4 mt-3 rounded-md border border-accent/40 bg-accent-soft/40 px-3 py-2">
          <summary className="cursor-pointer list-none text-small font-semibold text-accent">
            후속 방문 · 원 리포트 {followUp.reference.seqNo} 보기
          </summary>
          <div className="mt-2 flex flex-col gap-1 text-small text-text">
            <p className="text-micro text-muted">확정 {followUp.reference.issuedAtLabel}</p>
            {followUp.reference.faults.length > 0 && (
              <p>
                <span className="text-muted">고장 분류 </span>
                {followUp.reference.faults.join(", ")}
              </p>
            )}
            {followUp.reference.followLabel && (
              <p>
                <span className="text-muted">후속 예정 </span>
                {followUp.reference.followLabel}
              </p>
            )}
            <p className="whitespace-pre-wrap text-muted">{followUp.reference.actionSummary}</p>
          </div>
        </details>
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        {step === 1 && <Step1Customer draft={draft} patch={patch} ctx={ctx} setCtx={setCtx} />}
        {step === 2 && <Step2Equipment draft={draft} patch={patch} ctx={ctx} setCtx={setCtx} />}
        {step === 3 && (
          <Step3Fault draft={draft} patch={patch} reportId={reportId} onNeedId={persist} />
        )}
        {step === 4 && (
          <Step4Action draft={draft} patch={patch} reportId={reportId} onNeedId={persist} />
        )}
        {step === 5 && <Step5Follow draft={draft} patch={patch} />}
        {step === 6 && <Step6Parts draft={draft} patch={patch} />}
        {step === 7 && <Step7Charge draft={draft} patch={patch} />}
        {step === 8 && (
          <Step8Summary
            draft={draft}
            patch={patch}
            reportId={reportId}
            persist={persist}
            gotoStep={goto}
            onIssued={(row) => setIssued(row)}
          />
        )}
        {stepError && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-small font-medium text-danger">{stepError}</p>
        )}
      </div>

      {step < 8 && (
        <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[430px] -translate-x-1/2 gap-2 border-t border-border bg-surface/95 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur">
          {step > 1 && (
            <button
              type="button"
              onClick={() => goto(step - 1)}
              className="min-h-12 flex-[0.5] rounded-full border border-border bg-surface text-body font-bold text-text"
            >
              이전
            </button>
          )}
          <button
            type="button"
            onClick={() => void next()}
            className="min-h-12 flex-1 rounded-full bg-accent text-body font-bold text-white"
          >
            다음
          </button>
        </nav>
      )}
    </main>
  );
}
