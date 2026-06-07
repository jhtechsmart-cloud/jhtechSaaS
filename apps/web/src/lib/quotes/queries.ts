import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 의뢰 한 건의 견적 목록(최신 버전 먼저). RLS quotes_select가 행 스코프 강제.
// 금액은 numeric → supabase-js가 문자열로 반환(표시 시 포맷).
export type QuoteListItem = {
  id: string;
  quote_no: string;
  version: number;
  status: string;
  supply_price: string;
  tax_price: string;
  total: string;
  created_at: string;
};

// 견적 단건 — 상세·재발행 프리필용. RLS quotes_select가 행 스코프 강제.
export type QuoteDetail = {
  id: string;
  application_id: string;
  quote_no: string;
  version: number;
  status: string;
  items: unknown;
  options: unknown;
  supply_price: string;
  tax_price: string;
  total: string;
  created_at: string;
  issued_at: string | null;
};

export async function getQuote(id: string): Promise<QuoteDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, application_id, quote_no, version, status, items, options, supply_price, tax_price, total, created_at, issued_at",
    )
    .eq("id", id)
    .single();
  if (error) {
    if (error.code !== "PGRST116") console.error("[quotes.get] 조회 실패", error);
    return null;
  }
  return data as QuoteDetail;
}

export async function listQuotesForApplication(applicationId: string): Promise<QuoteListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, quote_no, version, status, supply_price, tax_price, total, created_at")
    .eq("application_id", applicationId)
    .order("version", { ascending: false });
  if (error) {
    console.error("[quotes.list] 조회 실패", error);
    return [];
  }
  return (data ?? []) as QuoteListItem[];
}
