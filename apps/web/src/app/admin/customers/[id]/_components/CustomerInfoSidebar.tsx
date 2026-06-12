import { Phone, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { displayValue, pickPrimaryContact, splitChips } from "@/lib/customers/detail-display";
import { formatPhone } from "@jhtechsaas/shared";

// 좌측 정보 사이드바(330px) — 주 연락처(네이비 강조) + 연락처/사업장/장부 카드 3종.
// 값이 있는 필드만 시각적으로 튀도록, 빈 값은 "미입력"을 아주 흐리게.

export type CompanyDetailFields = {
  manager: string | null;
  phone: string | null; // 레거시 연락처(신청→고객 등록 RPC·폼이 사용)
  phone1: string | null;
  phone2: string | null;
  mobile: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  biz_type: string | null;
  biz_item: string | null;
  address_actual1: string | null;
  address_actual2: string | null;
  ledger_name: string | null;
  ledger_no: number | null;
};

// 필드 한 행 — 라벨(96px 고정·흐림) / 값(우정렬·bold). 빈 값 = "미입력" 흐림.
// wrap: 주소·장부명처럼 긴 값은 라벨 아래 전체 폭으로 여러 줄 표시(말줄임으로 내용이 잘리지 않게).
function FieldRow({ label, value, mono, wrap }: { label: string; value: string | null; mono?: boolean; wrap?: boolean }) {
  const v = displayValue(value);
  if (wrap) {
    return (
      <div className="border-b border-dashed border-border py-2 last:border-b-0">
        <div className="text-small text-muted">{label}</div>
        {v ? (
          <div className={`mt-0.5 break-words text-body font-semibold leading-snug text-text ${mono ? "font-mono tabular-nums" : ""}`}>
            {v}
          </div>
        ) : (
          <div className="mt-0.5 text-small text-empty">미입력</div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border py-2 last:border-b-0">
      <span className="w-24 shrink-0 text-small text-muted">{label}</span>
      {v ? (
        <span
          title={v}
          className={`min-w-0 truncate text-right text-body font-semibold text-text ${mono ? "font-mono tabular-nums" : ""}`}
        >
          {v}
        </span>
      ) : (
        <span className="text-right text-small text-empty">미입력</span>
      )}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 py-4 shadow-card">
      <CardContent className="px-4">
        <h3 className="mb-1 text-small font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {children}
      </CardContent>
    </Card>
  );
}

// 주 연락처 — 유일하게 어두운 네이비 강조 카드. 전화1→휴대폰→전화2 폴백.
export function PrimaryContactCard({ c }: { c: CompanyDetailFields }) {
  const { phone, email, emailSafe } = pickPrimaryContact(c);
  return (
    <Card className="gap-0 border-0 bg-pine py-4 text-white shadow-card">
      <CardContent className="px-4">
        <h3 className="mb-2 text-small font-semibold uppercase tracking-wide text-white/55">주 연락처</h3>
        {phone || email ? (
          <>
            {phone ? (
              <p className="font-mono text-[20px] font-bold tabular-nums leading-tight">{formatPhone(phone)}</p>
            ) : (
              <p className="text-body text-white/60">전화 미입력</p>
            )}
            {email && <p className="mt-1 truncate text-small text-white/75">{email}</p>}
            <div className="mt-3 flex gap-2">
              {phone && (
                <a
                  href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/12 py-2 text-small font-medium text-white hover:bg-white/20"
                >
                  <Phone className="size-3.5" aria-hidden /> 전화
                </a>
              )}
              {emailSafe && email && (
                <a
                  href={`mailto:${email}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/12 py-2 text-small font-medium text-white hover:bg-white/20"
                >
                  <Mail className="size-3.5" aria-hidden /> 이메일
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="py-2 text-body text-white/60">연락처 미입력</p>
        )}
      </CardContent>
    </Card>
  );
}

// 나머지 정보 카드 3종 — 연락처 / 사업장 / 장부·회계.
export function CustomerInfoCards({ c }: { c: CompanyDetailFields }) {
  const chips = splitChips(c.biz_type);
  const actual1 = displayValue(c.address_actual1);
  const actual2 = displayValue(c.address_actual2);
  return (
    <>
      <InfoCard title="연락처">
        <FieldRow label="담당자" value={c.manager} />
        <FieldRow label="연락처(대표)" value={c.phone ? formatPhone(c.phone) : null} mono />
        <FieldRow label="전화2" value={c.phone2 ? formatPhone(c.phone2) : null} mono />
        <FieldRow label="휴대폰" value={c.mobile ? formatPhone(c.mobile) : null} mono />
        <FieldRow label="팩스" value={c.fax ? formatPhone(c.fax) : null} mono />
      </InfoCard>

      <InfoCard title="사업장">
        <FieldRow label="주소(사업장)" value={c.address} wrap />
        <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border py-2">
          <span className="w-24 shrink-0 text-small text-muted">업태</span>
          {chips.length > 0 ? (
            <span className="flex flex-wrap justify-end gap-1">
              {chips.map((chip) => (
                <Badge key={chip} variant="secondary" className="text-micro">{chip}</Badge>
              ))}
            </span>
          ) : (
            <span className="text-small text-empty">미입력</span>
          )}
        </div>
        <FieldRow label="업종(종목)" value={c.biz_item} wrap />
        {actual1 || actual2 ? (
          <>
            <FieldRow label="실제주소1" value={actual1} wrap />
            <FieldRow label="실제주소2" value={actual2} wrap />
          </>
        ) : (
          // 둘 다 비었으면 1행으로 합침(스펙)
          <FieldRow label="실제주소" value={null} />
        )}
      </InfoCard>

      <InfoCard title="장부·회계">
        <FieldRow label="장부명" value={c.ledger_name} wrap />
        <FieldRow label="장부번호(구 시스템)" value={c.ledger_no != null ? String(c.ledger_no) : null} mono />
      </InfoCard>
    </>
  );
}
