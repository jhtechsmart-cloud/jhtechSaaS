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
