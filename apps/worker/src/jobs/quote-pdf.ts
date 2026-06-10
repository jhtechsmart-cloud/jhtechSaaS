import type { SupabaseClient } from "@supabase/supabase-js";
import { numberToKoreanAmount } from "@jhtechsaas/shared";
import { buildQuotePdf } from "./render-quote-pdf";
import type { QuoteHtmlData } from "./quote-html";

// quote_pdf 잡 처리 — 견적 로드 → PDF 생성 → quote-pdfs 버킷 업로드 → quotes.pdf_url 기록.
// pdf_url 기록은 issued 행에도 허용(트리거의 pdf_url 예외 경로). service_role이라 RLS 우회.
export async function processQuotePdfJob(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const quoteId = typeof payload.quote_id === "string" ? payload.quote_id : null;
  if (!quoteId) throw new Error("payload.quote_id 누락");

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, quote_no, supply_price, tax_price, total")
    .eq("id", quoteId)
    .single();
  if (error || !quote) throw new Error(`견적 조회 실패: ${error?.message ?? "없음"}`);

  // ⚠️ 임시 어댑터 — 견적 행 → QuoteHtmlData 최소 매핑으로 파이프라인(발행→잡→PDF→pdf_url)을 유지한다.
  //   장비/옵션/사양 라인 상세 로드와 폰트·도장·배너 실자산 임베드(data URI)는 후속 태스크에서 채운다.
  const supplyPrice = Number(quote.supply_price ?? 0);
  const htmlData: QuoteHtmlData = {
    quoteNo: String(quote.quote_no ?? ""),
    issuedDateLabel: "",
    assigneeName: "",
    assigneePhone: null,
    recipient: "",
    supplyPrice,
    koreanAmount: numberToKoreanAmount(supplyPrice),
    items: [],
    includedOptions: [],
    extraOptions: [],
    specGroups: [],
    notes: [],
    bannerTopDataUri: null,
    bannerBottomDataUri: null,
    stampDataUri: "",
    fontDataUri: "",
  };
  const pdf = await buildQuotePdf(htmlData);
  const path = `${quoteId}.pdf`;
  const up = await supabase.storage
    .from("quote-pdfs")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`PDF 업로드 실패: ${up.error.message}`);

  const { error: uErr } = await supabase.from("quotes").update({ pdf_url: path }).eq("id", quoteId);
  if (uErr) throw new Error(`pdf_url 기록 실패: ${uErr.message}`);
}
