"use client";
import { useRouter, useSearchParams } from "next/navigation";

// 헤더 하단 KPI 스트립 — 4등분, 클릭 시 우측 거래 활동 탭 활성화(?tab= 동기화).
// 활성 셀 = border-bottom 3px primary + 연한 primary 배경.

export type ActivityTabKey = "quotes" | "equipment" | "as" | "supply";
export const DEFAULT_TAB: ActivityTabKey = "quotes";

export function activeTabFrom(param: string | null): ActivityTabKey {
  return param === "equipment" || param === "as" || param === "supply" ? param : DEFAULT_TAB;
}

export type KpiCell = {
  key: ActivityTabKey;
  label: string;
  count: number;
  sub: string | null; // 보조정보(완료 N건, 최근 구입일 등)
};

export function CustomerKpiStrip({ cells }: { cells: KpiCell[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = activeTabFrom(searchParams.get("tab"));

  function select(key: ActivityTabKey) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", key);
    router.replace(`?${sp.toString()}`, { scroll: false });
  }

  return (
    <div className="grid grid-cols-2 border-t border-border lg:grid-cols-4">
      {cells.map((cell) => {
        const isActive = cell.key === active;
        return (
          <button
            key={cell.key}
            type="button"
            onClick={() => select(cell.key)}
            aria-pressed={isActive}
            className={`flex flex-col items-start gap-0.5 border-b-[3px] px-4 py-3 text-left transition-colors ${
              isActive
                ? "border-b-accent bg-accent-soft/55"
                : "border-b-transparent hover:bg-surface-2"
            }`}
          >
            <span className="text-small text-muted">{cell.label}</span>
            <span className="font-mono text-[21px] font-bold tabular-nums leading-none text-text">
              {cell.count}
            </span>
            <span className="text-micro text-muted">{cell.sub ?? " "}</span>
          </button>
        );
      })}
    </div>
  );
}
