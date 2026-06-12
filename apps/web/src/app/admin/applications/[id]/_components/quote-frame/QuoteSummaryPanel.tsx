import Link from "next/link";
import { VALID_DAYS } from "@/lib/quotes/banner";
import { QuotePdfButton } from "./QuotePdfButton";
import { DeliverySchedule } from "./DeliverySchedule";

const won = (s: string | number) => `₩${Number(s).toLocaleString("ko-KR")}`;
type LineRow = { name: string; unitPrice: number; quantity: number };

// 우측 sticky 요약 패널 — 소계(+서브 라인)·합계·발급정보·발송정보. 메일발송은 비활성(후속).
export function QuoteSummaryPanel({
  applicationId, quoteId, quoteNo, statusLabel, equipmentSubtotal, optionSubtotal, items, options, total,
  issuedAtLabel, validUntilLabel, assigneeName, email, phone, pdfReady, canReissue, preview, canWrite,
  isIssued, deliveryDate, deliveryTime,
}: {
  applicationId: string; quoteId: string | null; quoteNo: string | null; statusLabel: string;
  equipmentSubtotal: number; optionSubtotal: number; items: LineRow[]; options: LineRow[]; total: string;
  issuedAtLabel: string | null; validUntilLabel: string | null; assigneeName: string | null;
  email: string | null; phone: string | null; pdfReady: boolean; canReissue: boolean;
  preview?: boolean; // 미발행 — 예상치 + '견적 작성' 유도
  canWrite?: boolean; // quotes.write — 견적 작성 버튼 노출
  isIssued?: boolean; // 납품 일정 입력 활성 조건(발행 견적만)
  deliveryDate?: string | null; deliveryTime?: string | null;
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
        <SubRow label="장비 소계" value={won(equipmentSubtotal)} />
        <LineList rows={items} />
        <SubRow label="옵션 소계" value={won(optionSubtotal)} />
        <LineList rows={options} emptyText="추가 옵션 없음" />
        <div className="my-3 rounded-md bg-mint px-3 py-2">
          <div className="text-micro text-muted">{preview ? "예상 합계 금액" : "합계 금액"}</div>
          <div className="font-mono tabular-nums text-h1 font-extrabold text-accent-2">{won(total)}</div>
          <div className="text-micro text-muted">VAT 별도{preview ? " · 견적 작성 전" : ` · 유효 ${VALID_DAYS}일`}</div>
        </div>
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
              {quoteId ? (
                <QuotePdfButton quoteId={quoteId} initialReady={pdfReady} />
              ) : (
                <span className="flex-1 cursor-not-allowed rounded-md bg-surface-2 py-2 text-center text-small font-medium text-muted">견적서 확인</span>
              )}
            </div>
            {/* 메일 발송 — 후속 이메일 슬라이스에서 활성화(현재 자리만) */}
            <span className="cursor-not-allowed rounded-md border border-dashed border-border py-2 text-center text-small font-medium text-muted">메일 발송 · 준비중</span>
          </div>
        )}
        <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-small">
          <Meta label="발급일" value={issuedAtLabel ?? "미발행"} />
          <Meta label="유효기간" value={validUntilLabel ? `${validUntilLabel} (${VALID_DAYS}일)` : "발행 시 시작"} />
          <Meta label="담당자" value={assigneeName ?? "미배정"} />
        </div>
        {quoteId && !preview && (
          <DeliverySchedule
            quoteId={quoteId}
            issued={!!isIssued}
            initialDate={deliveryDate ?? null}
            initialTime={deliveryTime ?? null}
            canWrite={!!canWrite}
          />
        )}
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
  return (
    <div className="flex items-center justify-between py-1 text-small">
      {/* 좌측 섹션 제목과 동일한 네이비 세로막대로 소계 제목 강조 */}
      <span className="flex items-center gap-1.5 font-medium text-text">
        <span aria-hidden className="h-3 w-0.5 shrink-0 rounded-full bg-pine" />{label}
      </span>
      <span className="font-mono tabular-nums text-text">{value}</span>
    </div>
  );
}
// 소계 아래 서브 라인 — 이름 · 단가 × 개수. 빈 목록이면 옵션만 안내문(장비는 항상 있으니 미표시).
function LineList({ rows, emptyText }: { rows: LineRow[]; emptyText?: string }) {
  if (rows.length === 0) {
    return emptyText ? <div className="mb-1 pl-2 text-micro text-muted">{emptyText}</div> : null;
  }
  return (
    <div className="mb-1 flex flex-col gap-0.5 border-l border-border pl-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-baseline justify-between gap-2 text-micro">
          <span className="min-w-0 truncate text-muted">{r.name}</span>
          <span className="shrink-0 font-mono tabular-nums text-muted">{r.unitPrice.toLocaleString("ko-KR")} × {r.quantity}</span>
        </div>
      ))}
    </div>
  );
}
function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex justify-between"><span className="text-muted">{label}</span><span className={`text-text ${mono ? "font-mono tabular-nums" : ""}`}>{value}</span></div>;
}
