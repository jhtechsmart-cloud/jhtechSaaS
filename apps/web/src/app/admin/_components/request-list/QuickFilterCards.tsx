"use client";
import { Card } from "@/components/ui/card";

// 신청 목록 공용 KPI 빠른 필터 카드 — 고객목록 CustomerKpiCards와 동일한 시각 패턴
// (카운트·하단 게이지 바·클릭=필터 토글). 카운트는 부모가 클라 집계해 내려준다.

export interface QuickCard {
  key: string;
  label: string;
  sub: string;
  gauge: string; // 하단 게이지 색
  count: number;
}

export function QuickFilterCards({
  cards,
  active,
  onSelect,
}: {
  cards: QuickCard[];
  active: string; // 활성 카드 key ("all" = 기본)
  onSelect: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 min-[860px]:grid-cols-4">
      {cards.map((c) => {
        const isActive = active === c.key && c.key !== "all";
        const toggle = () => onSelect(isActive || c.key === "all" ? "all" : c.key);
        return (
          <Card
            key={c.key}
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            onClick={toggle}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle();
              }
            }}
            className={`relative cursor-pointer gap-0 overflow-hidden px-4 pb-4 pt-3 shadow-card transition-colors hover:shadow-card-hover ${
              isActive ? "border-accent" : "border-border"
            }`}
          >
            <span className="text-small text-muted">{c.label}</span>
            <span className="font-mono text-[21px] font-bold tabular-nums leading-tight text-text">
              {c.count.toLocaleString("ko-KR")}
            </span>
            <span className="text-micro text-muted">{c.sub}</span>
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: c.gauge }} />
          </Card>
        );
      })}
    </div>
  );
}
