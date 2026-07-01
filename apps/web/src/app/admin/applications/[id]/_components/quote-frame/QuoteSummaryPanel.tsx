import Link from "next/link";
import { VALID_DAYS } from "@/lib/quotes/banner";
import type { LastSend } from "@/lib/quotes/last-send";
import { QuoteBreakdown, type QuoteLineRow as LineRow } from "@/app/admin/_components/QuoteBreakdown";
import { QuotePdfButton } from "./QuotePdfButton";
import { SendQuoteEmailModal } from "./SendQuoteEmailModal";

// 우측 sticky 요약 패널 — 소계(+서브 라인)·합계·발급정보·발송정보. 메일발송은 비활성(후속).
export function QuoteSummaryPanel({
  applicationId, quoteId, quoteNo, statusLabel, equipmentSubtotal, optionSubtotal, items, options, total,
  issuedAtLabel, validUntilLabel, assigneeName, email, phone, pdfReady, canReissue, preview, canWrite,
  isIssued, canEmail, emailStatus, lastSend, companyName,
  canReleaseOrder, hasIssuedQuote,
}: {
  applicationId: string; quoteId: string | null; quoteNo: string | null; statusLabel: string;
  equipmentSubtotal: number; optionSubtotal: number; items: LineRow[]; options: LineRow[]; total: string;
  issuedAtLabel: string | null; validUntilLabel: string | null; assigneeName: string | null;
  email: string | null; phone: string | null; pdfReady: boolean; canReissue: boolean;
  preview?: boolean; // 미발행 — 예상치 + '견적 작성' 유도
  canWrite?: boolean; // quotes.write — 견적 작성 버튼 노출
  isIssued?: boolean; // 발행 견적 여부(PDF 버튼 활성 조건)
  canEmail?: boolean; // email.send — 메일 발송 버튼 노출
  emailStatus?: string | null; // 현재 견적의 최신 발송 상태(sent/sending/pending/failed/null)
  lastSend?: LastSend | null; // 직전 발송 정보(재발송 모달 안내용)
  companyName?: string | null; // 메일 프리필용 신청기업명
  canReleaseOrder?: boolean; // release_orders.write — 출고의뢰서 버튼 노출
  hasIssuedQuote?: boolean; // 발행 견적 존재 — 출고의뢰서 진입 전제
}) {
  return (
    // sticky는 부모 컬럼이 담당(영업일지와 함께 한 덩어리로 고정 → 겹침 방지).
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* 컬러 타이틀바 — 히어로와 같은 톤. 견적번호 + 제목. */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0">
          <div className="text-micro font-bold uppercase tracking-[.08em] text-faint">QUOTE SUMMARY</div>
          <div className="truncate font-mono tabular-nums text-small font-bold text-accent-2">{quoteNo ?? "미발행"}</div>
        </div>
        <span className="shrink-0 rounded-full bg-mint px-2 py-0.5 text-micro font-semibold text-accent-2">{statusLabel}</span>
      </div>
      <div className="p-4">
        <QuoteBreakdown
          equipmentSubtotal={equipmentSubtotal}
          optionSubtotal={optionSubtotal}
          items={items}
          options={options}
          total={total}
          totalLabel={preview ? "예상 합계 금액" : "합계 금액"}
          totalNote={`VAT 별도${preview ? " · 견적 작성 전" : ` · 유효 ${VALID_DAYS}일`}`}
        />
        {preview ? (
          /* 미발행 — 견적 작성 유도(요청 장비로 미리 채운 상태) */
          canWrite ? (
            <Link href={`/admin/applications/${applicationId}/quote/new`} className="block rounded-md bg-accent py-2 text-center text-small font-medium text-white">견적 작성</Link>
          ) : (
            <span className="block rounded-md bg-surface-2 py-2 text-center text-small font-medium text-muted">견적 작성 권한 없음</span>
          )
        ) : (
          /* 액션 3종: 수정 / 견적서 확인(PDF) / 메일 발송. 발행 시 메일 자동발송 안 함 → 메일은 버튼으로만. */
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              {canReissue && (
                <Link href={`/admin/applications/${applicationId}/quote/new?from=${quoteId}`} className="flex-1 rounded-md border border-border py-2 text-center text-small font-medium text-text">수정</Link>
              )}
              {/* 발행본만 PDF가 생성된다. 임시저장(draft)은 생성 자체가 없으므로 '발행 후 확인' 안내
                  (대기 커서·생성중 스피너 금지 — 영원히 동작 중처럼 보이는 오해 방지). */}
              {quoteId && isIssued ? (
                <QuotePdfButton quoteId={quoteId} initialReady={pdfReady} />
              ) : (
                <span className="flex-1 cursor-not-allowed rounded-md bg-surface-2 py-2 text-center text-small font-medium text-muted">
                  {quoteId ? "견적서 · 발행 후 확인" : "견적서 확인"}
                </span>
              )}
            </div>
            {/* 메일 발송 — 발행본 + email.send 권한이면 발송 모달, 아니면 안내 비활성. */}
            {quoteId && pdfReady && canEmail ? (
              <SendQuoteEmailModal
                quoteId={quoteId}
                defaultTo={email ?? ""}
                quoteNo={quoteNo ?? ""}
                companyName={companyName ?? null}
                emailStatus={emailStatus ?? null}
                lastSend={lastSend ?? null}
              />
            ) : (
              <span className="cursor-not-allowed rounded-md border border-dashed border-border py-2 text-center text-small font-medium text-muted">
                {!pdfReady ? "메일 발송 · 발행 후 가능" : "메일 발송 · 권한 없음"}
              </span>
            )}
          </div>
        )}
        {/* 출고의뢰서 — 발행 견적이 있으면(보던 버전 무관) 노출. 견적 문서(수정·PDF·메일)와 결이 달라 구분선 아래 별도 산출물로. */}
        {canReleaseOrder && hasIssuedQuote && (
          <div className="mt-2 border-t border-border pt-2">
            <Link
              href={`/admin/applications/${applicationId}/release-order`}
              className="block rounded-md border border-accent py-2 text-center text-small font-semibold text-accent hover:bg-mint"
              data-testid="release-order-link"
            >
              출고의뢰서
            </Link>
          </div>
        )}
        <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-small">
          <Meta label="발급일" value={issuedAtLabel ?? "미발행"} />
          <Meta label="유효기간" value={validUntilLabel ? `${validUntilLabel} (${VALID_DAYS}일)` : "발행 시 시작"} />
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
function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex justify-between"><span className="text-muted">{label}</span><span className={`text-text ${mono ? "font-mono tabular-nums" : ""}`}>{value}</span></div>;
}
