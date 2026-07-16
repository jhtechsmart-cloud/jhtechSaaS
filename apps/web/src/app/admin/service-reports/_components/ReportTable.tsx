"use client";
import { useMemo, useState, useTransition } from "react";
import {
  adminPdfUrlAction,
  adminResolveFollowAction,
  adminVoidReportAction,
  type AdminReportRow,
} from "@/lib/service-reports/admin-actions";

// 리포트 테이블(클라) — 빠른필터 탭 + 행 액션. 상태 3톤: 발행=긍정(민트)·작성중=중립·무효=코랄.
type Filter = "all" | "follow" | "voided";

const won = (n: number) => n.toLocaleString("ko-KR") + "원";
const d10 = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

function StatusChip({ row }: { row: AdminReportRow }) {
  if (row.status === "voided")
    return (
      <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-micro font-bold text-danger" title={row.void_reason ?? ""}>
        무효
      </span>
    );
  if (row.status === "draft")
    return <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-micro font-bold text-muted">작성중</span>;
  return <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-micro font-bold text-accent">발행</span>;
}

export function ReportTable({ items, canVoid }: { items: AdminReportRow[]; canVoid: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const followOpen = (r: AdminReportRow) =>
    r.status === "issued" && r.follow_needed && !r.follow_resolved_at;

  const filtered = useMemo(() => {
    if (filter === "follow") return items.filter(followOpen);
    if (filter === "voided") return items.filter((r) => r.status === "voided");
    return items;
  }, [items, filter]);

  const followCount = items.filter(followOpen).length;

  async function openPdf(id: string) {
    const res = await adminPdfUrlAction(id);
    if (res.ok) window.open(res.data, "_blank");
    else setNote(res.error);
  }

  function resolveFollow(id: string) {
    startTransition(async () => {
      const res = await adminResolveFollowAction(id);
      setNote(res.ok ? "" : res.error);
    });
  }

  function voidReport(row: AdminReportRow) {
    const reason = window.prompt(
      `${row.seq_no} 리포트를 무효 처리합니다.\n무효화 사유를 입력하세요(필수). 내용 수정은 불가하며 정정은 새 리포트로 작성합니다.`,
    );
    if (!reason?.trim()) return;
    startTransition(async () => {
      const res = await adminVoidReportAction(row.id, reason.trim());
      setNote(res.ok ? "" : res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(
          [
            { key: "all", label: `전체 ${items.length}` },
            { key: "follow", label: `후속조치 대기 ${followCount}` },
            { key: "voided", label: "무효" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`rounded-full border px-4 py-1.5 text-small font-semibold ${
              filter === t.key
                ? "border-accent bg-accent text-white"
                : "border-border bg-surface text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {note && <p className="text-small text-danger">{note}</p>}

      <div className="overflow-x-auto rounded-md border border-border bg-surface shadow-card">
        <table className="w-full min-w-[860px] text-small">
          <thead>
            <tr className="border-b border-border text-left text-micro font-semibold uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5">번호</th>
              <th className="px-3 py-2.5">고객</th>
              <th className="px-3 py-2.5">장비</th>
              <th className="px-3 py-2.5">엔지니어</th>
              <th className="px-3 py-2.5 text-right">청구액</th>
              <th className="px-3 py-2.5">확정일</th>
              <th className="px-3 py-2.5">상태</th>
              <th className="px-3 py-2.5">후속조치</th>
              <th className="px-3 py-2.5 text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted">
                  표시할 리포트가 없습니다
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-b-0 hover:bg-surface-2/50">
                <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-text">{r.seq_no}</td>
                <td className="px-3 py-2 font-medium text-text">{r.customer_name || "—"}</td>
                <td className="max-w-48 truncate px-3 py-2 text-text">{r.device_name || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{r.engineer_name ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-text">
                  {r.charge_type === "free" ? "무상" : won(r.total)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted">{d10(r.issued_at)}</td>
                <td className="px-3 py-2">
                  <StatusChip row={r} />
                </td>
                <td className="px-3 py-2">
                  {r.follow_needed ? (
                    r.follow_resolved_at ? (
                      <span className="text-micro text-muted">처리됨 {d10(r.follow_resolved_at)}</span>
                    ) : (
                      <span
                        className="rounded-full bg-danger/10 px-2.5 py-0.5 text-micro font-bold text-danger"
                        title={r.follow_memo ?? ""}
                      >
                        대기{r.follow_date ? ` · ${r.follow_date}` : ""}
                      </span>
                    )
                  ) : (
                    <span className="text-micro text-faint">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {r.pdf_url && (
                      <button
                        type="button"
                        onClick={() => void openPdf(r.id)}
                        className="rounded-full border border-border px-3 py-1 text-micro font-semibold text-text hover:bg-surface-2"
                      >
                        PDF
                      </button>
                    )}
                    {followOpen(r) && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => resolveFollow(r.id)}
                        className="rounded-full border border-accent px-3 py-1 text-micro font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
                      >
                        후속 처리 완료
                      </button>
                    )}
                    {canVoid && r.status === "issued" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => voidReport(r)}
                        className="rounded-full border border-danger/50 px-3 py-1 text-micro font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        무효화
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
