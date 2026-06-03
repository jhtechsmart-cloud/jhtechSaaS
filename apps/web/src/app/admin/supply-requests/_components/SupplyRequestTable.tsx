"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SUPPLY_REQUEST_STATUSES, type SupplyRequestStatus } from "@/lib/supply-requests/status";
import type { SupplyRequestListRow } from "@/lib/supply-requests/queries";
import { StatusBadge, STATUS_META } from "@/lib/request-status";

type StatusFilter = "all" | SupplyRequestStatus;

export function SupplyRequestTable({ items }: { items: SupplyRequestListRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      const matchesQ =
        needle === "" ||
        it.company_name.toLowerCase().includes(needle) ||
        it.requester_name.toLowerCase().includes(needle) ||
        it.seq_no.toLowerCase().includes(needle);
      const matchesStatus = statusFilter === "all" || it.status === statusFilter;
      const matchesAssign = !unassignedOnly || it.assignee_id == null;
      return matchesQ && matchesStatus && matchesAssign;
    });
  }, [items, q, statusFilter, unassignedOnly]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-body font-medium text-text">접수된 소모품 신청이 없습니다</p>
        <p className="text-small text-muted">고객이 /supply 에서 신청하면 여기 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="업체·신청자·접수번호 검색"
          className="w-60 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setStatusFilter("all")}
            className={`rounded-md px-3 py-2 text-small font-medium ${statusFilter === "all" ? "bg-accent text-white" : "bg-surface-2 text-muted"}`}
          >전체</button>
          {SUPPLY_REQUEST_STATUSES.map((s) => (
            <button
              key={s} onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-2 text-small font-medium ${statusFilter === s ? "bg-accent text-white" : "bg-surface-2 text-muted"}`}
            >{STATUS_META[s].label}</button>
          ))}
        </div>
        <button
          onClick={() => setUnassignedOnly((v) => !v)}
          className={`rounded-md px-3 py-2 text-small font-medium ${unassignedOnly ? "bg-accent text-white" : "bg-surface-2 text-muted"}`}
        >미배정만</button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-8">
          <p className="text-body text-text">조건에 맞는 신청이 없습니다</p>
          <button onClick={() => { setQ(""); setStatusFilter("all"); setUnassignedOnly(false); }} className="text-small text-accent underline">필터 초기화</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-border text-left text-small text-muted">
                <th className="py-2 pr-4 font-medium">접수번호</th>
                <th className="py-2 pr-4 font-medium">업체</th>
                <th className="py-2 pr-4 font-medium">신청자</th>
                <th className="py-2 pr-4 font-medium">품목</th>
                <th className="py-2 pr-4 font-medium">담당</th>
                <th className="py-2 pr-4 font-medium">상태</th>
                <th className="py-2 font-medium">접수일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr
                  key={it.id}
                  className="cursor-pointer border-b border-border hover:bg-surface-2"
                  onClick={() => router.push(`/admin/supply-requests/${it.id}`)}
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/supply-requests/${it.id}`}
                      className="flex items-center gap-2 font-mono tabular-nums text-text hover:text-accent"
                    >
                      {it.unread && <span className="inline-block size-2 rounded-full bg-accent" aria-label="미열람" />}
                      {it.seq_no}
                    </Link>
                  </td>
                  <td className="max-w-xs py-2 pr-4"><span className="block max-w-xs truncate text-text">{it.company_name}</span></td>
                  <td className="py-2 pr-4 text-text">{it.requester_name}</td>
                  <td className="max-w-xs py-2 pr-4">
                    <span className="text-text">
                      <span className="font-mono tabular-nums">{it.item_count}</span>건
                    </span>
                    {it.item_preview && <span className="ml-2 text-small text-muted">{it.item_preview}</span>}
                  </td>
                  <td className="py-2 pr-4 text-text">{it.assignee_name ?? <span className="text-muted">미배정</span>}</td>
                  <td className="py-2 pr-4"><StatusBadge status={it.status} /></td>
                  <td className="py-2 font-mono tabular-nums text-muted">{new Date(it.created_at).toLocaleDateString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
