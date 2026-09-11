"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminPdfUrlAction, adminResolveFollowAction, type AdminReportRow } from "@/lib/service-reports/admin-actions";
import { SERVICE_REPORT_STATUS_LABEL } from "@/lib/service-reports/status";
import {
  MAIL_BADGE,
  REPORT_TABS,
  STATUS_BADGE_CLASS,
  tabMatches,
  type ReportTabKey,
} from "@/lib/service-reports/report-tabs";

// 리포트 목록(클라, #285 #C) — 탭 7종(URL ?tab= shallow 동기, 뒤로가기·링크 공유) + 배지(상태 5톤·메일 4톤)
// + 행 클릭 → 상세. 승인·완료·무효화는 상세 페이지(D-B2). lg 미만은 카드뷰(D-B6).
type Period = "all" | "month";

const won = (n: number) => n.toLocaleString("ko-KR") + "원";
const d10 = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export function StatusBadge({ status, title }: { status: AdminReportRow["status"]; title?: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-micro font-bold ${STATUS_BADGE_CLASS[status]}`} title={title}>
      {SERVICE_REPORT_STATUS_LABEL[status]}
    </span>
  );
}

export function MailBadge({ mail }: { mail: AdminReportRow["mail"] }) {
  const b = MAIL_BADGE[mail];
  return <span className={`rounded-full px-2 py-0.5 text-micro font-semibold ${b.className}`}>{b.label}</span>;
}

export function ReportTable({
  items,
  counts,
  tab,
  period,
  canResolveFollow,
}: {
  items: AdminReportRow[]; // 활성 탭 기준으로 서버가 이미 필터한 행
  counts: Record<ReportTabKey, number> | null; // DB 전체 기준 정확 건수(실패 시 null → 숫자 생략)
  tab: ReportTabKey;
  period: Period;
  canResolveFollow: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  // 탭·기간 전환은 서버 재조회(필터가 서버에 있음) — 검색어 입력과 달리 레이스가 없으므로 push가 맞다.
  function go(nextTab: ReportTabKey, nextPeriod: Period) {
    const sp = new URLSearchParams();
    sp.set("tab", nextTab);
    if (nextTab === "completed" && nextPeriod === "month") sp.set("period", "month");
    router.push(`/admin/service-reports?${sp.toString()}`);
  }
  const filtered = items;

  const emptyText: Record<ReportTabKey, string> = {
    all: "표시할 리포트가 없습니다",
    awaiting_approval: "승인을 기다리는 리포트가 없습니다",
    awaiting_tax: "세금계산서 처리를 기다리는 리포트가 없습니다",
    mail_unsent: "고객 메일을 보내지 않은 승인본이 없습니다",
    follow: "후속조치를 기다리는 리포트가 없습니다",
    completed: period === "month" ? "이번 달 완료된 리포트가 없습니다" : "완료된 리포트가 없습니다",
    voided: "무효 처리된 리포트가 없습니다",
  };

  async function openPdf(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const res = await adminPdfUrlAction(id);
    if (res.ok) window.open(res.data, "_blank");
    else setNote(res.error);
  }
  function resolveFollow(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    startTransition(async () => {
      const res = await adminResolveFollowAction(id);
      setNote(res.ok ? "" : res.error);
    });
  }
  const open = (id: string) => router.push(`/admin/service-reports/${id}`);

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="리포트 필터" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {REPORT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            aria-current={tab === t.key ? "page" : undefined}
            onClick={() => go(t.key, period)}
            className={`min-h-9 shrink-0 rounded-full border px-4 py-1.5 text-small font-semibold ${
              tab === t.key ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted hover:text-text"
            }`}
          >
            {t.label}{counts ? ` ${counts[t.key]}` : ""}
          </button>
        ))}
      </div>
      {tab === "completed" && (
        <div className="flex gap-2" aria-label="기간">
          {(
            [
              { k: "month", label: "이번 달" },
              { k: "all", label: "전체" },
            ] as const
          ).map((p) => (
            <button
              key={p.k}
              type="button"
              onClick={() => go(tab, p.k)}
              className={`rounded-full border px-3 py-1 text-micro font-semibold ${
                period === p.k ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {note && <p className="text-small text-danger">{note}</p>}

      {/* 데스크톱 표 */}
      <div className="hidden overflow-x-auto rounded-md border border-border bg-surface shadow-card lg:block">
        <table className="w-full min-w-[900px] text-small">
          <thead>
            <tr className="border-b border-border text-left text-micro font-semibold uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5">번호</th>
              <th className="px-3 py-2.5">고객</th>
              <th className="px-3 py-2.5">장비</th>
              <th className="px-3 py-2.5">엔지니어</th>
              <th className="px-3 py-2.5 text-right">청구액</th>
              <th className="px-3 py-2.5">확정일</th>
              <th className="px-3 py-2.5">상태</th>
              <th className="px-3 py-2.5">메일</th>
              <th className="px-3 py-2.5">후속조치</th>
              <th className="px-3 py-2.5 text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted">
                  {emptyText[tab]}
                  {tab !== "all" && (
                    <button type="button" onClick={() => go("all", period)} className="ml-2 text-accent underline">
                      전체 보기
                    </button>
                  )}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr
                key={r.id}
                onClick={() => open(r.id)}
                className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-surface-2/50"
              >
                <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-text">{r.seq_no}</td>
                <td className="px-3 py-2 font-medium text-text">{r.customer_name || "—"}</td>
                <td className="max-w-48 truncate px-3 py-2 text-text">{r.device_name || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{r.engineer_name ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-text">
                  {r.charge_type === "free" ? "무상" : won(r.total)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted">{d10(r.issued_at)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} title={r.void_reason ?? undefined} />
                </td>
                <td className="px-3 py-2">{r.status === "approved" || r.status === "completed" ? <MailBadge mail={r.mail} /> : <span className="text-micro text-faint">—</span>}</td>
                <td className="px-3 py-2">
                  {r.follow_needed ? (
                    r.follow_resolved_at ? (
                      <span className="text-micro text-muted">처리됨 {d10(r.follow_resolved_at)}</span>
                    ) : (
                      <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-micro font-bold text-danger" title={r.follow_memo ?? ""}>
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
                        onClick={(e) => void openPdf(e, r.id)}
                        className="rounded-full border border-border px-3 py-1 text-micro font-semibold text-text hover:bg-surface-2"
                      >
                        PDF
                      </button>
                    )}
                    {canResolveFollow && tabMatches("follow", r) && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={(e) => resolveFollow(e, r.id)}
                        className="rounded-full border border-accent px-3 py-1 text-micro font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
                      >
                        후속 처리 완료
                      </button>
                    )}
                    <span aria-hidden className="text-muted">
                      ▸
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드뷰 */}
      <ul className="flex flex-col gap-2 lg:hidden">
        {filtered.length === 0 && (
          <li className="rounded-md border border-border bg-surface p-6 text-center text-small text-muted">{emptyText[tab]}</li>
        )}
        {filtered.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => open(r.id)}
              className="flex w-full flex-col gap-1 rounded-md border border-border bg-surface p-3 text-left shadow-card"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-small tabular-nums text-muted">{r.seq_no}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-body font-semibold text-text">{r.customer_name || "—"}</span>
                <span className="shrink-0 font-mono text-body tabular-nums text-text">
                  {r.charge_type === "free" ? "무상" : won(r.total)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-micro text-muted">
                <span className="truncate">{r.device_name || "—"}</span>
                <span className="shrink-0">
                  {d10(r.issued_at)} <span aria-hidden>▸</span>
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
