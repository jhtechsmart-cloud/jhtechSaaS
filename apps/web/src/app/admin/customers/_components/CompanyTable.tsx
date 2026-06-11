"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBizNo } from "@jhtechsaas/shared";
import { fetchCompaniesPage } from "@/lib/customers/actions";
import { regionOf } from "@/lib/customers/list-search";
import type { CompanyListRow } from "@/lib/customers/queries";

// 고객 목록 — 서버 검색·필터·정렬 + 30건 더보기(엑셀 이관 1,270건 대응).
// ⚠️ 전량 클라 필터 금지: PostgREST 1000행 캡. 의뢰관리 목록 패널과 동일한
// 디바운스+요청 시퀀스 가드 패턴(stale 응답 폐기·로딩 고착 방지).
const PAGE = 30;
type Scope = "all" | "mine" | "unassigned";
type Sort = "name" | "recent";

export function CompanyTable({
  initialRows,
  initialHasMore,
  userId,
}: {
  initialRows: CompanyListRow[];
  initialHasMore: boolean;
  userId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [rows, setRows] = useState<CompanyListRow[]>(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  // 검색·필터·정렬 변경 → 첫 페이지 재조회(초기값은 서버 prop 사용이므로 스킵).
  const isInitial = useRef(true);
  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const seq = ++reqSeq.current;
      setLoading(true);
      try {
        const res = await fetchCompaniesPage({ scope, sort, q: q.trim() || undefined, offset: 0, limit: PAGE });
        if (seq !== reqSeq.current) return; // 더 새 요청이 출발 — 이 응답은 폐기
        setRows(res.rows);
        setHasMore(res.hasMore);
      } catch {
        // 실패 시 기존 목록 유지 — loading 고착만 방지
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, scope, sort]);

  async function loadMore() {
    const seq = ++reqSeq.current;
    setLoading(true);
    try {
      const res = await fetchCompaniesPage({ scope, sort, q: q.trim() || undefined, offset: rows.length, limit: PAGE });
      if (seq !== reqSeq.current) return;
      setRows((prev) => [...prev, ...res.rows]);
      setHasMore(res.hasMore);
    } catch {
      // 실패 시 기존 목록 유지
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }

  // 데이터 자체가 0건 (첫 사용)
  if (initialRows.length === 0 && rows.length === 0 && q.trim() === "" && scope === "all") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface p-10">
        <p className="text-body font-medium text-text">등록된 고객이 없습니다</p>
        <p className="text-small text-muted">직접 입력하거나 기존 견적요청에서 가져오세요</p>
        <div className="flex gap-2">
          <Link href="/admin/customers/new?mode=direct" className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white">
            직접 입력
          </Link>
          <Link href="/admin/customers/new?mode=import" className="rounded-md border border-accent px-4 py-2 text-body font-medium text-accent">
            견적요청에서 가져오기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 툴바: 검색 + 담당영업 세그먼트 + 정렬 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="업체명·사업자번호·장부명·전화"
          className="w-72 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
        <div className="flex gap-1">
          {(["all", "mine", "unassigned"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setScope(f)}
              className={`rounded-md px-3 py-2 text-small font-medium ${
                scope === f ? "bg-accent text-white" : "bg-surface-2 text-muted"
              }`}
            >
              {f === "all" ? "전체" : f === "mine" ? "내 담당" : "미배정"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSort(sort === "name" ? "recent" : "name")}
          className="ml-auto rounded-md border border-border px-3 py-2 text-small font-medium text-muted hover:text-text"
        >
          {sort === "name" ? "이름순 ▾" : "최근수정순 ▾"}
        </button>
      </div>

      {/* 결과 0건 */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-8">
          <p className="text-body text-text">{loading ? "불러오는 중…" : "조건에 맞는 고객이 없습니다"}</p>
          {!loading && (
            <button
              onClick={() => { setQ(""); setScope("all"); }}
              className="text-small text-accent underline"
            >
              필터 초기화
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-border text-left text-small text-muted">
                <th className="py-2 pr-4 font-medium">업체명</th>
                <th className="py-2 pr-4 font-medium">사업자번호</th>
                <th className="py-2 pr-4 font-medium">지역</th>
                <th className="py-2 pr-4 font-medium">전화</th>
                <th className="py-2 pr-4 font-medium">담당영업</th>
                <th className="py-2 text-right font-medium">보유장비</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => {
                const region = regionOf(it.address);
                const phone = it.phone1 ?? it.mobile;
                return (
                  <tr
                    key={it.id}
                    className="cursor-pointer border-b border-border hover:bg-surface-2"
                    onClick={() => router.push(`/admin/customers/${it.id}`)}
                  >
                    {/* 업체명(+장부명이 다르면 부제) */}
                    <td className="max-w-xs py-2 pr-4">
                      <Link href={`/admin/customers/${it.id}`} className="block max-w-xs truncate font-medium text-text hover:text-accent">
                        {it.name}
                      </Link>
                      {it.ledger_name && it.ledger_name !== it.name && (
                        <span className="block max-w-xs truncate text-micro text-muted">{it.ledger_name}</span>
                      )}
                    </td>
                    {/* 사업자번호: mono tabular, null → muted "-" */}
                    <td className="py-2 pr-4">
                      {it.biz_no ? (
                        <span className="font-mono tabular-nums text-text">{formatBizNo(it.biz_no)}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    {/* 지역 배지(주소 시·도) */}
                    <td className="py-2 pr-4">
                      {region ? (
                        <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-micro font-medium text-muted">{region}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    {/* 전화(전화1 우선, 없으면 휴대폰) */}
                    <td className="py-2 pr-4">
                      {phone ? <span className="font-mono tabular-nums text-small text-text">{phone}</span> : <span className="text-muted">-</span>}
                    </td>
                    {/* 담당영업 */}
                    <td className="py-2 pr-4">
                      {it.assignee_name ?? <span className="text-muted">미배정</span>}
                    </td>
                    {/* 보유장비 수 */}
                    <td className="py-2 text-right tabular-nums">
                      {it.equipment_count > 0 ? it.equipment_count : <span className="text-muted">0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="w-full rounded-md bg-surface-2 py-2.5 text-small font-semibold text-accent disabled:opacity-50"
        >
          {loading ? "불러오는 중…" : "더 보기"}
        </button>
      )}
    </div>
  );
}
