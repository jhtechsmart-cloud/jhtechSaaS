import { z } from "zod";
import { TAX_INVOICE_STATUSES } from "@jhtechsaas/shared";

// #285 #C — 관리부 완료 모달 입력. RPC(complete_service_report)와 같은 규칙을 클라에서 먼저 인라인 오류로.
// 발행함(invoiced)이면 발행일 필수, 불필요(not_required)면 날짜는 null로 정규화. 메모 ≤500.
export const completeReportSchema = z
  .object({
    tax_invoice_status: z.enum(TAX_INVOICE_STATUSES, { message: "세금계산서 발행 여부를 선택하세요" }),
    tax_invoice_date: z
      .string()
      .trim()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/, "날짜 형식(YYYY-MM-DD)")
      .transform((v) => (v ? v : null)),
    memo: z.string().trim().max(500, "메모는 500자 이내입니다"),
  })
  .superRefine((v, ctx) => {
    if (v.tax_invoice_status === "invoiced" && !v.tax_invoice_date) {
      ctx.addIssue({ code: "custom", path: ["tax_invoice_date"], message: "발행일을 입력하세요" });
    }
  })
  .transform((v) => ({ ...v, tax_invoice_date: v.tax_invoice_status === "invoiced" ? v.tax_invoice_date : null }));

export type CompleteReportInput = z.input<typeof completeReportSchema>;
export type CompleteReportData = z.output<typeof completeReportSchema>;
