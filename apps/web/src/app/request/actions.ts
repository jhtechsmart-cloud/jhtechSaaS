"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seqNoSchema, type SubmitPayload } from "@/lib/applications/schema";

// 견적 제출 — 클라가 만든 payload를 RPC v2로 전달(서버 강제 검증은 RPC가 수행).
// equipment_name은 표시용으로 payload.fields에 들어오나 저장 신뢰값 아님(RPC가 equipment_id로 검증).
export async function submitRequest(payload: SubmitPayload): Promise<{ error: string } | void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_application", { payload });
  if (error) {
    console.error("[request.submit] rpc 실패", error);
    return { error: "견적 요청 저장에 실패했습니다. 입력값을 확인해주세요." };
  }
  const seq = seqNoSchema.safeParse(data);
  if (!seq.success) {
    console.error("[request.submit] seq_no 형식 오류", data);
    return { error: "접수번호 생성에 실패했습니다." };
  }
  redirect(`/request/success?no=${encodeURIComponent(seq.data)}`);
}
