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
  company, status, seqNo, version, quoteNo, assigneeName, validity, total, issuedAtLabel, unregistered,
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
  // 미등록 고객(company_id=null) 여부 — amber 배지로 표시
  unregistered?: boolean;
}) {
  return (
    // 라운드 카드 + 스틸블루→네이비 그라데이션. 풀블리드 플랫 다크보다 가볍고 세련된 느낌.
    <div className="mb-6 overflow-hidden rounded-xl bg-gradient-to-br from-[#27507c] via-[#173255] to-[#0e2440] px-6 py-5 text-white shadow-sm">
      <div className="flex items-baseline gap-3">
        {version != null && <span className="text-micro font-medium tracking-wide text-white/55">QUOTE · V{version}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-h1 font-semibold">{company}</h1>
        <ApplicationStatusBadge status={status} />
        {unregistered && (
          <span className="shrink-0 rounded-sm bg-amber-400/20 px-1.5 py-0.5 text-micro font-medium text-amber-300">
            미등록 고객
          </span>
        )}
        {seqNo && <span className="font-mono tabular-nums text-small text-white/70">{seqNo}</span>}
        {issuedAtLabel && <span className="text-small text-white/60">· {issuedAtLabel}</span>}
      </div>
      {quoteNo && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/15 pt-4 md:grid-cols-4">
          {/* 견적번호·담당자·유효기간 값은 작게(compact), 합계금액만 강조 유지 */}
          <Stat label="견적번호" value={quoteNo} mono compact />
          <Stat label="담당자" value={assigneeName ?? "미배정"} compact />
          <Stat label="유효기간" value={validityLabel(validity)} compact />
          <Stat label="합계금액" value={total ? won(total) : "-"} gold mono />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono, gold, compact }: { label: string; value: string; mono?: boolean; gold?: boolean; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-micro text-white/55">{label}</div>
      <div className={`truncate font-semibold ${compact ? "text-body" : "text-h2"} ${gold ? "text-amber-300" : "text-white"} ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </div>
    </div>
  );
}
