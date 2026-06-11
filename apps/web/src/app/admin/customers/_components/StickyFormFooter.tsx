// 하단 고정 저장 바 — 변경 요약(좌) + 취소/저장(우). blur 배경, 변경 없으면 저장 disabled.
export function StickyFormFooter({
  dirtyLabels,
  pending,
  saveLabel,
  onCancel,
  alwaysEnabled,
}: {
  dirtyLabels: string[];
  pending: boolean;
  saveLabel: string;
  onCancel: () => void;
  alwaysEnabled?: boolean; // 신규 등록 모드 — 변경 추적 없이 항상 저장 가능
}) {
  const n = dirtyLabels.length;
  const blocked = alwaysEnabled ? pending : n === 0 || pending;
  const summary =
    n === 0
      ? "변경사항 없음"
      : `${n}개 항목 변경됨 · ${dirtyLabels.slice(0, 3).join(", ")}${n > 3 ? ` 외 ${n - 3}` : ""}`;
  return (
    <div
      role="region"
      aria-label="저장"
      className="sticky bottom-0 z-20 -mx-1 mt-2 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/85 px-4 py-3 shadow-card backdrop-blur"
    >
      <span className={`text-small ${n > 0 ? "font-medium text-text" : "text-muted"}`} aria-live="polite">
        {summary}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={blocked}
          className="rounded-md border border-border px-3 py-2 text-small font-medium text-text disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={blocked}
          className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-50"
        >
          {pending ? "저장 중…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
