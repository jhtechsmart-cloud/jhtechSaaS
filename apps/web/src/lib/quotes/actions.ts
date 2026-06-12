"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireQuotesWrite } from "@/lib/auth/guard";
import {
  createManualQuotePayloadSchema,
  createQuotePayloadSchema,
  type CreateManualQuotePayload,
  type CreateQuotePayload,
} from "@/lib/quotes/schema";

export type QuoteActionResult = { error: string } | null;

// 견적서 PDF 서명URL 조회 — 발행 직후 워커가 PDF를 비동기로 만들므로, 상세 화면이
// pdf_url이 생길 때까지 폴링해 새로고침 없이 '견적서 확인' 버튼을 활성화한다.
// 비공개 quote-pdfs 버킷이라 서명URL로만 접근(없으면 null).
export async function getQuotePdfUrl(quoteId: string): Promise<string | null> {
  const access = await requireQuotesWrite();
  if (access.status === "forbidden") return null;
  if (!z.guid().safeParse(quoteId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("pdf_url, status")
    .eq("id", quoteId)
    .single();
  if (!quote || quote.status !== "issued" || !quote.pdf_url) return null;
  const { data } = await supabase.storage.from("quote-pdfs").createSignedUrl(quote.pdf_url, 600);
  return data?.signedUrl ?? null;
}

// 납품 일정 저장 — 발행(issued) 견적만. 동결 트리거의 예외 컬럼(견적 내용이 아닌 운영값).
export async function setQuoteDeliveryAction(
  quoteId: string,
  values: { date: string | null; time: string | null },
): Promise<QuoteActionResult> {
  const access = await requireQuotesWrite();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.guid().safeParse(quoteId).success) return { error: "잘못된 요청입니다." };
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  });
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: "날짜·시간 형식을 확인하세요." };
  // 시간만 있고 날짜가 없는 입력은 무의미 → 거부
  if (parsed.data.time && !parsed.data.date) return { error: "납품일을 먼저 선택하세요." };

  const supabase = await createSupabaseServerClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("status, application_id")
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "견적을 찾을 수 없습니다." };
  if (quote.status !== "issued") return { error: "발행된 견적에만 납품 일정을 입력할 수 있습니다." };

  const { error } = await supabase
    .from("quotes")
    .update({ delivery_date: parsed.data.date, delivery_time: parsed.data.time })
    .eq("id", quoteId);
  if (error) {
    console.error("[quotes.setDelivery]", error);
    return { error: "납품 일정 저장에 실패했습니다." };
  }
  revalidatePath(`/admin/applications/${quote.application_id}`);
  return null;
}

// 견적 생성 — 기존 의뢰 위에. 금액은 서버 RPC가 items·options로 재계산(클라 금액 신뢰 안 함).
// ⚠️ Server Action은 직접 POST로도 도달 가능 → 가드를 액션에서도 재호출.
export async function createQuoteAction(
  applicationId: string,
  payload: CreateQuotePayload,
): Promise<QuoteActionResult> {
  const access = await requireQuotesWrite();
  if (access.status === "forbidden") return { error: "견적 작성 권한이 없습니다." };
  if (!z.guid().safeParse(applicationId).success) return { error: "잘못된 요청입니다." };
  const parsed = createQuotePayloadSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_quote", {
    p_application_id: applicationId,
    p_items: v.items,
    p_options: v.options,
    p_status: v.status,
  });
  if (error) {
    console.error("[quotes.create] RPC 실패", error);
    return { error: "견적을 저장하지 못했습니다." };
  }

  // 의뢰관리 2분할 셸의 목록(layout 서버 조회)까지 갱신 — 저장이 의뢰 상태를 전이하므로
  // layout 단위로 revalidate해야 좌측 목록 배지가 새 상태로 반영된다(detail 경로만 revalidate하면 목록 stale).
  revalidatePath("/admin/applications", "layout");
  redirect(`/admin/applications/${applicationId}`);
}

// 수기 견적 — 의뢰 없이 회사명부터. RPC가 application(source=manual)+quote를 원자 생성.
export async function createManualQuoteAction(
  payload: CreateManualQuotePayload,
): Promise<QuoteActionResult> {
  const access = await requireQuotesWrite();
  if (access.status === "forbidden") return { error: "견적 작성 권한이 없습니다." };
  const parsed = createManualQuotePayloadSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_manual_quote", {
    p_company: v.company,
    p_ceo: v.ceo ?? null,
    p_phone: v.phone ?? null,
    p_email: v.email ?? null,
    p_items: v.items,
    p_options: v.options,
    p_status: v.status,
  });
  if (error) {
    console.error("[quotes.manual] RPC 실패", error);
    return { error: "견적을 저장하지 못했습니다." };
  }
  const appId = (data as { application_id?: string } | null)?.application_id;
  if (!appId) return { error: "견적을 저장하지 못했습니다." };

  // 의뢰관리 2분할 셸의 목록(layout 서버 조회)까지 갱신 — 수기 견적은 새 의뢰를 생성하므로
  // layout 단위 revalidate로 좌측 목록에 새 의뢰가 즉시 나타나게 한다.
  revalidatePath("/admin/applications", "layout");
  redirect(`/admin/applications/${appId}`);
}
