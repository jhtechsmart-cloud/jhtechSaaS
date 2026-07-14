import { normalizeBizNo } from "@jhtechsaas/shared";
import { normalizeCompanyName } from "@/lib/customers/validation";

// 견적요청 ↔ 고객 마스터 대조 결과.
// linked = 이미 연결됨(applications.company_id) / biz_no = 사업자번호 일치(연결 제안)
// name_only = 회사명(정규화)만 일치(오타·중복 확인 필요) / null = 매치 없음.
export type CompanyMatchKind = "linked" | "biz_no" | "name_only" | null;
export type CompanyLite = { id: string; name: string; biz_no: string | null };
export type CompanyMatch = { kind: CompanyMatchKind; companyId: string | null };

// 우선순위: 연결됨 > 사업자번호 일치 > 회사명(정규화) 일치.
// companies.biz_no는 숫자 정규화 저장이 규약이라 입력 쪽만 정규화해 비교한다.
export function matchCompany(
  app: { company: string | null; biz_no: string | null; company_id: string | null },
  companies: CompanyLite[],
): CompanyMatch {
  if (app.company_id) return { kind: "linked", companyId: app.company_id };
  const digits = normalizeBizNo(app.biz_no ?? "");
  if (digits) {
    const hit = companies.find((c) => c.biz_no === digits);
    if (hit) return { kind: "biz_no", companyId: hit.id };
  }
  const n = normalizeCompanyName(app.company ?? "");
  if (n) {
    const hit = companies.find((c) => normalizeCompanyName(c.name) === n);
    if (hit) return { kind: "name_only", companyId: hit.id };
  }
  return { kind: null, companyId: null };
}

// ── 필드별 선택 교정용 값 비교 ────────────────────────────────────────────────
// 교정 대상 필드(요청 컬럼명 기준) — 액션의 zod 화이트리스트와 단일 출처 공유.
export const RESOLVABLE_FIELDS = ["company", "ceo", "biz_no", "phone", "email", "address"] as const;
export type ResolvableField = (typeof RESOLVABLE_FIELDS)[number];
export type CustomerFieldDiff = {
  field: ResolvableField;
  label: string;
  appValue: string; // 요청(의뢰) 입력값
  companyValue: string; // 고객DB 값
};

const FIELD_DEFS: { field: ResolvableField; label: string; companyKey: string; normalize: (v: string) => string }[] = [
  { field: "company", label: "회사명", companyKey: "name", normalize: normalizeCompanyName },
  { field: "ceo", label: "대표자", companyKey: "ceo", normalize: (v) => v.trim() },
  { field: "biz_no", label: "사업자번호", companyKey: "biz_no", normalize: (v) => normalizeBizNo(v) },
  { field: "phone", label: "연락처", companyKey: "phone", normalize: (v) => v.replace(/\D/g, "") },
  { field: "email", label: "이메일", companyKey: "email", normalize: (v) => v.trim().toLowerCase() },
  { field: "address", label: "주소", companyKey: "address", normalize: (v) => v.trim() },
];

// 요청 입력값과 고객DB 값이 (정규화 후) 다른 필드만 나열 — 연결 모달의 교정 행.
// 양쪽 다 빈 필드는 차이가 아니다. 한쪽만 빈 경우는 차이로 포함(채울지 선택하게).
export function diffCustomerFields(
  app: Record<ResolvableField, string | null>,
  company: Record<string, string | null>,
): CustomerFieldDiff[] {
  const out: CustomerFieldDiff[] = [];
  for (const def of FIELD_DEFS) {
    const a = (app[def.field] ?? "").trim();
    const c = (company[def.companyKey] ?? "").trim();
    if (a === "" && c === "") continue;
    if (def.normalize(a) === def.normalize(c)) continue;
    out.push({ field: def.field, label: def.label, appValue: a, companyValue: c });
  }
  return out;
}
