import { ApplicationStatusBadge } from "@/lib/application-status";
import type { ApplicationStatus } from "@/lib/customers/history";
import { VALID_DAYS, type QuoteValidity } from "@/lib/quotes/banner";

const won = (s: string) => `₩${Number(s).toLocaleString("ko-KR")}`;

// 유효기간 라벨 — "07.09까지(30일)" (만료 MM.DD + 기간). 미발행이면 안내문.
function validityLabel(validity: QuoteValidity | null): string {
  if (!validity) return "발행 시 시작";
  const mmdd = validity.validUntilLabel.slice(5).replace("-", "."); // 2026-07-09 → 07.09
  return `${mmdd}까지(${VALID_DAYS}일)`;
}

// 네이비 히어로 — 견적 식별·상태 + 4스탯. 견적 없으면 quote=null로 4스탯 숨김.
export function QuoteHero({
  company, status, seqNo, version, quoteNo, assigneeName, validity, total, issuedAtLabel, unregistered, preview,
}: {
  company: string;
  status: ApplicationStatus;
  seqNo: string | null;
  version: number | null;
  quoteNo: string | null;
  assigneeName: string | null;
  validity: QuoteValidity | null;
  total: string | null;
  issuedAtLabel: string | null;
  // 미등록 고객(company_id=null) 여부 — 코랄 배지로 표시
  unregistered?: boolean;
  // 미발행(견적 없음) — 요청 장비 기반 예상치 표시
  preview?: boolean;
}) {
  return (
    // 라이트 민트 테마(2026-06-12): 네이비 그라데이션 → 흰 카드 + 파인 헤딩.
    <div className="mb-6 overflow-hidden rounded-xl border border-border bg-surface px-6 py-5 shadow-card">
      <div className="flex items-baseline gap-3">
        {version != null && <span className="text-micro font-bold uppercase tracking-[.08em] text-faint">QUOTE · V{version}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-h1 font-extrabold tracking-tight text-accent-2">{company}</h1>
        <ApplicationStatusBadge status={status} />
        {unregistered && (
          <span className="shrink-0 rounded-full bg-coral-soft px-2 py-0.5 text-micro font-semibold text-coral-text">
            미등록 고객
          </span>
        )}
        {seqNo && <span className="font-mono tabular-nums text-small text-muted">{seqNo}</span>}
        {issuedAtLabel && <span className="text-small text-muted">· {issuedAtLabel}</span>}
      </div>
      {(quoteNo || preview) && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-row-line pt-4 md:grid-cols-4">
          {/* 견적번호·담당자·유효기간 값은 작게(compact), 합계금액만 강조 유지. 미발행이면 예상치. */}
          <Stat label="견적번호" value={quoteNo ?? "미발행"} mono compact />
          <Stat label="담당자" value={assigneeName ?? "미배정"} compact />
          <Stat label="유효기간" value={validityLabel(validity)} compact />
          <Stat label={preview ? "예상 합계" : "합계금액"} value={total ? won(total) : "-"} gold mono />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono, gold, compact }: { label: string; value: string; mono?: boolean; gold?: boolean; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-micro text-muted">{label}</div>
      <div
        className={`truncate font-bold ${compact ? "text-body" : "text-h2"} ${mono ? "font-mono tabular-nums" : ""} ${
          gold ? "-mx-2 inline-block rounded-md bg-mint px-2 py-0.5 text-accent-2" : "text-text"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
