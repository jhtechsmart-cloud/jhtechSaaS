"use client";
import { useState, useTransition } from "react";
import type { ReleaseOrderDetails } from "@jhtechsaas/shared";
import { RELEASE_OPTIONS, normalizeDetailsForKind, toggleArrayValue } from "@/lib/release-orders/form";
import { issueReleaseOrderAction, saveReleaseOrderAction } from "@/lib/release-orders/actions";
import { ReleaseOrderPdfButton } from "./ReleaseOrderPdfButton";

type DeviceKind = "printer" | "cutter";

// 자동채움 표시값(읽기전용) — 저장 시 서버 RPC가 다시 채운다.
type Autofill = {
  company: string;
  deviceName: string;
  contactPhone: string;
  installAddress: string;
  installAtLabel: string | null;
};

// 체크박스 칩 한 줄.
function Check({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-small transition disabled:opacity-50 ${
        on ? "border-accent bg-mint font-semibold text-accent-2" : "border-border bg-surface text-muted hover:bg-mint-hover"
      }`}
    >
      <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] text-[9px] text-white ${on ? "bg-accent" : "border border-border bg-surface"}`}>
        {on ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

// 체크박스 그룹(고정 항목 → details 배열 토글).
function CheckGroup({
  label,
  options,
  selected,
  onToggle,
  disabled,
  auto,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
  disabled?: boolean;
  auto?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-border p-3 ${auto ? "bg-mint/40" : "bg-surface"}`}>
      <div className="mb-2 text-small font-semibold text-text">
        {label}
        {auto && <span className="ml-1.5 rounded-full bg-mint px-1.5 py-0.5 text-micro font-semibold text-accent">설문 연동</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Check key={o} on={selected.includes(o)} label={o} onClick={() => onToggle(o)} disabled={disabled} />
        ))}
      </div>
    </div>
  );
}

// 자동채움 텍스트 필드(민트 배경 + '자동' 배지). 읽기전용.
function AutoField({ label, value, badge = "자동", full }: { label: string; value: string; badge?: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-micro text-muted">
        {label} <span className="ml-1 rounded-full bg-mint px-1.5 py-0.5 text-micro font-semibold text-accent">{badge}</span>
      </label>
      <div className="w-full rounded-full border border-accent-ring/40 bg-mint px-3 py-2 text-small text-text">{value || "—"}</div>
    </div>
  );
}

// 자유입력 텍스트 필드.
function TextField({ label, value, onChange, disabled, placeholder }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-micro text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full rounded-full border border-border bg-surface px-3 py-2 text-small text-text outline-none focus:border-accent-ring disabled:opacity-50"
      />
    </div>
  );
}

function SectionHead({ title, en, right }: { title: string; en?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-4 w-1 rounded-full bg-accent" />
      <h2 className="text-body font-bold text-text">{title}</h2>
      {en && <span className="text-micro font-semibold tracking-wide text-muted">{en}</span>}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

export function ReleaseOrderForm({
  applicationId,
  autofill,
  hasIssuedQuote,
  initialDeviceKind,
  initialDetails,
  releaseOrder,
  pdfReady,
}: {
  applicationId: string;
  autofill: Autofill;
  hasIssuedQuote: boolean;
  initialDeviceKind: DeviceKind;
  initialDetails: ReleaseOrderDetails;
  releaseOrder: { id: string; status: "draft" | "issued" } | null;
  pdfReady: boolean;
}) {
  const locked = releaseOrder?.status === "issued";
  const [deviceKind, setDeviceKind] = useState<DeviceKind>(initialDeviceKind);
  const [details, setDetails] = useState<ReleaseOrderDetails>(() => normalizeDetailsForKind(initialDetails, initialDeviceKind));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 발행 전제(I1) 미러 — 견적·설치일 없으면 발행 불가(서버 RPC가 최종 강제).
  const canIssue = hasIssuedQuote && !!autofill.installAtLabel;

  function switchKind(k: DeviceKind) {
    if (locked) return;
    setDeviceKind(k);
    setDetails((d) => normalizeDetailsForKind(d, k));
  }
  // 중첩 섹션 부분 갱신 헬퍼.
  const setPrinter = (patch: Partial<NonNullable<ReleaseOrderDetails["printer"]>>) =>
    setDetails((d) => ({ ...d, printer: { ...(d.printer ?? ({} as NonNullable<ReleaseOrderDetails["printer"]>)), ...patch } }));
  const setCutter = (patch: Partial<NonNullable<ReleaseOrderDetails["cutter"]>>) =>
    setDetails((d) => ({ ...d, cutter: { ...(d.cutter ?? ({} as NonNullable<ReleaseOrderDetails["cutter"]>)), ...patch } }));
  const setCommon = (patch: Partial<ReleaseOrderDetails["common"]>) => setDetails((d) => ({ ...d, common: { ...d.common, ...patch } }));
  const setPrep = (patch: Partial<ReleaseOrderDetails["prep"]>) => setDetails((d) => ({ ...d, prep: { ...d.prep, ...patch } }));
  const setSite = (patch: Partial<ReleaseOrderDetails["site"]>) => setDetails((d) => ({ ...d, site: { ...d.site, ...patch } }));

  const p = details.printer;
  const c = details.cutter;

  async function save(): Promise<string | null> {
    const normalized = normalizeDetailsForKind(details, deviceKind);
    const res = await saveReleaseOrderAction(applicationId, deviceKind, normalized);
    if ("error" in res) {
      setError(res.error);
      return null;
    }
    return res.id;
  }

  function onSaveDraft() {
    if (locked) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const id = await save();
      if (id) setNotice("임시저장되었습니다.");
    });
  }

  function onIssue() {
    if (locked || !canIssue) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const id = await save();
      if (!id) return;
      const res = await issueReleaseOrderAction(id, applicationId); // 성공 시 redirect
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {locked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-ring/40 bg-mint px-4 py-3 text-small text-accent-2">
          <span>발행된 출고의뢰서입니다. 내용은 잠겨 있습니다.</span>
          <ReleaseOrderPdfButton applicationId={applicationId} initialReady={pdfReady} />
        </div>
      )}
      {error && <div className="rounded-xl border border-coral/40 bg-coral-soft px-4 py-3 text-small text-coral-text">{error}</div>}
      {notice && <div className="rounded-xl border border-accent-ring/40 bg-mint px-4 py-3 text-small text-accent-2">{notice}</div>}

      {/* ① 고객정보 — 전부 자동채움(읽기전용) */}
      <section>
        <SectionHead title="고객정보" en="CUSTOMER INFORMATION" />
        <p className="mb-2 text-micro text-muted"><span className="mr-1 inline-block h-3 w-3 rounded-[3px] border border-accent-ring/40 bg-mint align-middle" />연한 민트 = 견적·신청에서 자동으로 채워진 항목</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AutoField label="회사/고객명" value={autofill.company} />
          <AutoField label="장비명" value={autofill.deviceName} />
          <AutoField label="전화번호" value={autofill.contactPhone} />
          <AutoField label="설치 일시" value={autofill.installAtLabel ?? ""} badge="자동·견적 납품일정" />
          <AutoField label="설치 주소" value={autofill.installAddress} full />
        </div>
      </section>

      {/* ② 장비상세정보 — 프린터/커팅기 택1 */}
      <section>
        <SectionHead
          title="장비상세정보"
          right={
            <span className="inline-flex overflow-hidden rounded-full border border-border">
              <button type="button" onClick={() => switchKind("printer")} disabled={locked} className={`px-4 py-1 text-small font-semibold ${deviceKind === "printer" ? "bg-accent text-white" : "text-muted"}`}>● 프린터</button>
              <button type="button" onClick={() => switchKind("cutter")} disabled={locked} className={`px-4 py-1 text-small font-semibold ${deviceKind === "cutter" ? "bg-accent text-white" : "text-muted"}`}>○ 커팅기</button>
            </span>
          }
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 프린터 패널 */}
          <div className={`rounded-2xl border ${deviceKind === "printer" ? "border-accent shadow-card" : "border-border opacity-60"}`}>
            <div className={`flex items-center justify-between rounded-t-2xl px-3 py-2.5 text-small font-bold ${deviceKind === "printer" ? "bg-mint text-text" : "bg-surface-2 text-muted"}`}>프린터 {deviceKind === "printer" ? "· 선택됨" : ""}</div>
            <div className="flex flex-col gap-3 p-3">
              <CheckGroup label="제공 RIP" options={RELEASE_OPTIONS.printerRip} selected={p?.rip ? [p.rip] : []} disabled={locked || deviceKind !== "printer"} onToggle={(v) => setPrinter({ rip: p?.rip === v ? "" : v })} />
              {p?.rip === "기타" && (
                <TextField label="제공 RIP 직접입력" value={p?.ripOther ?? ""} disabled={locked || deviceKind !== "printer"} onChange={(v) => setPrinter({ ripOther: v })} placeholder="RIP 이름 입력" />
              )}
              <TextField label="헤드 종류" value={p?.headType ?? ""} disabled={locked || deviceKind !== "printer"} onChange={(v) => setPrinter({ headType: v })} placeholder="예: 리코 G5i 헤드" />
              <TextField label="헤드 수량" value={p?.headCount ?? ""} disabled={locked || deviceKind !== "printer"} onChange={(v) => setPrinter({ headCount: v })} placeholder="예: 3개" />
              <CheckGroup label="칼라 구성" options={RELEASE_OPTIONS.printerColors} selected={p?.colors ?? []} disabled={locked || deviceKind !== "printer"} onToggle={(v) => setPrinter({ colors: toggleArrayValue(p?.colors ?? [], v) })} />
              <TextField label="칼라 구성 직접입력" value={p?.colorsOther ?? ""} disabled={locked || deviceKind !== "printer"} onChange={(v) => setPrinter({ colorsOther: v })} placeholder="추가 칼라 항목(선택)" />
              <TextField label="잉크 종류" value={p?.inkType ?? ""} disabled={locked || deviceKind !== "printer"} onChange={(v) => setPrinter({ inkType: v })} />
              <TextField label="잉크 제공수량" value={p?.inkQty ?? ""} disabled={locked || deviceKind !== "printer"} onChange={(v) => setPrinter({ inkQty: v })} />
            </div>
          </div>
          {/* 커팅기 패널 */}
          <div className={`rounded-2xl border ${deviceKind === "cutter" ? "border-accent shadow-card" : "border-border opacity-60"}`}>
            <div className={`flex items-center justify-between rounded-t-2xl px-3 py-2.5 text-small font-bold ${deviceKind === "cutter" ? "bg-mint text-text" : "bg-surface-2 text-muted"}`}>커팅기 {deviceKind === "cutter" ? "· 선택됨" : ""}</div>
            <div className="flex flex-col gap-3 p-3">
              <CheckGroup label="제공 툴" options={RELEASE_OPTIONS.cutterTools} selected={c?.tools ?? []} disabled={locked || deviceKind !== "cutter"} onToggle={(v) => setCutter({ tools: toggleArrayValue(c?.tools ?? [], v) })} />
              <CheckGroup label="카메라" options={RELEASE_OPTIONS.cutterCamera} selected={c?.camera ?? []} disabled={locked || deviceKind !== "cutter"} onToggle={(v) => setCutter({ camera: toggleArrayValue(c?.camera ?? [], v) })} />
              <CheckGroup label="기타" options={RELEASE_OPTIONS.cutterExtras} selected={c?.extras ?? []} disabled={locked || deviceKind !== "cutter"} onToggle={(v) => setCutter({ extras: toggleArrayValue(c?.extras ?? [], v) })} />
            </div>
          </div>
        </div>
        {/* 공통 보조항목 */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="테스트용 소재" value={details.common.testMaterial} disabled={locked} onChange={(v) => setCommon({ testMaterial: v })} />
          <TextField label="기타 제공물품" value={details.common.otherSupplies} disabled={locked} onChange={(v) => setCommon({ otherSupplies: v })} placeholder="입력" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Check on={details.common.computerPrep} label="컴퓨터 업체 사전준비 요청" disabled={locked} onClick={() => setCommon({ computerPrep: !details.common.computerPrep })} />
          <Check on={details.common.dobi} label="도비 사용" disabled={locked} onClick={() => setCommon({ dobi: !details.common.dobi })} />
          <Check on={details.common.disassemble} label="장비 분해" disabled={locked} onClick={() => setCommon({ disassemble: !details.common.disassemble })} />
        </div>
      </section>

      {/* ③ 기본 준비사항 체크 */}
      <section>
        <SectionHead title="기본 준비사항 체크" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CheckGroup label="운송차량" options={RELEASE_OPTIONS.transport} selected={details.prep.transport} disabled={locked} onToggle={(v) => setPrep({ transport: toggleArrayValue(details.prep.transport, v) })} />
          <CheckGroup label="전기 관련 사전준비" auto options={RELEASE_OPTIONS.electrical} selected={details.prep.electrical} disabled={locked} onToggle={(v) => setPrep({ electrical: toggleArrayValue(details.prep.electrical, v) })} />
          <CheckGroup label="입고 관련 준비물" options={RELEASE_OPTIONS.inboundItems} selected={details.prep.inboundItems} disabled={locked} onToggle={(v) => setPrep({ inboundItems: toggleArrayValue(details.prep.inboundItems, v) })} />
          <CheckGroup label="기타 준비물" options={RELEASE_OPTIONS.otherPrep} selected={details.prep.otherPrep} disabled={locked} onToggle={(v) => setPrep({ otherPrep: toggleArrayValue(details.prep.otherPrep, v) })} />
        </div>
      </section>

      {/* ④ 설치 현장정보 */}
      <section>
        <SectionHead title="설치 현장정보" right={<span className="rounded-full bg-mint px-2 py-0.5 text-micro font-semibold text-accent">설치설문 자동 초안</span>} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><TextField label="장비 입고계획" value={details.site.inboundPlan} disabled={locked} onChange={(v) => setSite({ inboundPlan: v })} /></div>
          <TextField label="출입문 종류" value={details.site.doorType} disabled={locked} onChange={(v) => setSite({ doorType: v })} placeholder="예: 도어 / 창문" />
          <TextField label="출입문 크기" value={details.site.doorSize} disabled={locked} onChange={(v) => setSite({ doorSize: v })} />
          <TextField label="전원 연결" value={details.site.power} disabled={locked} onChange={(v) => setSite({ power: v })} />
          <TextField label="주차" value={details.site.parking} disabled={locked} onChange={(v) => setSite({ parking: v })} />
          <div className="rounded-xl border border-border bg-surface p-3">
            <Check on={details.site.blower.install} label="링블로워 설치" disabled={locked} onClick={() => setSite({ blower: { ...details.site.blower, install: !details.site.blower.install } })} />
            <input value={details.site.blower.note} disabled={locked} onChange={(e) => setSite({ blower: { ...details.site.blower, note: e.target.value } })} placeholder="메모" className="mt-2 w-full rounded-full border border-border bg-surface px-3 py-1.5 text-small outline-none focus:border-accent-ring disabled:opacity-50" />
          </div>
          <div className="rounded-xl border border-border bg-surface p-3">
            <Check on={details.site.compressor.install} label="컴프레서 설치" disabled={locked} onClick={() => setSite({ compressor: { ...details.site.compressor, install: !details.site.compressor.install } })} />
            <input value={details.site.compressor.note} disabled={locked} onChange={(e) => setSite({ compressor: { ...details.site.compressor, note: e.target.value } })} placeholder="메모" className="mt-2 w-full rounded-full border border-border bg-surface px-3 py-1.5 text-small outline-none focus:border-accent-ring disabled:opacity-50" />
          </div>
        </div>
      </section>

      {/* 액션 */}
      {!locked && (
        <div className="flex flex-col items-end gap-2">
          {/* 피드백을 버튼 옆에도 표시 — 긴 폼 하단에서 저장해도 보이게(상단 배너만이면 화면 밖). */}
          {error && <p className="text-small font-semibold text-coral-text" data-testid="release-feedback">{error}</p>}
          {notice && <p className="text-small font-semibold text-accent-2" data-testid="release-feedback">{notice}</p>}
          {!canIssue && (
            <p className="text-micro text-muted">
              {!hasIssuedQuote ? "발행하려면 먼저 견적을 발행해야 합니다." : "발행하려면 견적에 납품일정(설치일)을 입력해야 합니다."}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onSaveDraft} disabled={pending} className="rounded-full border border-border bg-surface px-5 py-2 text-small font-semibold text-text disabled:opacity-50" data-testid="release-save">
              임시저장
            </button>
            <button type="button" onClick={onIssue} disabled={pending || !canIssue} className="rounded-full bg-accent px-5 py-2 text-small font-semibold text-white disabled:opacity-50" data-testid="release-issue">
              발행 + PDF 생성
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
