"use client";
import { useRef, useState, useTransition } from "react";
import { searchCustomersForQuoteAction } from "@/lib/quotes/actions";
import type { QuoteCustomer } from "@/lib/quotes/customer-search";

// 수기 견적 — 기존 고객 검색·선택. 선택 시 부모(ManualQuoteForm)가 회사 필드 프리필 + companyId 연결.
// 검색은 Enter/버튼으로 실행(서버 액션 호출). 최대 20건 표시.
export function CustomerPicker({
  onSelect,
  disabled,
}: {
  onSelect: (c: QuoteCustomer) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<QuoteCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  function run() {
    const query = q.trim();
    if (!query) {
      setResults(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await searchCustomersForQuoteAction(query);
      if ("error" in res) {
        setError(res.error);
        setResults([]);
        return;
      }
      setResults(res);
    });
  }

  return (
    <div ref={boxRef} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          aria-label="고객 검색"
          placeholder="기존 고객 검색 (상호·대표자·사업자번호·연락처)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
          disabled={disabled || pending}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-body text-text"
        />
        <button
          type="button"
          onClick={run}
          disabled={disabled || pending}
          className="shrink-0 rounded-md bg-surface-2 px-3 py-1 text-small font-medium text-text disabled:opacity-50"
        >
          {pending ? "검색중…" : "검색"}
        </button>
      </div>
      {error && <p className="text-small text-danger">{error}</p>}
      {results && results.length === 0 && !pending && (
        <p className="text-small text-muted">검색 결과가 없습니다.</p>
      )}
      {results && results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(c);
                  setResults(null);
                  setQ("");
                }}
                className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
              >
                <span className="text-body font-medium text-text">{c.name}</span>
                <span className="text-small text-muted">
                  {[c.ceo, c.phone, c.bizNo].filter(Boolean).join(" · ") || "정보 없음"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
