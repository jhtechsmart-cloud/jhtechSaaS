"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBizNo } from "@jhtechsaas/shared";
import type { CompanyListRow } from "@/lib/customers/queries";

// 담당영업 필터: 전체 / 내 담당 / 미배정
type AssigneeFilter = "all" | "mine" | "unassigned";

export function CompanyTable({
  items,
  userId,
}: {
  items: CompanyListRow[];
  userId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      // 업체명·biz_no 검색
      const bizFormatted = it.biz_no ? formatBizNo(it.biz_no).toLowerCase() : "";
      const matchesQ =
        needle === "" ||
        it.name.toLowerCase().includes(needle) ||
        (it.biz_no ?? "").toLowerCase().includes(needle) ||
        bizFormatted.includes(needle);
      // 담당영업 세그먼트 필터
      const matchesAssignee =
        assigneeFilter === "all" ||
        (assigneeFilter === "mine" && it.assignee_id === userId) ||
        (assigneeFilter === "unassigned" && it.assignee_id === null);
      return matchesQ && matchesAssignee;
    });
  }, [items, q, assigneeFilter, userId]);

  // 데이터 자체가 0건 (첫 사용)
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface p-10">
        <p className="text-body font-medium text-text">등록된 고객이 없습니다</p>
        <p className="text-small text-muted">직접 입력하거나 기존 견적요청에서 가져오세요</p>
        <div className="flex gap-2">
          <Link
            href="/admin/customers/new?mode=direct"
            className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
          >
            직접 입력
          </Link>
          <Link
            href="/admin/customers/new?mode=import"
            className="rounded-md border border-accent px-4 py-2 text-body font-medium text-accent"
          >
            견적요청에서 가져오기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 툴바: 검색 + 담당영업 세그먼트 필터 */}
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="업체명·사업자번호 검색"
          className="w-60 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
        <div className="flex gap-1">
          {(["all", "mine", "unassigned"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setAssigneeFilter(f)}
              className={`rounded-md px-3 py-2 text-small font-medium ${
                assigneeFilter === f ? "bg-accent text-white" : "bg-surface-2 text-muted"
              }`}
            >
              {f === "all" ? "전체" : f === "mine" ? "내 담당" : "미배정"}
            </button>
          ))}
        </div>
      </div>

      {/* 필터 결과 0건 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-8">
          <p className="text-body text-text">조건에 맞는 고객이 없습니다</p>
          <button
            onClick={() => {
              setQ("");
              setAssigneeFilter("all");
            }}
            className="text-small text-accent underline"
          >
            필터 초기화
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-border text-left text-small text-muted">
                <th className="py-2 pr-4 font-medium">업체명</th>
                <th className="py-2 pr-4 font-medium">사업자번호</th>
                <th className="py-2 pr-4 font-medium">담당영업</th>
                <th className="py-2 pr-4 text-right font-medium">보유장비</th>
                <th className="py-2 font-medium">최근수정</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr
                  key={it.id}
                  className="cursor-pointer border-b border-border hover:bg-surface-2"
                  onClick={() => router.push(`/admin/customers/${it.id}/edit`)}
                >
                  {/* 업체명 */}
                  <td className="max-w-xs py-2 pr-4">
                    <Link
                      href={`/admin/customers/${it.id}/edit`}
                      className="block max-w-xs truncate font-medium text-text hover:text-accent"
                    >
                      {it.name}
                    </Link>
                  </td>
                  {/* 사업자번호: mono tabular, null → muted "-" */}
                  <td className="py-2 pr-4">
                    {it.biz_no ? (
                      <span className="font-mono tabular-nums text-text">
                        {formatBizNo(it.biz_no)}
                      </span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  {/* 담당영업: 미배정(null) → amber soft 배지(색 스파인 alt axis) */}
                  <td className="py-2 pr-4">
                    {it.assignee_id === null ? (
                      <span className="rounded-sm bg-amber-100 px-2 py-0.5 text-small font-medium text-amber-700">
                        미배정
                      </span>
                    ) : (
                      <span className="text-text">{it.assignee_name ?? "-"}</span>
                    )}
                  </td>
                  {/* 보유장비수: mono, 0 → muted */}
                  <td className="py-2 pr-4 text-right">
                    {it.equipment_count === 0 ? (
                      <span className="font-mono tabular-nums text-muted">0</span>
                    ) : (
                      <span className="font-mono tabular-nums text-text">{it.equipment_count}</span>
                    )}
                  </td>
                  {/* 등록일(updated_at): mono */}
                  <td className="py-2 font-mono tabular-nums text-muted">
                    {new Date(it.updated_at).toLocaleDateString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
