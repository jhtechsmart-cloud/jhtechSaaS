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

  revalidatePath(`/admin/applications/${applicationId}`);
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

  revalidatePath("/admin/applications");
  redirect(`/admin/applications/${appId}`);
}
