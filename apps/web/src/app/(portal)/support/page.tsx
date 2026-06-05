import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRIVACY_VERSION } from "@/lib/service-requests/schema";
import { ServiceRequestForm } from "./_components/ServiceRequestForm";

// 공개 A/S신청 페이지(P-D). 사업자번호 조회 → 자동완성/직접입력 → 증상·사진 → 접수.
export default async function SupportPage() {
  const supabase = await createSupabaseServerClient();
  const { data: policy } = await supabase
    .from("privacy_policies")
    .select("body")
    .eq("version", PRIVACY_VERSION)
    .maybeSingle();
  const policyBody = policy?.body ?? "개인정보 처리방침 전문을 불러오지 못했습니다.";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-display font-semibold text-text">A/S 신청</h1>
      <p className="mt-2 text-body text-muted">
        사업자등록번호로 조회하시면 보유 장비가 자동완성됩니다. 담당자가 확인 후 연락드립니다.
      </p>
      <ServiceRequestForm policyBody={policyBody} />
    </main>
  );
}
