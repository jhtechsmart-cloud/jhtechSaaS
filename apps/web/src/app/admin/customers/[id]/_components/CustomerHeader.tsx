import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatBizNo } from "@jhtechsaas/shared";
import { Building2 } from "lucide-react";
import { displayValue } from "@/lib/customers/detail-display";
import { CopyBizNoButton } from "./CopyBizNoButton";
import { CustomerKpiStrip, type KpiCell } from "./CustomerKpiStrip";

// 페이지 헤더(전체 폭) — 아바타+업체명+거래상태, 메타 행(대표/사업자번호+복사/담당영업/장부번호),
// 우측 액션(견적 작성·수정), 하단 KPI 스트립(탭 동기화).

function Meta({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  const v = displayValue(value);
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-small text-muted">{label}</span>
      {v ? (
        <span className={`text-small font-bold text-text ${mono ? "font-mono tabular-nums" : ""}`}>{v}</span>
      ) : (
        <span className="text-small text-empty">미입력</span>
      )}
    </span>
  );
}

export function CustomerHeader({
  id,
  name,
  ceo,
  bizNo,
  assigneeName,
  ledgerNo,
  tradeStatus,
  kpiCells,
}: {
  id: string;
  name: string;
  ceo: string | null;
  bizNo: string | null;
  assigneeName: string;
  ledgerNo: number | null;
  tradeStatus: "거래중" | "신규";
  kpiCells: KpiCell[];
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-4">
          {/* 회사 아이콘(52px, 각진 라운드 — 단색 SVG) */}
          <span
            aria-hidden
            className="flex size-[52px] shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"
          >
            <Building2 className="size-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-keep text-2xl font-bold leading-tight text-text">{name}</h1>
              <Badge variant={tradeStatus === "거래중" ? "default" : "secondary"}>{tradeStatus}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Meta label="대표" value={ceo} />
              <span className="inline-flex items-center">
                <Meta label="사업자번호" value={bizNo ? formatBizNo(bizNo) : null} mono />
                {bizNo && <CopyBizNoButton bizNo={formatBizNo(bizNo)} />}
              </span>
              <Meta label="담당영업" value={assigneeName} />
              <Meta label="장부번호" value={ledgerNo != null ? String(ledgerNo) : null} mono />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {/* 내비게이션은 시맨틱상 link — buttonVariants로 버튼 외형만 차용(role=link 유지) */}
          <Link href="/admin/quotes/new" className={buttonVariants({ variant: "outline" })}>
            견적 작성
          </Link>
          <Link href={`/admin/customers/${id}/edit`} className={buttonVariants()}>수정</Link>
        </div>
      </div>
      <CustomerKpiStrip cells={kpiCells} />
    </Card>
  );
}
