"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomerKpis } from "@/lib/customers/actions";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useListParams } from "./useListParams";
import type { CustomerListParams } from "@/lib/customers/list-table";

// KPI 빠른 필터 카드 4개 — 클릭=quick 필터 토글(활성 하이라이트). 카운트는 60초 캐시.
// 게이지 색 — 파인/틸/라임/코랄 순환(테마 스펙)
const CARDS: { key: Exclude<CustomerListParams["quick"], "all"> | "all"; label: string; sub: string; gauge: string }[] = [
  { key: "all", label: "전체 고객", sub: "등록된 거래처", gauge: "#176455" },
  { key: "trading", label: "거래중", sub: "장비 보유", gauge: "#34B8A5" },
  { key: "unassigned", label: "담당영업 미배정", sub: "배정 필요", gauge: "#D3E478" },
  { key: "recent", label: "최근 30일 활동", sub: "견적·A/S·소모품", gauge: "#E98668" },
];

export function CustomerKpiCards() {
  const { params, setParams } = useListParams();
  const { data, isPending } = useQuery({
    queryKey: ["customer-kpis"],
    queryFn: () => fetchCustomerKpis(),
    staleTime: 60_000,
  });
  const counts: Record<string, number | undefined> = {
    all: data?.total, trading: data?.trading, unassigned: data?.unassigned, recent: data?.recent,
  };
  return (
    <div className="grid grid-cols-2 gap-3 min-[860px]:grid-cols-4">
      {CARDS.map((c) => {
        const active = params.quick === c.key && c.key !== "all";
        const isAllActive = c.key === "all" && params.quick === "all";
        return (
          <Card
            key={c.key}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            onClick={() => setParams({ quick: active || c.key === "all" ? "all" : c.key })}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setParams({ quick: active || c.key === "all" ? "all" : c.key }); } }}
            className={`relative cursor-pointer gap-0 overflow-hidden px-4 pb-4 pt-3 shadow-card transition-colors hover:shadow-card-hover ${
              active ? "border-accent" : isAllActive ? "border-border" : "border-border"
            }`}
          >
            <span className="text-small text-muted">{c.label}</span>
            {isPending ? (
              <Skeleton className="mt-1 h-6 w-14" />
            ) : (
              <span className="font-mono text-[21px] font-bold tabular-nums leading-tight text-text">
                {(counts[c.key] ?? 0).toLocaleString("ko-KR")}
              </span>
            )}
            <span className="text-micro text-muted">{c.sub}</span>
            {/* 하단 4px 게이지 바 */}
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: c.gauge }} />
          </Card>
        );
      })}
    </div>
  );
}
