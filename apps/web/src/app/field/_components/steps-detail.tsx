"use client";
import { useMemo, useState } from "react";
import { SERVICE_REPORT_LIMITS, sortFaultGroupsForKind } from "@jhtechsaas/shared";
import { AmountInput } from "@/app/admin/_components/AmountInput";
import type { ReportPayload } from "@/lib/service-reports/types";
import { PhotoCapture } from "./PhotoCapture";

// 3~6단계 — 고장분류(아코디언+검색)·조치·향후일정·부품.

interface StepProps {
  draft: ReportPayload;
  patch: (p: Partial<ReportPayload>) => void;
}

interface PhotoStepProps extends StepProps {
  reportId: string | null;
  // 사진은 리포트 폴더에 올리므로 id가 필요 — 없으면 먼저 draft 저장(id 획득).
  onNeedId: () => Promise<{ ok: boolean; id: string | null }>;
}

// 장비명으로 대분류 추정(목업 규칙) — 정렬 힌트일 뿐, 판정 실패 시 원 순서.
function guessKind(deviceName: string): "printer" | "cutter" | null {
  const m = deviceName.toUpperCase();
  if (/커팅|커터|컷|CUT/.test(m)) return "cutter";
  if (/프린터|PRINT|UV|솔벤트|전사/.test(m)) return "printer";
  return null;
}

export function Step3Fault({ draft, patch, reportId, onNeedId }: PhotoStepProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => sortFaultGroupsForKind(guessKind(draft.device_name)), [draft.device_name]);
  const q = query.trim().toLowerCase();

  function toggleFault(f: string) {
    const has = draft.faults.includes(f);
    if (!has && draft.faults.length >= SERVICE_REPORT_LIMITS.maxFaults) return;
    const nextFaults = has ? draft.faults.filter((x) => x !== f) : [...draft.faults, f];
    // 진단 프리픽스(F-J2): 최초 선택 시 타이핑 마찰 완화 — 이미 쓴 내용은 건드리지 않음.
    const prefix = nextFaults.length > 0 && !draft.diagnosis.trim() ? `[${nextFaults[0]}] ` : draft.diagnosis;
    patch({ faults: nextFaults, diagnosis: has ? draft.diagnosis : prefix });
  }

  return (
    <>
      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <h3 className="mb-2 text-small font-semibold text-muted">
          고장 분류 <span className="font-normal">— 복수 선택 · 장비 유형 순 정렬</span>
        </h3>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="증상 검색 — 예: 노즐, 밴딩, 칼날"
          aria-label="증상 검색"
          className="mb-3 w-full rounded-full border border-border bg-surface px-4 py-3 text-body text-text"
        />
        {draft.faults.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {draft.faults.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => toggleFault(f)}
                className="inline-flex min-h-9 items-center gap-1 rounded-full bg-accent px-3 py-1 text-small text-white"
              >
                {f} <span aria-hidden>✕</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {groups.map((g) => {
            const items = g.items.filter((i) => !q || i.toLowerCase().includes(q));
            if (q && items.length === 0) return null;
            const isOpen = q ? true : open.has(g.group);
            const count = g.items.filter((i) => draft.faults.includes(i)).length;
            return (
              <div key={g.group} className="overflow-hidden rounded-md border border-border">
                <button
                  type="button"
                  onClick={() =>
                    setOpen((cur) => {
                      const next = new Set(cur);
                      if (next.has(g.group)) next.delete(g.group);
                      else next.add(g.group);
                      return next;
                    })
                  }
                  className="flex min-h-11 w-full items-center gap-2 bg-surface px-3 py-2 text-left"
                >
                  <span className={`text-small transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
                  <span className="text-body font-semibold text-text">{g.group}</span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-muted">
                    {g.scope === "printer" ? "프린터" : g.scope === "cutter" ? "커팅기" : "공통"}
                  </span>
                  {count > 0 && (
                    <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-micro font-bold text-white">
                      {count}
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="border-t border-border">
                    {items.map((item) => {
                      const on = draft.faults.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleFault(item)}
                          className={`flex min-h-11 w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-body last:border-b-0 ${
                            on ? "bg-accent-soft" : "bg-surface"
                          }`}
                        >
                          <span
                            className={`flex size-5 items-center justify-center rounded border text-micro text-white ${
                              on ? "border-accent bg-accent" : "border-border"
                            }`}
                          >
                            {on ? "✓" : ""}
                          </span>
                          {item}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <h3 className="mb-2 text-small font-semibold text-muted">점검 내역 및 진단 *</h3>
        <textarea
          value={draft.diagnosis}
          onChange={(e) => patch({ diagnosis: e.target.value })}
          aria-label="점검 내역"
          placeholder="예) 출력 안 됨 접수 → 전원 24V OK. SSR 접촉부 접촉불량 확인."
          className="min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
        <PhotoSection
          slot="before"
          title="수리 전"
          paths={draft.photos_before}
          onPaths={(p) => patch({ photos_before: p })}
          reportId={reportId}
          onNeedId={onNeedId}
        />
      </div>
    </>
  );
}

export function Step4Action({ draft, patch, reportId, onNeedId }: PhotoStepProps) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-card">
      <h3 className="mb-2 text-small font-semibold text-muted">조치 및 수리 내역 *</h3>
      <textarea
        value={draft.action_text}
        onChange={(e) => patch({ action_text: e.target.value })}
        aria-label="조치 내역"
        placeholder="예) SSR 접촉부 재납땜 및 커넥터 교체, 출력 테스트 정상 확인."
        className="min-h-32 w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      />
      <PhotoSection
        slot="after"
        title="수리 후"
        paths={draft.photos_after}
        onPaths={(p) => patch({ photos_after: p })}
        reportId={reportId}
        onNeedId={onNeedId}
      />
    </div>
  );
}

// 사진 섹션 — 리포트 id가 아직 없으면(첫 저장 전) 먼저 저장하도록 안내 버튼.
function PhotoSection({
  slot,
  title,
  paths,
  onPaths,
  reportId,
  onNeedId,
}: {
  slot: "before" | "after";
  title: string;
  paths: string[];
  onPaths: (p: string[]) => void;
  reportId: string | null;
  onNeedId: () => Promise<{ ok: boolean; id: string | null }>;
}) {
  const [preparing, setPreparing] = useState(false);
  if (!reportId) {
    return (
      <button
        type="button"
        disabled={preparing}
        onClick={async () => {
          setPreparing(true);
          await onNeedId();
          setPreparing(false);
        }}
        className="mt-3 min-h-11 w-full rounded-md border-2 border-dashed border-border text-small text-muted"
      >
        {preparing ? "준비 중…" : `${title} 사진 추가 (탭하면 임시저장 후 활성화)`}
      </button>
    );
  }
  return (
    <PhotoCapture
      reportId={reportId}
      slot={slot}
      title={`${title} 사진`}
      initialPaths={paths}
      onPathsChange={onPaths}
    />
  );
}

export function Step5Follow({ draft, patch }: StepProps) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex rounded-full bg-surface-2 p-1">
        {(
          [
            { need: false, label: "조치 완료" },
            { need: true, label: "후속 조치 필요" },
          ] as const
        ).map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => patch({ follow_needed: t.need })}
            className={`min-h-11 flex-1 rounded-full text-small font-semibold ${
              draft.follow_needed === t.need ? "bg-accent text-white" : "text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {draft.follow_needed && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-small font-medium text-muted">
            예정 내용 *
            <input
              value={draft.follow_memo}
              onChange={(e) => patch({ follow_memo: e.target.value })}
              placeholder="예: 부품 수급 후 SSR 모듈 교체 예정"
              className="rounded-full border border-border bg-surface px-4 py-3 text-body text-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-small font-medium text-muted">
            예정일
            <input
              type="date"
              value={draft.follow_date}
              onChange={(e) => patch({ follow_date: e.target.value })}
              className="rounded-full border border-border bg-surface px-4 py-3 text-body text-text"
            />
          </label>
          <p className="text-small text-muted">
            확정 시 <b>후속 조치 대기</b> 건으로 등록되어 관리 화면에 남습니다. 연결된 A/S 신청은
            처리완료로 넘어가지 않습니다.
          </p>
        </div>
      )}
    </div>
  );
}

export function Step6Parts({ draft, patch }: StepProps) {
  function update(i: number, p: Partial<{ name: string; qty: number; price: number }>) {
    patch({ parts: draft.parts.map((row, idx) => (idx === i ? { ...row, ...p } : row)) });
  }
  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-card">
      <h3 className="mb-2 text-small font-semibold text-muted">교체 부품 — 없으면 그대로 다음</h3>
      <div className="flex flex-col gap-3">
        {draft.parts.map((p, i) => (
          <div key={i} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <label className="flex flex-1 flex-col gap-1 text-small font-medium text-muted">
                부품명
                <input
                  value={p.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="예: SSR 모듈"
                  className="rounded-full border border-border bg-surface px-4 py-3 text-body text-text"
                />
              </label>
              <button
                type="button"
                aria-label="부품 삭제"
                onClick={() => patch({ parts: draft.parts.filter((_, idx) => idx !== i) })}
                className="min-h-11 px-2 text-small text-danger underline"
              >
                삭제
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-small font-medium text-muted">
                수량
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(p.qty)}
                  onChange={(e) => update(i, { qty: Math.min(999, Number(e.target.value.replace(/\D/g, "")) || 0) })}
                  aria-label={`부품 ${i + 1} 수량`}
                  className="rounded-full border border-border bg-surface px-4 py-3 text-right font-mono text-body text-text"
                />
              </label>
              <label className="flex flex-col gap-1 text-small font-medium text-muted">
                단가 (원)
                <AmountInput
                  value={p.price}
                  onChange={(v) => update(i, { price: Number.isFinite(v) ? Math.min(v, 100000000) : 0 })}
                  aria-label={`부품 ${i + 1} 단가`}
                  className="rounded-full border border-border bg-surface px-4 py-3 text-right font-mono text-body text-text"
                />
              </label>
            </div>
            <p className="mt-2 text-right text-small text-muted">
              금액 <b className="font-mono text-text">{(p.qty * p.price).toLocaleString("ko-KR")}원</b>
            </p>
          </div>
        ))}
        {draft.parts.length < SERVICE_REPORT_LIMITS.maxParts && (
          <button
            type="button"
            onClick={() => patch({ parts: [...draft.parts, { name: "", qty: 1, price: 0 }] })}
            className="min-h-12 rounded-md border-2 border-dashed border-border text-body font-semibold text-accent"
          >
            + 부품 추가
          </button>
        )}
      </div>
    </div>
  );
}
