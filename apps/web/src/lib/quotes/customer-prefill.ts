import type { QuoteCustomer } from "./customer-search";

// 선택한 고객 → 수기견적 폼 필드. null은 빈 문자열로(controlled input), companyId는 연결 보존.
export interface ManualQuoteCustomerFields {
  company: string;
  ceo: string;
  phone: string;
  email: string;
  companyId: string;
}

export function customerToFormFields(c: QuoteCustomer): ManualQuoteCustomerFields {
  return {
    company: c.name ?? "",
    ceo: c.ceo ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    companyId: c.id,
  };
}
