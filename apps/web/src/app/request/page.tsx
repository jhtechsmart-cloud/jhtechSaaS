import { z } from "zod";
import { getPublicEquipment } from "@/lib/equipment/public-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RequestForm } from "./_components/RequestForm";
import { PRIVACY_VERSION } from "@/lib/applications/schema";

// 공개 견적요청 페이지. ?equipment_id= 로 장비 사전선택(P-A2 reconcile).
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment_id?: string }>;
}) {
  const { equipment_id } = await searchParams;
  const validId =
    equipment_id && z.string().uuid().safeParse(equipment_id).success ? equipment_id : undefined;

  let equipmentName: string | undefined;
  if (validId) {
    const eq = await getPublicEquipment(validId);
    equipmentName = eq?.name; // inactive·없음이면 이름 없음(폼은 정상 동작)
  }

  const supabase = await createSupabaseServerClient();
  const { data: policy } = await supabase
    .from("privacy_policies")
    .select("body")
    .eq("version", PRIVACY_VERSION)
    .maybeSingle();
  const policyBody = policy?.body ?? "개인정보 처리방침 전문을 불러오지 못했습니다.";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-display font-semibold text-text">견적 요청</h1>
      <p className="mt-2 text-body text-muted">정보를 입력하시면 담당자가 검토 후 연락드립니다.</p>
      <RequestForm equipmentId={validId} equipmentName={equipmentName} policyBody={policyBody} />
    </main>
  );
}
