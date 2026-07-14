"use client";
import { useState, useTransition } from "react";
import type { ReleaseOrderDetails } from "@jhtechsaas/shared";
import { RELEASE_OPTIONS, normalizeDetailsForKind, toggleArrayValue } from "@/lib/release-orders/form";
import { deriveSameAsHq } from "@/lib/customers/install-address";
import { getReleaseOrderVersionPdfUrl, issueReleaseOrderAction, saveReleaseOrderAction } from "@/lib/release-orders/actions";
import type { ReleaseOrderVersion } from "@/lib/release-orders/queries";
import { formatDateMask, parseDeliveryDate } from "@/lib/quotes/delivery-date";
import { ReleaseOrderPdfButton } from "./ReleaseOrderPdfButton";

type DeviceKind = "printer" | "cutter";

// 폼 초기값 — 견적/의뢰/기존 출고의뢰서에서 채운 값. 모든 항목을 담당자가 직접 수정할 수 있다.
type Initial = {
  company: string;
  deviceName: string;
  contactPhone: string;
  hqAddress: string;
  installAddress: string;
  installDate: string; // 'YYYY-MM-DD' (없으면 빈칸)
  installTime: string; // 'HH:mm' (없으면 빈칸)
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
// note를 주면 박스 맨 아래에 특이사항 한 줄 입력이 붙는다(mt-auto로 하단 고정 —
// 부모 grid의 auto-rows-fr과 함께 4박스 등높이 + 특이사항 줄맞춤).
function CheckGroup({
  label,
  options,
  selected,
  onToggle,
  disabled,
  auto,
  note,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
  disabled?: boolean;
  auto?: boolean;
  note?: { value: string; onChange: (v: string) => void };
}) {
  return (
    <div className={`flex h-full flex-col rounded-xl border border-border p-3 ${auto ? "bg-mint/40" : "bg-surface"}`}>
      <div className="mb-2 text-small font-semibold text-text">
        {label}
        {auto && <span className="ml-1.5 rounded-full bg-mint px-1.5 py-0.5 text-micro font-semibold text-accent">설문 연동</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Check key={o} on={selected.includes(o)} label={o} onClick={() => onToggle(o)} disabled={disabled} />
        ))}
      </div>
      {note && (
        <div className="mt-auto flex items-center gap-1.5 pt-2.5">
          <span className="shrink-0 text-micro font-semibold text-muted">특이사항</span>
          <input
            aria-label={`${label} 특이사항`}
            value={note.value}
            onChange={(e) => note.onChange(e.target.value)}
            disabled={disabled}
            maxLength={500}
            placeholder="특이사항 입력"
            className="w-full rounded-full border border-border bg-surface px-3 py-1.5 text-small text-text outline-none focus:border-accent-ring disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
}

// 자유입력 텍스트 필드.
function TextField({ label, value, onChange, disabled, placeholder }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-micro text-muted">{label}</label>
      <input
        aria-label={label}
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
  initial,
  hasIssuedQuote,
  initialDeviceKind,
  initialDetails,
  releaseOrder,
  pdfReady,
  versions,
}: {
  applicationId: string;
  initial: Initial;
  hasIssuedQuote: boolean;
  initialDeviceKind: DeviceKind;
  initialDetails: ReleaseOrderDetails;
  releaseOrder: { id: string; status: "draft" | "issued"; version: number } | null;
  pdfReady: boolean;
  versions: ReleaseOrderVersion[];
}) {
  // 버전관리: 발행본도 폼은 편집 가능(저장 시 새 버전이 생성됨). 잠금 없음.
  const locked = false;
  const isIssued = releaseOrder?.status === "issued";
  const currentVersion = releaseOrder?.version ?? null;
  const [deviceKind, setDeviceKind] = useState<DeviceKind>(initialDeviceKind);
  const [details, setDetails] = useState<ReleaseOrderDetails>(() => normalizeDetailsForKind(initialDetails, initialDeviceKind));
  // 편집 가능 항목 — 프리필로 시작, 담당자가 모두 직접 수정. 저장 시 출고의뢰서에 보존.
  const [company, setCompany] = useState(initial.company);
  const [deviceName, setDeviceName] = useState(initial.deviceName);
  const [contactPhone, setContactPhone] = useState(initial.contactPhone);
  const [hqAddress, setHqAddress] = useState(initial.hqAddress);
  const [installAddress, setInstallAddress] = useState(initial.installAddress);
  // 설치주소 "본사와 동일" — 체크 중이면 본사주소를 설치주소에 동기화(설치 입력 비활성).
  // effect 대신 핸들러에서 동기화(set-state-in-effect 회피).
  const [sameAsHq, setSameAsHq] = useState(deriveSameAsHq(initial.hqAddress, initial.installAddress));
  function changeHq(v: string) {
    setHqAddress(v);
    if (sameAsHq) setInstallAddress(v);
  }
  function toggleSameAsHq(on: boolean) {
    setSameAsHq(on);
    if (on) setInstallAddress(hqAddress);
  }
  // 설치 일시 — 날짜는 한 칸 마스크 입력(YYYY-MM-DD 자동 포맷), 시각은 time 입력.
  const [installDate, setInstallDate] = useState(formatDateMask(initial.installDate));
  const [installTime, setInstallTime] = useState(initial.installTime);
  // 체크 시 수정한 고객정보를 고객관리 레코드(연결 고객)에도 반영.
  const [reflectToCustomer, setReflectToCustomer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 설치일 검증 — 8자리 다 친 뒤 잘못된 날짜만 에러. 빈 값 허용(미정).
  const { iso: installDateIso, error: installDateError } = parseDeliveryDate(installDate);
  const installRawLen = installDate.replace(/\D/g, "").length;
  const showInstallError = !!installDateError && installRawLen >= 8;

  // 발행 전제(I1) 미러 — 견적·설치일 없으면 발행 불가(서버 RPC가 최종 강제).
  const canIssue = hasIssuedQuote && !!installDateIso;

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
    const res = await saveReleaseOrderAction(
      applicationId,
      deviceKind,
      normalized,
      {
        company,
        contactPhone,
        hqAddress,
        installAddress,
        deviceName,
        installDate: installDateIso, // 검증된 ISO(YYYY-MM-DD) 또는 null
        installTime: installDateIso ? installTime || null : null,
      },
      reflectToCustomer,
    );
    if ("error" in res) {
      setError(res.error);
      return null;
    }
    if (res.notice) setNotice(res.notice); // 고객 반영 결과 안내
    return res.id;
  }

  function onSaveDraft() {
    if (locked) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const id = await save();
      if (id && !reflectToCustomer) setNotice("임시저장되었습니다.");
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
      {/* 발행본이 최신이면: 수정 시 새 버전 안내 + 최신 PDF 다운로드. */}
      {isIssued && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-ring/40 bg-mint px-4 py-3 text-small text-accent-2">
          <span>발행됨 (V{currentVersion}). 내용을 수정해 저장하면 새 버전으로 발행됩니다.</span>
          <ReleaseOrderPdfButton applicationId={applicationId} initialReady={pdfReady} />
        </div>
      )}
      {/* 버전 이력 — 2개 이상일 때 표시. 각 발행본 PDF 다운로드. */}
      {versions.length > 1 && <VersionHistory versions={versions} currentId={releaseOrder?.id ?? null} />}
      {error && <div className="rounded-xl border border-coral/40 bg-coral-soft px-4 py-3 text-small text-coral-text">{error}</div>}
      {notice && <div className="rounded-xl border border-accent-ring/40 bg-mint px-4 py-3 text-small text-accent-2">{notice}</div>}

      {/* ① 고객정보 — 모든 항목 자동채움 후 직접 수정 가능(설치 일시 포함). */}
      <section>
        <SectionHead title="고객정보" en="CUSTOMER INFORMATION" />
        <p className="mb-2 text-micro text-muted">견적·의뢰에서 자동으로 채워지며 모든 항목을 직접 수정할 수 있습니다. 설치 일시(납품일)는 여기서 입력합니다.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField label="회사/고객명" value={company} onChange={setCompany} disabled={locked} placeholder="회사/고객명" />
          <TextField label="장비명" value={deviceName} onChange={setDeviceName} disabled={locked} placeholder="장비명" />
          <TextField label="전화번호" value={contactPhone} onChange={setContactPhone} disabled={locked} placeholder="연락처" />
          {/* 설치 일시 — 날짜 마스크 + 시각(날짜 없으면 시각 비활성). */}
          <div>
            <label className="mb-1 block text-micro text-muted">설치 일시 (납품일)</label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                aria-label="설치일"
                placeholder="YYYY-MM-DD"
                value={installDate}
                maxLength={10}
                onChange={(e) => setInstallDate(formatDateMask(e.target.value))}
                disabled={locked}
                className="min-w-0 flex-1 rounded-full border border-border bg-surface px-3 py-2 text-small tabular-nums text-text outline-none focus:border-accent-ring disabled:opacity-50"
              />
              <input
                type="time"
                aria-label="설치 시각"
                value={installTime}
                step={900}
                onChange={(e) => setInstallTime(e.target.value)}
                disabled={locked || installDateIso === null}
                className="w-[7.5rem] shrink-0 rounded-full border border-border bg-surface px-3 py-2 text-small tabular-nums text-text outline-none focus:border-accent-ring disabled:opacity-50"
              />
            </div>
            {showInstallError && <p className="mt-1 text-micro text-coral-text">{installDateError}</p>}
          </div>
          <div className="sm:col-span-2">
            <TextField label="본사주소" value={hqAddress} onChange={changeHq} disabled={locked} placeholder="본사주소" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <TextField label="설치 주소" value={installAddress} onChange={setInstallAddress} disabled={locked || sameAsHq} placeholder="설치 주소" />
            <label className="flex items-center gap-2 text-small text-text">
              <input type="checkbox" checked={sameAsHq} onChange={(e) => toggleSameAsHq(e.target.checked)} disabled={locked} className="size-4 accent-accent" />
              <span>설치주소가 본사주소와 동일</span>
            </label>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-small text-text sm:col-span-1">
            <input type="checkbox" checked={reflectToCustomer} onChange={(e) => setReflectToCustomer(e.target.checked)} disabled={locked} className="size-4 accent-accent" />
            <span>수정한 고객정보를 고객관리에도 반영</span>
          </label>
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

      {/* ③ 기본 준비사항 체크 — auto-rows-fr로 4박스 등높이(가장 높은 박스 기준), 특이사항은 각 박스 하단 고정 */}
      <section>
        <SectionHead title="기본 준비사항 체크" />
        <div className="grid grid-cols-1 gap-3 sm:auto-rows-fr sm:grid-cols-2">
          <CheckGroup label="운송차량" options={RELEASE_OPTIONS.transport} selected={details.prep.transport} disabled={locked} onToggle={(v) => setPrep({ transport: toggleArrayValue(details.prep.transport, v) })} note={{ value: details.prep.transportNote, onChange: (v) => setPrep({ transportNote: v }) }} />
          <CheckGroup label="전기 관련 사전준비" auto options={RELEASE_OPTIONS.electrical} selected={details.prep.electrical} disabled={locked} onToggle={(v) => setPrep({ electrical: toggleArrayValue(details.prep.electrical, v) })} note={{ value: details.prep.electricalNote, onChange: (v) => setPrep({ electricalNote: v }) }} />
          <CheckGroup label="입고 관련 준비물" options={RELEASE_OPTIONS.inboundItems} selected={details.prep.inboundItems} disabled={locked} onToggle={(v) => setPrep({ inboundItems: toggleArrayValue(details.prep.inboundItems, v) })} note={{ value: details.prep.inboundNote, onChange: (v) => setPrep({ inboundNote: v }) }} />
          <CheckGroup label="기타 준비물" options={RELEASE_OPTIONS.otherPrep} selected={details.prep.otherPrep} disabled={locked} onToggle={(v) => setPrep({ otherPrep: toggleArrayValue(details.prep.otherPrep, v) })} note={{ value: details.prep.otherPrepNote, onChange: (v) => setPrep({ otherPrepNote: v }) }} />
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

      {/* ⑤ 메모/특이사항 — PDF 하단에 인쇄(현장 전달용). */}
      <section>
        <SectionHead title="메모/특이사항" en="MEMO" />
        <textarea
          aria-label="메모/특이사항"
          value={details.memo}
          disabled={locked}
          onChange={(e) => setDetails((d) => ({ ...d, memo: e.target.value }))}
          rows={3}
          placeholder="현장에 전달할 특이사항·요청을 적으세요 (출고의뢰서 PDF에 인쇄됩니다)"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-small text-text outline-none focus:border-accent-ring disabled:opacity-50"
        />
      </section>

      {/* 액션 */}
      {!locked && (
        <div className="flex flex-col items-end gap-2">
          {/* 피드백을 버튼 옆에도 표시 — 긴 폼 하단에서 저장해도 보이게(상단 배너만이면 화면 밖). */}
          {error && <p className="text-small font-semibold text-coral-text" data-testid="release-feedback">{error}</p>}
          {notice && <p className="text-small font-semibold text-accent-2" data-testid="release-feedback">{notice}</p>}
          {!canIssue && (
            <p className="text-micro text-muted">
              {!hasIssuedQuote ? "발행하려면 먼저 견적을 발행해야 합니다." : "발행하려면 설치 일시(납품일)를 입력해야 합니다."}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onSaveDraft} disabled={pending} className="rounded-full border border-border bg-surface px-5 py-2 text-small font-semibold text-text disabled:opacity-50" data-testid="release-save">
              {isIssued ? "수정 임시저장(새 버전)" : "임시저장"}
            </button>
            <button type="button" onClick={onIssue} disabled={pending || !canIssue} className="rounded-full bg-accent px-5 py-2 text-small font-semibold text-white disabled:opacity-50" data-testid="release-issue">
              {isIssued ? "새 버전 발행 + PDF" : "발행 + PDF 생성"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 버전 이력 — 각 버전의 상태·생성/발행일. 발행본은 PDF 다운로드(서명URL on-demand).
function VersionHistory({ versions, currentId }: { versions: ReleaseOrderVersion[]; currentId: string | null }) {
  const [pending, startTransition] = useTransition();
  function openPdf(id: string) {
    startTransition(async () => {
      const url = await getReleaseOrderVersionPdfUrl(id);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
  }
  return (
    <section className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 text-small font-semibold text-text">버전 이력</div>
      <ul className="flex flex-col gap-1.5">
        {versions.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 text-small">
            <span className="font-semibold text-text">V{v.version}</span>
            {v.id === currentId && <span className="rounded-full bg-mint px-1.5 py-0.5 text-micro font-semibold text-accent">최신</span>}
            <span className={`rounded-full px-1.5 py-0.5 text-micro font-semibold ${v.status === "issued" ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted"}`}>
              {v.status === "issued" ? "발행" : "임시저장"}
            </span>
            <span className="text-micro text-muted">{(v.issuedAt ?? v.createdAt)?.slice(0, 10)}</span>
            {v.hasPdf && (
              <button type="button" onClick={() => openPdf(v.id)} disabled={pending} className="ml-auto text-micro font-semibold text-accent hover:underline disabled:opacity-50">
                PDF 다운로드
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
