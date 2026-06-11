"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useListParams } from "./useListParams";

// 툴바 — 통합 검색(300ms 디바운스 + `/` 단축키) + 지역/담당영업 Select + 필터 초기화.
export function CustomerToolbar({
  regions,
  staff,
}: {
  regions: string[];
  staff: { id: string; name: string }[];
}) {
  const { params, setParams } = useListParams();
  const [q, setQ] = useState(params.q ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL이 외부에서 바뀐 경우(뒤로가기 등) 입력값 동기화 — 렌더 중 prop 변화 조정(React 권장 패턴)
  const [seenQ, setSeenQ] = useState(params.q ?? "");
  if ((params.q ?? "") !== seenQ) {
    setSeenQ(params.q ?? "");
    setQ(params.q ?? "");
  }

  // `/` 단축키 — 입력 중이 아닐 때만 검색창 포커스
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onSearchChange(v: string) {
    setQ(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setParams({ q: v.trim() || undefined }, "replace");
    }, 300);
  }

  const hasFilter = Boolean(params.q || params.region || params.sales || params.quick !== "all");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 basis-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="업체명, 사업자번호, 대표자, 연락처, 장부번호 통합 검색"
          aria-label="고객 통합 검색"
          className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-10 text-body text-text placeholder:text-muted/50"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-surface-2 px-1.5 text-micro text-muted">
          /
        </kbd>
      </div>
      <select
        value={params.region ?? ""}
        onChange={(e) => setParams({ region: e.target.value || undefined })}
        aria-label="지역 필터"
        className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      >
        <option value="">지역 전체</option>
        {regions.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <select
        value={params.sales ?? ""}
        onChange={(e) => setParams({ sales: e.target.value || undefined })}
        aria-label="담당영업 필터"
        className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      >
        <option value="">담당영업 전체</option>
        <option value="none">미배정</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {hasFilter && (
        <button
          type="button"
          onClick={() => { setQ(""); setParams({ q: undefined, region: undefined, sales: undefined, quick: "all" }); }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-small font-medium text-muted hover:text-text"
        >
          필터 초기화 <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
