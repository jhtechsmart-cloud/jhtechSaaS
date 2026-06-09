import { ApplicationStatusBadge } from "@/lib/application-status";
import type { ApplicationStatus } from "@/lib/customers/history";
import type { QuoteValidity } from "@/lib/quotes/banner";

const won = (s: string) => `₩${Number(s).toLocaleString("ko-KR")}`;

// 네이비 히어로 — 견적 식별·상태 + 4스탯. 견적 없으면 quote=null로 4스탯 숨김.
export function QuoteHero({
  company, status, seqNo, version, quoteNo, assigneeName, validity, total, issuedAtLabel,
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
}) {
  return (
    <div className="-mx-6 -mt-6 mb-6 bg-[var(--color-accent-deep,#0B1F3A)] px-6 py-5 text-white">
      <div className="flex items-baseline gap-3">
        {version != null && <span className="text-micro font-medium tracking-wide text-white/60">QUOTE · V{version}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-h1 font-semibold">{company}</h1>
        <ApplicationStatusBadge status={status} />
        {seqNo && <span className="font-mono tabular-nums text-small text-white/70">{seqNo}</span>}
        {issuedAtLabel && <span className="text-small text-white/60">· {issuedAtLabel}</span>}
      </div>
      {quoteNo && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/15 pt-4 md:grid-cols-4">
          <Stat label="견적번호" value={quoteNo} mono />
          <Stat label="담당자" value={assigneeName ?? "미배정"} />
          <Stat label="유효기간" value={validity ? `15일 (~${validity.validUntilLabel.slice(5)})` : "발행 시 시작"} />
          <Stat label="합계금액" value={total ? won(total) : "-"} gold mono />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono, gold }: { label: string; value: string; mono?: boolean; gold?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-micro text-white/55">{label}</div>
      <div className={`truncate text-h2 font-semibold ${gold ? "text-amber-300" : "text-white"} ${mono ? "font-mono tabular-nums" : ""}`}>
        {value}
      </div>
    </div>
  );
}
