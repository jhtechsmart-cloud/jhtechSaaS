import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReleaseOrdersWrite } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 출고의뢰서 PDF 열람 — 클릭 시점에 서명URL을 새로 발급해 리다이렉트(만료 박제 방지).
// 버전관리 — application id로 최신 발행본(issued, version desc) PDF 조회. 비공개 release-orders 버킷.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireReleaseOrdersWrite();
  if (access.status === "forbidden") return new Response("권한이 없습니다", { status: 403 });

  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return new Response("잘못된 요청입니다", { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: ro, error } = await supabase
    .from("release_orders")
    .select("pdf_url, status")
    .eq("application_id", id)
    .eq("status", "issued")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("[release-orders.pdfRoute]", error);
  if (!ro || ro.status !== "issued" || !ro.pdf_url) {
    return new Response("출고의뢰서 PDF가 아직 없습니다", { status: 404 });
  }

  const { data, error: signErr } = await supabase.storage
    .from("release-orders")
    .createSignedUrl(ro.pdf_url, 600);
  if (signErr || !data?.signedUrl) {
    console.error("[release-orders.pdfRoute] 서명URL 생성 실패", signErr);
    return new Response("PDF 링크 생성에 실패했습니다", { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
