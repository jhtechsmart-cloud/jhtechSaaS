"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  APPLICATION_STATUSES, APPLICATION_STATUS_META, ApplicationStatusBadge,
} from "@/lib/application-status";
import type { ApplicationListRow } from "@/lib/applications/admin-queries";

export function ApplicationTable({
  rows, overflow, q, status,
}: {
  rows: ApplicationListRow[];
  overflow: boolean;
  q: string;
  status: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);

  function push(nextQ: string, nextStatus: string) {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextStatus !== "all") params.set("status", nextStatus);
    router.push(`/admin/applications${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); push(search, status); }}
          className="flex gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="업체명·접수번호 검색"
            className="w-60 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
          />
          <button type="submit" className="rounded-md bg-surface-2 px-3 py-2 text-small font-medium text-muted">검색</button>
        </form>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => push(search, "all")}
            className={`rounded-md px-3 py-2 text-small font-medium ${status === "all" ? "bg-accent text-white" : "bg-surface-2 text-muted"}`}
          >
            전체
          </button>
          {APPLICATION_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => push(search, s)}
              className={`rounded-md px-3 py-2 text-small font-medium ${status === s ? "bg-accent text-white" : "bg-surface-2 text-muted"}`}
            >
              {APPLICATION_STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {overflow && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-small text-amber-700">
          100건을 초과해 최신 100건만 표시합니다. 검색·상태필터로 범위를 좁히세요.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
          <p className="text-body font-medium text-text">조건에 맞는 견적이 없습니다</p>
          {(q || status !== "all") ? (
            <Link href="/admin/applications" className="text-small text-accent underline">필터 초기화</Link>
          ) : (
            <p className="text-small text-muted">고객이 /request 에서 신청하면 여기 표시됩니다</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-border text-left text-small text-muted">
                <th className="py-2 pr-4 font-medium">접수번호</th>
                <th className="py-2 pr-4 font-medium">업체</th>
                <th className="py-2 pr-4 font-medium">견적 내용</th>
                <th className="py-2 pr-4 font-medium">담당</th>
                <th className="py-2 pr-4 font-medium">상태</th>
                <th className="py-2 font-medium">접수일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <tr
                  key={it.id}
                  className={`cursor-pointer border-b border-border hover:bg-surface-2 ${it.is_new ? "bg-blue-50/40" : ""}`}
                  onClick={() => router.push(`/admin/applications/${it.id}`)}
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/applications/${it.id}`}
                      className="flex items-center gap-2 font-mono tabular-nums text-text hover:text-accent"
                    >
                      {it.is_new && <span className="inline-block size-2 rounded-full bg-accent" aria-label="미배정" />}
                      {it.seq_no}
                    </Link>
                  </td>
                  <td className="max-w-xs py-2 pr-4"><span className="block max-w-xs truncate text-text">{it.company}</span></td>
                  <td className="max-w-xs py-2 pr-4"><span className="block max-w-xs truncate text-muted">{it.summary || "-"}</span></td>
                  <td className="py-2 pr-4 text-text">{it.assignee_name ?? <span className="text-muted">미배정</span>}</td>
                  <td className="py-2 pr-4"><ApplicationStatusBadge status={it.status} /></td>
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
