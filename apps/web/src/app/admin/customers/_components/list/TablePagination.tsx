"use client";
import { pageWindow } from "@/lib/customers/list-table";
import { useListParams } from "./useListParams";

// 테이블 푸터 — 범위 표기 + 페이지 윈도(‹ 1 … 6 7 8 … 31 ›) + 페이지당 건수.
export function TablePagination({ total }: { total: number }) {
  const { params, setParams } = useListParams();
  const totalPages = Math.max(1, Math.ceil(total / params.pp));
  const page = Math.min(params.page, totalPages);
  const from = total === 0 ? 0 : (page - 1) * params.pp + 1;
  const to = Math.min(page * params.pp, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-1 pt-3">
      <span className="font-mono text-small tabular-nums text-muted">
        {from.toLocaleString()}–{to.toLocaleString()} / 총 {total.toLocaleString()}건
      </span>
      <nav aria-label="페이지" className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setParams({ page: page - 1 })}
          disabled={page <= 1}
          aria-label="이전 페이지"
          className="rounded-md px-2 py-1 text-small text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          ‹
        </button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-small text-muted">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => setParams({ page: p })}
              aria-current={p === page ? "page" : undefined}
              className={`min-w-7 rounded-md px-2 py-1 font-mono text-small tabular-nums ${
                p === page ? "bg-accent font-semibold text-white" : "text-text hover:bg-surface-2"
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => setParams({ page: page + 1 })}
          disabled={page >= totalPages}
          aria-label="다음 페이지"
          className="rounded-md px-2 py-1 text-small text-muted hover:bg-surface-2 disabled:opacity-40"
        >
          ›
        </button>
      </nav>
      <label className="flex items-center gap-1.5 text-small text-muted">
        페이지당
        <select
          value={params.pp}
          onChange={(e) => setParams({ pp: Number(e.target.value) })}
          className="rounded-md border border-border bg-surface px-2 py-1 text-small text-text"
        >
          {[25, 50, 100].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
