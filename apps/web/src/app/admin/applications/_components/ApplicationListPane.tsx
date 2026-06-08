"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApplicationStatusBadge } from "@/lib/application-status";
import { dateGroupOf, type DateGroup } from "@/lib/applications/admin-search";
import { fetchApplicationsPage } from "@/lib/applications/admin-actions";
import type { ApplicationListRow, ListScope } from "@/lib/applications/admin-queries";

const PAGE = 30;
const TABS: { key: ListScope; label: string }[] = [
  { key: "active", label: "진행중" },
  { key: "closed", label: "완료" },
  { key: "all", label: "전체" },
];
const GROUP_LABEL: Record<DateGroup, string> = { today: "오늘", week: "이번 주", earlier: "이전" };
const GROUP_ORDER: DateGroup[] = ["today", "week", "earlier"];

export function ApplicationListPane({
  initialRows, initialHasMore, counts, canQuote,
}: {
  initialRows: ApplicationListRow[];
  initialHasMore: boolean;
  counts: { active: number; closed: number };
  canQuote: boolean;
}) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/admin/applications/")
    ? pathname.split("/")[3] ?? null
    : null;

  const [scope, setScope] = useState<ListScope>("active");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ApplicationListRow[]>(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // scope/q 변경 → 첫 페이지 재조회. 초기(scope=active,q="")는 서버 초기값 사용하므로 스킵.
  const isInitial = useRef(true);
  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      const res = await fetchApplicationsPage({ scope, q: q.trim() || undefined, offset: 0, limit: PAGE });
      setRows(res.rows);
      setHasMore(res.hasMore);
      setLoading(false);
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [scope, q]);

  async function loadMore() {
    setLoading(true);
    const res = await fetchApplicationsPage({ scope, q: q.trim() || undefined, offset: rows.length, limit: PAGE });
    setRows((prev) => [...prev, ...res.rows]);
    setHasMore(res.hasMore);
    setLoading(false);
  }

  // 날짜 그룹 버킷팅(현재 로드된 rows).
  const now = new Date();
  const groups = GROUP_ORDER.map((g) => ({
    key: g,
    rows: rows.filter((r) => dateGroupOf(r.created_at, now) === g),
  })).filter((grp) => grp.rows.length > 0);

  const total = counts.active + counts.closed;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-body font-bold text-text">신청 목록</h2>
          {canQuote && (
            <Link href="/admin/quotes/new" className="rounded-md bg-accent px-2.5 py-1 text-micro font-semibold text-white">
              + 수기 견적
            </Link>
          )}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="업체명·접수번호·사업자번호"
          className="mb-2 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-text"
        />
        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setScope(t.key)}
              className={`rounded-full px-2.5 py-1 text-micro font-semibold ${scope === t.key ? "bg-accent text-white" : "bg-surface-2 text-muted"}`}
            >
              {t.label}
              {t.key === "active" && <span className="ml-1 tabular-nums">{counts.active}</span>}
              {t.key === "closed" && <span className="ml-1 tabular-nums">{counts.closed}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-small text-muted">{loading ? "불러오는 중…" : "해당하는 의뢰가 없습니다"}</p>
        ) : (
          groups.map((grp) => (
            <div key={grp.key}>
              <div className="bg-surface-2 px-3 py-1.5 text-micro font-bold uppercase tracking-wide text-muted">
                {GROUP_LABEL[grp.key]}
              </div>
              {grp.rows.map((it) => {
                const selected = it.id === activeId;
                return (
                  <Link
                    key={it.id}
                    href={`/admin/applications/${it.id}`}
                    className={`block border-b border-surface-2 px-3 py-2.5 ${selected ? "border-l-[3px] border-l-accent bg-accent-soft" : "border-l-[3px] border-l-transparent hover:bg-surface-2"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 truncate text-small font-semibold text-text">
                        {it.is_new && <span className="inline-block size-1.5 shrink-0 rounded-full bg-accent" aria-label="미처리" />}
                        {it.company}
                      </span>
                      <ApplicationStatusBadge status={it.status} />
                    </div>
                    <div className="mt-0.5 truncate text-micro tabular-nums text-muted">
                      {it.seq_no} · {it.assignee_name ?? "미배정"}{it.summary ? ` · ${it.summary}` : ""}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))
        )}
        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="w-full bg-surface-2 py-2.5 text-small font-semibold text-accent disabled:opacity-50"
          >
            {loading ? "불러오는 중…" : "더 보기"}
          </button>
        )}
      </div>

      <div className="border-t border-border px-3 py-2 text-micro text-muted">
        전체 <span className="tabular-nums">{total}</span>건 · {scope === "active" ? `진행중 ${counts.active}건` : scope === "closed" ? `완료 ${counts.closed}건` : "전체"} 표시
      </div>
    </aside>
  );
}
