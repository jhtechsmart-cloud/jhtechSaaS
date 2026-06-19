"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission, requireQuotesWrite, requireUsersManage } from "@/lib/auth/guard";
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

// 견적 메일 발송 요청 — email.send 필요. enqueue_quote_email RPC가 발송자(auth.uid())·
// issued·pdf_url·hiworks_user_id·중복을 모두 검증하고 email_log+jobs를 원자 생성(워커가 실제 발송).
// ⚠️ Server Action 직접 POST 대비 가드 재호출. 금액·발송자 등 권위값은 전부 서버 RPC가 통제.
export async function enqueueQuoteEmailAction(
  quoteId: string,
  values: { to: string; subject: string; body: string },
): Promise<QuoteActionResult> {
  const access = await requirePermission("email.send");
  if (access.status === "forbidden") return { error: "메일 발송 권한이 없습니다." };
  if (!z.guid().safeParse(quoteId).success) return { error: "잘못된 요청입니다." };
  const schema = z.object({
    // 단일 주소(개행·콤마 차단) — RPC 정규식과 동일 의도. 서버 RPC가 최종 강제.
    to: z.string().regex(/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/, "받는 사람 이메일을 확인하세요.").max(200),
    subject: z.string().trim().min(1, "제목을 입력하세요.").max(200),
    body: z.string().max(5000),
  });
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: q } = await supabase.from("quotes").select("application_id").eq("id", quoteId).single();
  const appId = (q as { application_id?: string } | null)?.application_id ?? null;

  const { error } = await supabase.rpc("enqueue_quote_email", {
    p_quote_id: quoteId,
    p_to: v.to,
    p_cc: null,
    p_bcc: null,
    p_subject: v.subject,
    p_body: v.body,
  });
  if (error) {
    console.error("[quotes.enqueueEmail] RPC 실패", error);
    // RPC가 raise한 안내 메시지(P0001)·권한 거부(42501)만 노출 — 그 외(유니크 인덱스 위반 등
    // 내부 스키마명이 섞인 Postgres 원문)는 일반 문구로 마스킹(레이스 시 인덱스가 먼저 터질 수 있음).
    const raised = error.code === "P0001" || error.code === "42501";
    return { error: raised ? (error.message || "메일 발송 요청에 실패했습니다.").slice(0, 200) : "메일 발송 요청에 실패했습니다." };
  }
  if (appId) revalidatePath(`/admin/applications/${appId}`);
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
    p_spec_selection: v.specSelection,
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
    p_spec_selection: v.specSelection,
    // 기존 고객 연결 — 지정 시 application.company_id 저장 → 고객 이력에 견적 노출.
    p_company_id: v.companyId ?? null,
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

// 견적 삭제 — 관리자(users.manage)만. 발행본 포함 모두 삭제(테스트·오작성 정리).
// RLS(quotes_delete=users.manage)가 최종 통제하지만, Server Action 직접 POST 대비 가드 재확인.
export async function deleteQuoteAction(quoteId: string): Promise<QuoteActionResult> {
  const access = await requireUsersManage();
  if (access.status === "forbidden") return { error: "견적 삭제 권한이 없습니다." };

  const supabase = await createSupabaseServerClient();
  // 삭제 후 돌아갈 의뢰 경로 + PDF 경로 확보.
  const { data: q } = await supabase
    .from("quotes")
    .select("application_id, pdf_url")
    .eq("id", quoteId)
    .single();
  const row = q as { application_id?: string; pdf_url?: string | null } | null;
  const appId = row?.application_id ?? null;

  // PDF 파일(storage)도 함께 삭제 — DB 행만 지우면 고아 파일이 남는다.
  if (row?.pdf_url) {
    const { error: stErr } = await supabase.storage.from("quote-pdfs").remove([row.pdf_url]);
    if (stErr) console.error("[quotes.delete] PDF 삭제 실패(행은 계속 삭제)", stErr);
  }

  const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
  if (error) {
    console.error("[quotes.delete] 삭제 실패", error);
    return { error: "견적을 삭제하지 못했습니다." };
  }
  // 좌측 목록 배지·상세 모두 갱신.
  revalidatePath("/admin/applications", "layout");
  if (appId) redirect(`/admin/applications/${appId}`);
  return null;
}

// 의뢰의 모든 견적 버전 + 모든 PDF 삭제 — 관리자(users.manage)만. 견적을 통째로 비운다.
export async function deleteAllQuotesForApplicationAction(applicationId: string): Promise<QuoteActionResult> {
  const access = await requireUsersManage();
  if (access.status === "forbidden") return { error: "견적 삭제 권한이 없습니다." };

  const supabase = await createSupabaseServerClient();
  // 모든 버전의 PDF 경로 수집 후 storage 일괄 삭제.
  const { data: rows } = await supabase
    .from("quotes")
    .select("pdf_url")
    .eq("application_id", applicationId);
  const paths = (rows ?? [])
    .map((r) => (r as { pdf_url?: string | null }).pdf_url)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length > 0) {
    const { error: stErr } = await supabase.storage.from("quote-pdfs").remove(paths);
    if (stErr) console.error("[quotes.deleteAll] PDF 일괄 삭제 실패(행은 계속 삭제)", stErr);
  }

  const { error } = await supabase.from("quotes").delete().eq("application_id", applicationId);
  if (error) {
    console.error("[quotes.deleteAll] 삭제 실패", error);
    return { error: "견적을 삭제하지 못했습니다." };
  }
  revalidatePath("/admin/applications", "layout");
  redirect(`/admin/applications/${applicationId}`);
}
