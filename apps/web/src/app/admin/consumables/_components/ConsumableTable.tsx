"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ConsumableListRow } from "@/lib/consumables/queries";

type StatusFilter = "all" | "active" | "inactive";

export function ConsumableTable({ items }: { items: ConsumableListRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      const matchesQ =
        needle === "" ||
        it.name.toLowerCase().includes(needle) ||
        (it.sku ?? "").toLowerCase().includes(needle);
      const matchesStatus = statusFilter === "all" || it.status === statusFilter;
      return matchesQ && matchesStatus;
    });
  }, [items, q, statusFilter]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface p-10">
        <p className="text-body font-medium text-text">등록된 소모품이 없습니다</p>
        <Link href="/admin/consumables/new" className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white">+ 새 소모품</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="소모품명·품번 검색"
          className="w-60 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-md px-3 py-2 text-small font-medium ${
                statusFilter === f ? "bg-accent text-white" : "bg-surface-2 text-muted"
              }`}
            >
              {f === "all" ? "전체" : f === "active" ? "활성" : "비활성"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-8">
          <p className="text-body text-text">조건에 맞는 소모품이 없습니다</p>
          <button onClick={() => { setQ(""); setStatusFilter("all"); }} className="text-small text-accent underline">필터 초기화</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-border text-left text-small text-muted">
                <th className="py-2 pr-4 font-medium">소모품명</th>
                <th className="py-2 pr-4 font-medium">단위</th>
                <th className="py-2 pr-4 font-medium">품번</th>
                <th className="py-2 pr-4 font-medium">적용 범위</th>
                <th className="py-2 pr-4 font-medium">상태</th>
                <th className="py-2 font-medium">최근수정</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr
                  key={it.id}
                  className="cursor-pointer border-b border-border hover:bg-surface-2"
                  onClick={() => router.push(`/admin/consumables/${it.id}/edit`)}
                >
                  <td className="max-w-xs py-2 pr-4">
                    <Link href={`/admin/consumables/${it.id}/edit`} className="block max-w-xs truncate font-medium text-text hover:text-accent">{it.name}</Link>
                  </td>
                  <td className="py-2 pr-4 text-text">{it.unit ?? <span className="text-muted">-</span>}</td>
                  <td className="py-2 pr-4">{it.sku ? <span className="font-mono tabular-nums text-text">{it.sku}</span> : <span className="text-muted">-</span>}</td>
                  <td className="py-2 pr-4">
                    {it.scope_count === 0
                      ? <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-small font-medium text-amber-700">미지정</span>
                      : <span className="text-text">{it.scope_summary}</span>}
                  </td>
                  <td className="py-2 pr-4">
                    {it.status === "active"
                      ? <span className="rounded-sm bg-active/10 px-2 py-0.5 text-small font-medium text-active">활성</span>
                      : <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-small font-medium text-muted">비활성</span>}
                  </td>
                  <td className="py-2 font-mono tabular-nums text-muted">{new Date(it.updated_at).toLocaleDateString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
