import { NextResponse } from "next/server";
import { z } from "zod";
import { requireServiceReportsWrite } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 서비스 리포트 PDF 열람 — 클릭 시점에 서명URL을 새로 발급해 리다이렉트(견적서 pdf/route 패턴).
// 완료 화면의 열람은 async window.open이 아닌 일반 <a> 내비게이션이어야
// 모바일 브라우저가 사용자 제스처로 처리해 탭·히스토리가 정상 동작한다.
export async function GET(req: Request) {
  const access = await requireServiceReportsWrite();
  if (access.status === "forbidden") return new Response("권한이 없습니다", { status: 403 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!z.guid().safeParse(id).success) return new Response("잘못된 요청입니다", { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("service_reports")
    .select("pdf_url")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[serviceReports.pdfRoute]", error);
  if (!row?.pdf_url) return new Response("PDF가 아직 없습니다", { status: 404 });

  const { data, error: signErr } = await supabase.storage
    .from("service-reports")
    .createSignedUrl(row.pdf_url, 600);
  if (signErr || !data?.signedUrl) {
    console.error("[serviceReports.pdfRoute] 서명URL 생성 실패", signErr);
    return new Response("PDF 링크 생성에 실패했습니다", { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
