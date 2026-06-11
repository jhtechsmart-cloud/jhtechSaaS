import { NextResponse } from "next/server";
import { z } from "zod";
import { requireQuotesWrite } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 견적서 PDF 열람 — 클릭 시점에 서명URL을 새로 발급해 리다이렉트.
// 서명URL(TTL 10분)을 화면 href에 박제하면 페이지를 오래 열어두고 클릭할 때 만료 에러가 난다.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireQuotesWrite();
  if (access.status === "forbidden") return new Response("권한이 없습니다", { status: 403 });

  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return new Response("잘못된 요청입니다", { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("pdf_url, status")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[quotes.pdfRoute]", error);
  if (!quote || quote.status !== "issued" || !quote.pdf_url) {
    return new Response("견적서 PDF가 아직 없습니다", { status: 404 });
  }

  const { data, error: signErr } = await supabase.storage
    .from("quote-pdfs")
    .createSignedUrl(quote.pdf_url, 600);
  if (signErr || !data?.signedUrl) {
    console.error("[quotes.pdfRoute] 서명URL 생성 실패", signErr);
    return new Response("PDF 링크 생성에 실패했습니다", { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
