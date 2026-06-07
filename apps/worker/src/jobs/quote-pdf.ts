import type { SupabaseClient } from "@supabase/supabase-js";
import { buildQuotePdf } from "./render-quote-pdf";

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

  const pdf = await buildQuotePdf(quote);
  const path = `${quoteId}.pdf`;
  const up = await supabase.storage
    .from("quote-pdfs")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`PDF 업로드 실패: ${up.error.message}`);

  const { error: uErr } = await supabase.from("quotes").update({ pdf_url: path }).eq("id", quoteId);
  if (uErr) throw new Error(`pdf_url 기록 실패: ${uErr.message}`);
}
