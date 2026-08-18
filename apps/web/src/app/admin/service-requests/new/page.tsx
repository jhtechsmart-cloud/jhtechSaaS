import Link from "next/link";
import { requirePermission } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCompanyForPicker } from "@/lib/service-requests/staff-actions";
import { PRIVACY_VERSION } from "@/lib/service-requests/schema";
import { StaffServiceRequestForm } from "./StaffServiceRequestForm";

// A/S 대행 접수(#281) — 직원 전용. 가드 = service_requests.create.
// ?company=<uuid> 있으면 그 고객으로 고정(RLS 밖·없음이면 피커 폴백 + 안내).
export default async function NewStaffServiceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const access = await requirePermission("service_requests.create");
  if (access.status === "forbidden") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-10">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">A/S 대행 접수 권한이 필요합니다.</p>
      </div>
    );
  }
  const { company: companyParam } = await searchParams;
  const initialCompany = companyParam ? await getCompanyForPicker(companyParam) : null;
  const companyFallback = Boolean(companyParam) && !initialCompany;

  const supabase = await createSupabaseServerClient();
  const { data: policy } = await supabase
    .from("privacy_policies")
    .select("body")
    .eq("version", PRIVACY_VERSION)
    .maybeSingle();
  const policyBody = policy?.body ?? "개인정보 처리방침 전문을 불러오지 못했습니다.";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={initialCompany ? `/admin/customers/${initialCompany.id}` : "/admin/service-requests"}
        className="text-small text-muted hover:text-text"
      >
        ← {initialCompany ? "고객 상세" : "A/S 목록"}
      </Link>
      <div>
        <h1 className="text-h1 font-semibold text-text">A/S 대행 접수</h1>
        <p className="mt-0.5 text-small text-muted">
          전화·방문으로 받은 A/S를 고객 대신 접수합니다. 담당자는 고객사 담당영업으로 자동 배정됩니다.
        </p>
      </div>
      {companyFallback && (
        <p className="rounded-md bg-coral-soft px-3 py-2 text-small font-medium text-coral-text">
          지정된 고객을 찾을 수 없거나 조회 권한이 없습니다. 아래에서 고객사를 검색해 선택하세요.
        </p>
      )}
      <StaffServiceRequestForm initialCompany={initialCompany} policyBody={policyBody} />
    </div>
  );
}
