// 수기 견적용 고객 검색 — 순수 쿼리빌드 + 표시 타입.
// 액션(actions.ts searchCustomersForQuoteAction)이 이 OR 절로 companies를 조회한다.

// 견적 폼 프리필에 필요한 최소 고객 정보.
export interface QuoteCustomer {
  id: string;
  name: string;
  ceo: string | null;
  phone: string | null; // phone ?? mobile 통합(대표 연락처)
  email: string | null;
  bizNo: string | null;
}

// PostgREST `.or()` 절 생성 — 업체명·대표자(ilike) + 숫자검색(biz_no·phone·mobile, 하이픈 무시).
// 특수문자(콤마·괄호·% _ * \\)는 PostgREST or 구문/LIKE를 깨므로 제거. 빈 쿼리는 null(검색 안 함).
export function buildCompanySearchOr(q: string): string | null {
  const cleaned = q.replace(/[,()%_*\\]/g, "").trim();
  if (cleaned.length < 1) return null;
  const parts = [`name.ilike.%${cleaned}%`, `ceo.ilike.%${cleaned}%`];
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length >= 3) {
    parts.push(`biz_no.ilike.%${digits}%`);
    parts.push(`phone.ilike.%${digits}%`);
    parts.push(`mobile.ilike.%${digits}%`);
  }
  return parts.join(",");
}

// companies 행 → QuoteCustomer. 대표 연락처는 phone 우선, 없으면 mobile.
export function rowToQuoteCustomer(row: {
  id: string;
  name: string;
  ceo: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  biz_no: string | null;
}): QuoteCustomer {
  return {
    id: row.id,
    name: row.name,
    ceo: row.ceo,
    phone: row.phone ?? row.mobile,
    email: row.email,
    bizNo: row.biz_no,
  };
}
