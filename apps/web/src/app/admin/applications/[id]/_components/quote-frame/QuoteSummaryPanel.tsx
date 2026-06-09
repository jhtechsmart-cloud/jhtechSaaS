import Link from "next/link";

const won = (s: string | number) => `₩${Number(s).toLocaleString("ko-KR")}`;

// 우측 sticky 요약 패널 — 소계·합계·발급정보·발송정보. 메일발송은 비활성(후속).
export function QuoteSummaryPanel({
  applicationId, quoteId, quoteNo, statusLabel, equipmentSubtotal, optionSubtotal, total,
  issuedAtLabel, validUntilLabel, assigneeName, email, phone, pdfUrl, canReissue,
}: {
  applicationId: string; quoteId: string; quoteNo: string; statusLabel: string;
  equipmentSubtotal: number; optionSubtotal: number; total: string;
  issuedAtLabel: string | null; validUntilLabel: string | null; assigneeName: string | null;
  email: string | null; phone: string | null; pdfUrl: string | null; canReissue: boolean;
}) {
  return (
    // sticky는 부모 컬럼이 담당(영업일지와 함께 한 덩어리로 고정 → 겹침 방지).
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* 컬러 타이틀바 — 히어로와 같은 톤. 견적번호 + 제목. */}
      <div className="flex items-center justify-between bg-gradient-to-br from-[#27507c] to-[#0e2440] px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="text-micro font-medium tracking-wide text-white/55">QUOTE SUMMARY</div>
          <div className="truncate font-mono tabular-nums text-small font-semibold">{quoteNo}</div>
        </div>
        <span className="shrink-0 rounded-sm bg-white/15 px-2 py-0.5 text-micro font-medium text-white">{statusLabel}</span>
      </div>
      <div className="p-4">
        <SubRow label="장비 소계" value={won(equipmentSubtotal)} />
        <SubRow label="옵션 소계" value={won(optionSubtotal)} />
        <div className="my-3 rounded-md bg-amber-50 px-3 py-2">
          <div className="text-micro text-muted">합계 금액</div>
          <div className="font-mono tabular-nums text-h1 font-bold text-amber-700">{won(total)}</div>
          <div className="text-micro text-muted">VAT 별도 · 유효 15일</div>
        </div>
        <div className="flex gap-2">
          {canReissue && (
            <Link href={`/admin/applications/${applicationId}/quote/new?from=${quoteId}`} className="flex-1 rounded-md border border-border py-2 text-center text-small font-medium text-text">수정</Link>
          )}
          {pdfUrl ? (
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="flex-1 rounded-md bg-accent py-2 text-center text-small font-medium text-white">견적서 출력</a>
          ) : (
            <span className="flex-1 cursor-not-allowed rounded-md bg-surface-2 py-2 text-center text-small font-medium text-muted">견적서 출력</span>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-small">
          <Meta label="발급일" value={issuedAtLabel ?? "미발행"} />
          <Meta label="유효기간" value={validUntilLabel ? `${validUntilLabel} (15일)` : "발행 시 시작"} />
          <Meta label="담당자" value={assigneeName ?? "미배정"} />
        </div>
        <div className="mt-3 border-t border-border pt-3 text-small">
          <div className="mb-1 text-micro text-muted">발송 정보</div>
          <Meta label="이메일" value={email ?? "-"} />
          <Meta label="연락처" value={phone ?? "-"} mono />
        </div>
      </div>
    </section>
  );
}
function SubRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between py-1 text-small"><span className="text-muted">{label}</span><span className="font-mono tabular-nums text-text">{value}</span></div>;
}
function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex justify-between"><span className="text-muted">{label}</span><span className={`text-text ${mono ? "font-mono tabular-nums" : ""}`}>{value}</span></div>;
}
