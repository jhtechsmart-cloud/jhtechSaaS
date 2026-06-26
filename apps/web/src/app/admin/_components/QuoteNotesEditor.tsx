"use client";

// 견적서 특기사항 에디터 — 여러 줄 자유 편집(줄 추가·삭제·수정). 견적별로 저장돼 PDF 하단에 출력.
// 기본 2줄(부가세 별도·유효기간)은 폼이 프리필해 넘긴다(@jhtechsaas/shared DEFAULT_QUOTE_NOTES).
export function QuoteNotesEditor({
  notes,
  setNotes,
  disabled,
}: {
  notes: string[];
  setNotes: (n: string[]) => void;
  disabled: boolean;
}) {
  function update(i: number, value: string) {
    setNotes(notes.map((n, idx) => (idx === i ? value : n)));
  }
  return (
    <section className="rounded-md border border-border border-l-4 border-l-accent bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-h2 font-medium text-text">특기사항</h2>
        <span className="text-micro text-muted">견적서 하단에 줄 단위로 출력</span>
      </div>
      <div className="flex flex-col gap-2">
        {notes.map((n, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-small text-muted">{i + 1}.</span>
            <input
              aria-label={`특기사항 ${i + 1}`}
              value={n}
              onChange={(e) => update(i, e.target.value)}
              disabled={disabled}
              placeholder="특기사항 내용"
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-body text-text"
            />
            <button
              type="button"
              aria-label="특기사항 줄 삭제"
              onClick={() => setNotes(notes.filter((_, idx) => idx !== i))}
              disabled={disabled}
              className="px-2 text-muted hover:text-danger"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setNotes([...notes, ""])}
          disabled={disabled}
          className="self-start text-small font-medium text-accent hover:underline"
        >
          + 특기사항 추가
        </button>
      </div>
    </section>
  );
}
