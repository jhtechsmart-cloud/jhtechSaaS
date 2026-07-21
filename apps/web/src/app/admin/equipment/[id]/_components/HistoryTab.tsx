"use client";
import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminPdfUrlAction } from "@/lib/service-reports/admin-actions";
import {
  filterReports,
  parseHistoryFilters,
  serializeHistoryFilters,
  type EquipmentReportRow,
  type HistoryFilters,
} from "@/lib/equipment/history-filters";

// #243 AS 이력 탭(클라) — 필터 상태 = URL 쿼리 단일 원본(공유·새로고침 보존).
// 데스크톱 = 8컬럼 테이블 + 행 클릭 인라인 확장 / lg 미만 = 카드뷰. PDF = 기존 admin 패턴 재사용.
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
// 표시일도 KST 기준 — 기간 필터(periodCutoffKst)와 경계가 어긋나 보이지 않게(UTC slice 금지).
const d10 = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }) : "—";

const PERIOD_LABEL = { all: "전체", "1y": "1년", "6m": "6개월" } as const;
const CHARGE_LABEL = { all: "전체", paid: "유상", free: "무상" } as const;

function FaultChips({ faults }: { faults: string[] }) {
  if (faults.length === 0) return <span className="text-micro text-faint">—</span>;
  const shown = faults.slice(0, 2);
  const rest = faults.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((f) => (
        <span key={f} className="rounded-full bg-surface-2 px-2 py-0.5 text-micro font-medium text-text">
          {f}
        </span>
      ))}
      {rest > 0 && (
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-muted" title={faults.join(", ")}>
          +{rest}
        </span>
      )}
    </span>
  );
}

function ChargeCell({ row }: { row: EquipmentReportRow }) {
  if (row.charge_type === "free")
    return <span className="font-medium text-accent">무상</span>;
  return <span className="font-mono tabular-nums text-text">{won(row.total)}</span>;
}

function PdfCell({
  row,
  onOpen,
  loading,
}: {
  row: EquipmentReportRow;
  onOpen: (id: string) => void;
  loading: boolean;
}) {
  if (!row.pdf_url)
    return (
      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-micro text-muted">생성 중</span>
    );
  return (
    <button
      type="button"
      disabled={loading}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(row.id);
      }}
      className="min-h-8 rounded-full border border-border px-3 py-1 text-micro font-semibold text-text hover:bg-surface-2 disabled:opacity-50"
    >
      {loading ? "여는 중…" : "PDF"}
    </button>
  );
}

// 확장 상세 — 조치 전문 + 부품 내역 + 무효 사유(테이블·카드 공용)
function RowDetail({ row }: { row: EquipmentReportRow }) {
  return (
    <div className="flex flex-col gap-2 text-small">
      {row.status === "voided" && row.void_reason && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-danger">무효 사유: {row.void_reason}</p>
      )}
      <div>
        <h4 className="text-micro font-semibold uppercase tracking-wide text-muted">조치 내용</h4>
        <p className="mt-1 whitespace-pre-wrap text-text">{row.action_text || "—"}</p>
      </div>
      {row.parts.length > 0 && (
        <div>
          <h4 className="text-micro font-semibold uppercase tracking-wide text-muted">부품 내역</h4>
          <ul className="mt-1 divide-y divide-border/60">
            {row.parts.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex justify-between gap-3 py-1">
                <span className="min-w-0 truncate text-text">{p.name}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted">
                  {p.qty}개 · {won(p.price * p.qty)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function HistoryTab({
  rows,
  unlinkedCount,
}: {
  rows: EquipmentReportRow[];
  unlinkedCount: number;
}) {
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const filters = useMemo(
    () => parseHistoryFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  // 필터 옵션은 로드된 행에서 유도(사전 60+ 항목 나열 대신 실데이터 기준)
  const faultOptions = useMemo(
    () => [...new Set(rows.flatMap((r) => r.faults))].sort((a, b) => a.localeCompare(b, "ko")),
    [rows],
  );

  const filtered = useMemo(() => filterReports(rows, filters, new Date()), [rows, filters]);

  // 서버 재조회 없는 shallow 갱신(useListParams 패턴) — router.replace를 쓰면 키 입력마다
  // RSC 풀 재조회 + controlled 입력이 이전 URL 값으로 되돌아가는 레이스가 난다.
  // useSearchParams는 native history와 연동되므로 filters 파생도 즉시 갱신된다.
  function apply(next: HistoryFilters) {
    const p = serializeHistoryFilters(next);
    p.set("tab", "history");
    window.history.replaceState(null, "", `?${p.toString()}`);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function openPdf(id: string) {
    setPdfLoading(id);
    setNote("");
    // 클릭 제스처 안에서 창을 먼저 확보 — await 뒤 window.open은 모바일(iOS Safari)서
    // 비제스처 취급으로 팝업 차단된다(세션27 /field에서 실증된 함정).
    const win = window.open("", "_blank");
    try {
      const res = await adminPdfUrlAction(id);
      if (res.ok) {
        if (win) win.location.href = res.data;
        else window.location.href = res.data; // 창 확보 실패(팝업 전면 차단) 폴백
      } else {
        win?.close();
        setNote(res.error);
      }
    } finally {
      setPdfLoading(null);
    }
  }

  // 미연결 안내는 0건 빈 상태보다 먼저 — 리포트가 안 보이는 이유가 미연결일 수 있는
  // 바로 그 상황에서 배너가 가장 필요하다(조용한 누락 금지).
  const unlinkedBanner = unlinkedCount > 0 && (
    <p className="rounded-md border border-coral/40 bg-coral-soft px-3 py-2 text-small text-coral-text">
      이 모델과 이름이 일치하지만 카탈로그에 연결되지 않은 보유장비가 {unlinkedCount}건 있습니다 —
      해당 장비의 리포트는 이 이력에 포함되지 않았을 수 있습니다. 정정은 관리자가 고객 상세의
      보유장비에서 카탈로그를 연결하면 됩니다.
    </p>
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {unlinkedBanner}
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
          <p className="text-body font-medium text-text">발행된 A/S 리포트가 없습니다</p>
          <p className="text-small text-muted">
            리포트는 현장 콘솔에서 기사가 확정하면 자동으로 쌓입니다.
          </p>
        </div>
      </div>
    );
  }

  const voidedCount = rows.filter((r) => r.status === "voided").length;

  return (
    <div className="flex flex-col gap-3">
      {unlinkedBanner}
      {rows.length >= 300 && (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-muted">
          최근 300건만 표시 중입니다 — 필터·건수는 이 범위 기준입니다.
        </p>
      )}

      {/* 필터 바 — 상태는 전부 URL 쿼리 */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5 text-small text-muted">
            고객
            <input
              value={filters.customer}
              onChange={(e) => apply({ ...filters, customer: e.target.value })}
              placeholder="고객명 검색"
              className="w-40 rounded-md border border-border bg-surface px-2.5 py-1.5 text-small text-text"
            />
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-small text-muted">기간</span>
            {(Object.keys(PERIOD_LABEL) as (keyof typeof PERIOD_LABEL)[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => apply({ ...filters, period: p })}
                className={`min-h-8 rounded-full border px-3 py-1 text-micro font-semibold ${
                  filters.period === p
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-surface text-muted hover:text-text"
                }`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-small text-muted">청구</span>
            {(Object.keys(CHARGE_LABEL) as (keyof typeof CHARGE_LABEL)[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => apply({ ...filters, charge: c })}
                className={`min-h-8 rounded-full border px-3 py-1 text-micro font-semibold ${
                  filters.charge === c
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-surface text-muted hover:text-text"
                }`}
              >
                {CHARGE_LABEL[c]}
              </button>
            ))}
          </div>
          <label className="flex min-h-8 cursor-pointer items-center gap-1.5 text-small text-muted">
            <input
              type="checkbox"
              checked={filters.voided}
              onChange={(e) => apply({ ...filters, voided: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            무효 포함{voidedCount > 0 ? ` (${voidedCount})` : ""}
          </label>
        </div>
        {faultOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-small text-muted">고장 분류</span>
            {faultOptions.map((f) => {
              const on = filters.faults.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    apply({
                      ...filters,
                      faults: on ? filters.faults.filter((x) => x !== f) : [...filters.faults, f],
                    })
                  }
                  className={`min-h-8 rounded-full border px-3 py-1 text-micro font-medium ${
                    on
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border bg-surface text-muted hover:text-text"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {note && <p className="text-small text-danger">{note}</p>}
      <p className="text-small text-muted">
        {filtered.length.toLocaleString("ko-KR")}건
        {filtered.length !== rows.length && ` / 전체 ${rows.length.toLocaleString("ko-KR")}건`}
      </p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-8">
          <p className="text-body text-text">선택한 조건에 해당하는 리포트가 없습니다</p>
          <button
            type="button"
            onClick={() =>
              apply({ faults: [], period: "all", charge: "all", customer: "", voided: false })
            }
            className="text-small text-accent underline"
          >
            필터 초기화
          </button>
        </div>
      ) : (
        <>
          {/* 데스크톱 테이블 */}
          <div className="hidden overflow-x-auto rounded-md border border-border bg-surface shadow-card lg:block">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-border text-left text-micro font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2.5">번호</th>
                  <th className="px-3 py-2.5">확정일</th>
                  <th className="px-3 py-2.5">고객</th>
                  <th className="px-3 py-2.5">일련번호</th>
                  <th className="px-3 py-2.5">고장 분류</th>
                  <th className="px-3 py-2.5">조치 요약</th>
                  <th className="px-3 py-2.5 text-right">청구</th>
                  <th className="px-3 py-2.5 text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const open = expanded.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => toggleExpand(r.id)}
                        aria-expanded={open}
                        className={`cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-surface-2/50 ${
                          r.status === "voided" ? "opacity-60" : ""
                        }`}
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-text">
                          {r.seq_no}
                          {r.status === "voided" && (
                            <span className="ml-1.5 rounded-full bg-danger/10 px-2 py-0.5 text-micro font-bold text-danger">
                              무효
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted">
                          {d10(r.issued_at)}
                        </td>
                        <td className="max-w-40 truncate px-3 py-2 font-medium text-text">
                          {r.customer_name || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-muted">
                          {r.device_serial || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <FaultChips faults={r.faults} />
                        </td>
                        <td className="max-w-56 truncate px-3 py-2 text-muted">
                          {r.action_text || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <ChargeCell row={r} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <PdfCell row={r} onOpen={openPdf} loading={pdfLoading === r.id} />
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border/60 bg-surface-2/40">
                          <td colSpan={8} className="px-4 py-3">
                            <RowDetail row={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드뷰 */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {filtered.map((r) => {
              const open = expanded.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`rounded-md border border-border bg-surface p-3 shadow-card ${
                    r.status === "voided" ? "opacity-60" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(r.id)}
                    aria-expanded={open}
                    className="flex w-full flex-col gap-1.5 text-left"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-small font-semibold tabular-nums text-text">
                        {r.seq_no}
                        {r.status === "voided" && (
                          <span className="ml-1.5 rounded-full bg-danger/10 px-2 py-0.5 text-micro font-bold text-danger">
                            무효
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-micro tabular-nums text-muted">
                        {d10(r.issued_at)}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2 text-small">
                      <span className="min-w-0 truncate font-medium text-text">
                        {r.customer_name || "—"}
                      </span>
                      <span className="shrink-0 font-mono text-micro tabular-nums text-muted">
                        {r.device_serial || ""}
                      </span>
                    </span>
                    <FaultChips faults={r.faults} />
                  </button>
                  <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
                    <ChargeCell row={r} />
                    <PdfCell row={r} onOpen={openPdf} loading={pdfLoading === r.id} />
                  </div>
                  {open && (
                    <div className="mt-2 border-t border-border/60 pt-2">
                      <RowDetail row={r} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
