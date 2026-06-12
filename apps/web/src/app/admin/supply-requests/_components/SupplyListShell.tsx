"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { formatKstDate } from "@jhtechsaas/shared";
import { SUPPLY_REQUEST_STATUSES } from "@/lib/supply-requests/status";
import type { SupplyRequestListRow } from "@/lib/supply-requests/queries";
import { StatusBadge, STATUS_META } from "@/lib/request-status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuickFilterCards } from "@/app/admin/_components/request-list/QuickFilterCards";
import { RequestToolbar } from "@/app/admin/_components/request-list/RequestToolbar";

// 소모품 신청 목록 — 고객목록과 동일 레이아웃(KPI 빠른필터 + 통합검색 툴바 + 데이터 테이블).
// 서버가 RLS 스코프로 내려준 전량(≤100건)을 클라에서 필터.

export function SupplyListShell({ items }: { items: SupplyRequestListRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [assignee, setAssignee] = useState<"all" | "none">("all");

  const countOf = (s: string) => items.filter((it) => it.status === s).length;
  const cards = [
    { key: "all", label: "전체 신청", sub: "접수된 소모품", gauge: "#176455", count: items.length },
    { key: "received", label: "접수(미처리)", sub: "확인 필요", gauge: "#E98668", count: countOf("received") },
    { key: "in_progress", label: "진행중", sub: "처리 중", gauge: "#D3E478", count: countOf("in_progress") },
    { key: "done", label: "완료", sub: "처리 종결", gauge: "#34B8A5", count: countOf("done") },
  ];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      const matchesQ =
        needle === "" ||
        it.company_name.toLowerCase().includes(needle) ||
        it.requester_name.toLowerCase().includes(needle) ||
        it.seq_no.toLowerCase().includes(needle) ||
        it.item_preview.toLowerCase().includes(needle);
      const matchesStatus = status === "all" || it.status === status;
      const matchesAssign = assignee === "all" || it.assignee_id == null;
      return matchesQ && matchesStatus && matchesAssign;
    });
  }, [items, q, status, assignee]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-body font-medium text-text">접수된 소모품 신청이 없습니다</p>
        <p className="text-small text-muted">고객이 /supply 에서 신청하면 여기 표시됩니다</p>
      </div>
    );
  }

  const hasFilter = q !== "" || status !== "all" || assignee !== "all";
  const reset = () => {
    setQ("");
    setStatus("all");
    setAssignee("all");
  };

  return (
    <div className="flex flex-col gap-4">
      <QuickFilterCards cards={cards} active={status} onSelect={setStatus} />
      <RequestToolbar
        q={q}
        onQ={setQ}
        placeholder="업체명, 신청자, 접수번호, 품목 통합 검색"
        statusOptions={SUPPLY_REQUEST_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))}
        status={status}
        onStatus={setStatus}
        assignee={assignee}
        onAssignee={setAssignee}
        hasFilter={hasFilter}
        onReset={reset}
      />

      <div className="max-h-[62vh] overflow-auto rounded-lg border border-border bg-surface shadow-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface">
            <TableRow>
              <TableHead className="min-w-56">업체명</TableHead>
              <TableHead className="min-w-24">신청자</TableHead>
              <TableHead className="min-w-44">품목</TableHead>
              <TableHead className="min-w-24">담당</TableHead>
              <TableHead className="w-24">상태</TableHead>
              <TableHead className="w-28">신청일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center gap-2 py-10">
                    <p className="text-body text-text">조건에 맞는 신청이 없습니다</p>
                    <button type="button" onClick={reset} className="text-small text-accent underline">
                      필터 초기화
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((it) => (
                <TableRow
                  key={it.id}
                  onClick={() => router.push(`/admin/supply-requests/${it.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                        <Package className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          {it.unread && <span className="inline-block size-2 shrink-0 rounded-full bg-accent" aria-label="미열람" />}
                          <Link
                            href={`/admin/supply-requests/${it.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block max-w-60 truncate text-body font-medium text-text hover:text-accent"
                          >
                            {it.company_name}
                          </Link>
                        </span>
                        <span className="block font-mono text-micro tabular-nums text-muted">{it.seq_no}</span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="block truncate text-body text-text">{it.requester_name}</span>
                  </TableCell>
                  <TableCell>
                    {it.item_preview ? (
                      <span className="block max-w-56 truncate text-body text-muted">
                        {it.item_preview}
                        <span className="ml-1 font-mono text-micro tabular-nums">({it.item_count})</span>
                      </span>
                    ) : (
                      <span className="text-muted/60">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {it.assignee_name ? (
                      <span className="text-body text-text">{it.assignee_name}</span>
                    ) : (
                      <span className="text-small text-muted/60">미배정</span>
                    )}
                  </TableCell>
                  <TableCell><StatusBadge status={it.status} /></TableCell>
                  <TableCell>
                    <span className="font-mono text-small tabular-nums text-muted">{formatKstDate(it.created_at)}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
