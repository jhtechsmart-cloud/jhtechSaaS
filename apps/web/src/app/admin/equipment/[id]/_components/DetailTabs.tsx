"use client";
import { useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// #243 상세 탭 — URL 쿼리(?tab=) 단일 원본. 파인 언더라인(탭) vs pill(필터) 시각 구분.
// ARIA tablist 계약: 방향키·Home/End 이동, aria-selected. 탭 전환 시 필터 쿼리는 보존.
const TABS = [
  { key: "overview", label: "개요" },
  { key: "history", label: "AS 이력" },
  { key: "stats", label: "통계" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function DetailTabs({ active }: { active: TabKey }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [, startTransition] = useTransition();

  function go(key: TabKey) {
    const p = new URLSearchParams(searchParams.toString());
    if (key === "overview") p.delete("tab");
    else p.set("tab", key);
    const qs = p.toString();
    startTransition(() => router.replace(qs ? `?${qs}` : "?", { scroll: false }));
  }

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    go(TABS[next].key);
  }

  return (
    <div role="tablist" aria-label="장비 상세 탭" className="flex gap-1 border-b border-border">
      {TABS.map((t, i) => {
        const selected = active === t.key;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={selected}
            aria-controls={`tabpanel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => go(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`-mb-px min-h-11 px-4 py-2.5 text-body font-semibold ${
              selected
                ? "border-b-2 border-accent text-accent"
                : "border-b-2 border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
