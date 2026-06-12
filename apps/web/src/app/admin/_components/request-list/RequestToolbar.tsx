"use client";
import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

// 신청 목록 공용 툴바 — 고객목록 CustomerToolbar와 동일한 시각 패턴
// (검색 인풋 + `/` 단축키 + 상태/담당 Select + 필터 초기화). 필터링은 부모가 클라에서 수행.

export function RequestToolbar({
  q,
  onQ,
  placeholder,
  statusOptions,
  status,
  onStatus,
  assignee,
  onAssignee,
  hasFilter,
  onReset,
}: {
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  statusOptions: { value: string; label: string }[];
  status: string; // "all" | status
  onStatus: (v: string) => void;
  assignee: "all" | "none";
  onAssignee: (v: "all" | "none") => void;
  hasFilter: boolean;
  onReset: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // `/` 단축키 — 입력 중이 아닐 때만 검색창 포커스(고객목록과 동일 UX)
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 basis-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder={placeholder}
          aria-label="통합 검색"
          className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-10 text-body text-text placeholder:text-muted/50"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-surface-2 px-1.5 text-micro text-muted">
          /
        </kbd>
      </div>
      <select
        value={status}
        onChange={(e) => onStatus(e.target.value)}
        aria-label="상태 필터"
        className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      >
        <option value="all">상태 전체</option>
        {statusOptions.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <select
        value={assignee}
        onChange={(e) => onAssignee(e.target.value as "all" | "none")}
        aria-label="담당 필터"
        className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      >
        <option value="all">담당 전체</option>
        <option value="none">미배정</option>
      </select>
      {hasFilter && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-small font-medium text-muted hover:text-text"
        >
          필터 초기화 <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
