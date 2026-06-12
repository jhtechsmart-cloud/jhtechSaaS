"use client";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchCustomers } from "@/lib/customers/actions";
import type { CustomerListRow } from "@/lib/customers/queries";
import { relativeTime, highlightParts, type CustomerListParams } from "@/lib/customers/list-table";
import { formatBizNo } from "@jhtechsaas/shared";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useListParams } from "./useListParams";
import { TablePagination } from "./TablePagination";

// 데이터 테이블 — 서버사이드 페이지(50건)만 수신, keepPreviousData로 전환 깜빡임 방지.
// thead sticky + 내부 스크롤, 정렬 가능(업체명·지역·최근활동), 행 클릭=상세, 검색어 <mark>.

function Mark({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlightParts(text, q).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-sm bg-amber-100 px-0 text-inherit">{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function SortHeader({
  label,
  col,
  className,
}: {
  label: string;
  col: CustomerListParams["sort"];
  className?: string;
}) {
  const { params, setParams } = useListParams();
  const active = params.sort === col;
  const nextDir = active && params.dir === (col === "name" ? "asc" : "desc")
    ? (col === "name" ? "desc" : "asc")
    : (col === "name" ? "asc" : "desc");
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => setParams({ sort: col, dir: nextDir })}
        className={`inline-flex items-center gap-1 ${active ? "font-semibold text-text" : "text-muted hover:text-text"}`}
      >
        {label}
        <span aria-hidden className="text-micro">{active ? (params.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </TableHead>
  );
}

export function CustomerTable({ hasAnyCustomer }: { hasAnyCustomer: boolean }) {
  const router = useRouter();
  const { params, setParams } = useListParams();
  const q = params.q ?? "";

  const { data, isPending, isFetching } = useQuery({
    queryKey: ["customers", params],
    queryFn: () => fetchCustomers(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const now = new Date();

  // 첫 사용(고객 0건 + 필터 없음) — 온보딩 빈 상태
  const hasFilter = Boolean(params.q || params.region || params.sales || params.quick !== "all");
  if (!hasAnyCustomer && !hasFilter && !isPending && total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface p-10">
        <p className="text-body font-medium text-text">등록된 고객이 없습니다</p>
        <p className="text-small text-muted">직접 입력하거나 기존 견적요청에서 가져오세요</p>
        <div className="flex gap-2">
          <Link href="/admin/customers/new?mode=direct" className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white">직접 입력</Link>
          <Link href="/admin/customers/new?mode=import" className="rounded-md border border-accent px-4 py-2 text-body font-medium text-accent">견적요청에서 가져오기</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${isFetching && !isPending ? "opacity-80" : ""}`}>
      <div className="max-h-[62vh] overflow-auto rounded-lg border border-border bg-surface shadow-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface">
            <TableRow>
              <SortHeader label="업체명" col="name" className="min-w-56" />
              <TableHead className="min-w-28">대표/담당자</TableHead>
              <TableHead className="min-w-32">연락처</TableHead>
              <SortHeader label="지역" col="region" className="w-20" />
              <TableHead className="min-w-24">담당영업</TableHead>
              <TableHead className="min-w-40">거래현황</TableHead>
              <SortHeader label="최근 활동" col="last" className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center gap-2 py-10">
                    <p className="text-body text-text">검색 결과가 없습니다</p>
                    <button
                      type="button"
                      onClick={() => setParams({ q: undefined, region: undefined, sales: undefined, quick: "all" })}
                      className="text-small text-accent underline"
                    >
                      필터 초기화
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => <Row key={r.id} r={r} q={q} now={now} onOpen={() => router.push(`/admin/customers/${r.id}`)} />)
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination total={total} />
    </div>
  );
}

// 거래현황 칸 — 0은 흐림, 값 있으면 bold.
function Count({ label, n }: { label: string; n: number }) {
  return (
    <span className={n > 0 ? "font-semibold text-text" : "text-muted/60"}>
      {label} {n}
    </span>
  );
}

function Row({ r, q, now, onOpen }: { r: CustomerListRow; q: string; now: Date; onOpen: () => void }) {
  const phone = r.phone1 ?? r.mobile ?? r.phone;
  const rel = relativeTime(r.activity_at, now);
  return (
    <TableRow onClick={onOpen} className="cursor-pointer">
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Building2 className="size-4" />
          </span>
          <span className="min-w-0">
            <Link
              href={`/admin/customers/${r.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block max-w-60 truncate text-body font-bold text-text hover:text-accent"
            >
              <Mark text={r.name} q={q} />
            </Link>
            <span className="block font-mono text-micro tabular-nums text-muted">
              {r.ledger_no != null && <>#{r.ledger_no}</>}
              {r.ledger_no != null && r.biz_no && " · "}
              {r.biz_no && <Mark text={formatBizNo(r.biz_no)} q={q} />}
            </span>
          </span>
        </div>
      </TableCell>
      <TableCell>
        <span className="block truncate text-body text-text">{r.ceo ? <Mark text={r.ceo} q={q} /> : <span className="text-muted/60">—</span>}</span>
        <span className="block truncate text-micro text-muted">{r.manager ? <Mark text={r.manager} q={q} /> : ""}</span>
      </TableCell>
      <TableCell>
        {phone ? <span className="font-mono text-small tabular-nums text-text">{phone}</span> : <span className="text-muted/60">—</span>}
      </TableCell>
      <TableCell>
        {r.region ? <Badge variant="secondary" className="text-micro">{r.region}</Badge> : <span className="text-muted/60">—</span>}
      </TableCell>
      <TableCell>
        {r.assignee_name ? (
          <span className="text-body text-text">{r.assignee_name}</span>
        ) : (
          <span className="text-small text-muted/60">미배정</span>
        )}
      </TableCell>
      <TableCell>
        <span className="flex gap-2.5 whitespace-nowrap font-mono text-small tabular-nums">
          <Count label="견적" n={r.quotes_count} />
          <Count label="장비" n={r.equipment_count} />
          <Count label="AS" n={r.as_count} />
        </span>
      </TableCell>
      <TableCell>
        {rel ? (
          <span className="text-small text-text">{rel}</span>
        ) : (
          <span className="text-small text-muted/60">활동 없음</span>
        )}
      </TableCell>
    </TableRow>
  );
}
