"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicEquipment } from "@/lib/equipment/public-queries";
import {
  requestFormSchema,
  buildSubmitPayload,
  seqNoSchema,
  type RequestFormInput,
} from "@/lib/applications/schema";

export type RequestActionResult = { error: string } | null;

export async function submitRequest(
  input: RequestFormInput,
): Promise<RequestActionResult> {
  // 서버 재검증(클라 RHF는 UX용, 신뢰경계는 서버).
  const parsed = requestFormSchema.safeParse(input);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  const v = parsed.data;

  // 선택장비명: equipment_public에서 조회(없거나 inactive면 무시 — preselection만 누락).
  // 조회 실패는 비필수 필드라 삼키고 로그만 — 제출 자체는 계속 진행(silent-fail 아님: 본 제출은 정상 처리).
  let equipmentName: string | undefined;
  if (v.equipment_id) {
    try {
      const eq = await getPublicEquipment(v.equipment_id);
      equipmentName = eq?.name;
    } catch (err) {
      console.error("[request.submit] 장비명 조회 실패(무시)", err);
    }
  }

  const payload = buildSubmitPayload(v, equipmentName);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_application", { payload });

  // silent-fail 제거: 실패는 항상 명시적 통지. 원시 DB 메시지는 로그로만(스키마 노출 방지).
  if (error) {
    console.error("[request.submit] rpc 실패", error);
    return { error: "제출에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }
  const seq = seqNoSchema.safeParse(data);
  if (!seq.success) {
    console.error("[request.submit] 접수번호 형식 오류", data);
    return { error: "제출에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }

  // redirect는 throw로 동작 → try/catch 밖에서 호출. 성공 시 클라가 자동 이동.
  redirect(`/request/success?no=${encodeURIComponent(seq.data)}`);
}
