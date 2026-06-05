import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRIVACY_VERSION } from "@/lib/supply-requests/schema";
import { SupplyRequestForm } from "./_components/SupplyRequestForm";

// 공개 소모품신청 페이지(P-E). 사업자번호 조회 → 보유장비 매칭 소모품·수량 선택 → 접수.
export default async function SupplyPage() {
  const supabase = await createSupabaseServerClient();
  const { data: policy } = await supabase
    .from("privacy_policies")
    .select("body")
    .eq("version", PRIVACY_VERSION)
    .maybeSingle();
  const policyBody = policy?.body ?? "개인정보 처리방침 전문을 불러오지 못했습니다.";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-display font-semibold text-text">소모품 신청</h1>
      <p className="mt-2 text-body text-muted">
        사업자등록번호로 조회하시면 보유 장비에 맞는 소모품을 선택할 수 있습니다. 담당자가 확인 후 연락드립니다.
      </p>
      <SupplyRequestForm policyBody={policyBody} />
    </main>
  );
}
