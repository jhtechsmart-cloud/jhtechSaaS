"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildListSearchOr } from "@/lib/customers/queries";
import { staffSubmitResultSchema, type StaffServiceRequestPayload } from "./staff-schema";

// A/S 대행 접수(#281) 서버 액션 — 전부 세션 클라(RLS)로 조회. 회사 피커·보유장비·고정 회사 조회 + 접수 RPC.
// 검색·조회는 companies RLS(본인 담당 OR customers.view_all)를 그대로 상속 → 영업은 자기 담당 고객만 보인다.

export interface PickerCompany {
  id: string;
  name: string;
  biz_no: string | null;
  ceo: string | null;
  phone: string | null;
  address: string | null;
  assignee_name: string | null;
}

export interface PickerEquipment {
  id: string;
  label: string; // 표시명: 카탈로그 장비명(모델) 또는 직접입력 라벨 (+ 시리얼)
}

const pickerCompanySchema = z.object({
  id: z.guid(),
  name: z.string(),
  biz_no: z.string().nullable(),
  ceo: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  assignee_name: z.string().nullable(),
});

const PICKER_SELECT = "id,name,biz_no,ceo,phone,address,assignee_name";

// 회사 검색 — 2자 이상, 최대 10건, 이름순. 고객 목록과 같은 통합검색 OR 절(업체명·장부명·대표·담당·숫자).
export async function searchCompaniesForPicker(q: string): Promise<PickerCompany[]> {
  const access = await requirePermission("service_requests.create");
  if (access.status === "forbidden") return [];
  const query = q.trim();
  if (query.length < 2) return [];
  const or = buildListSearchOr(query);
  if (!or) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies_list")
    .select(PICKER_SELECT)
    .or(or)
    .order("name")
    .limit(10);
  if (error) {
    console.error("[staff-as.search]", error);
    return [];
  }
  return z.array(pickerCompanySchema).catch([]).parse(data ?? []);
}

// 고정 회사(?company=) 조회 — RLS 밖·삭제·잘못된 id면 null(피커로 폴백).
export async function getCompanyForPicker(id: string): Promise<PickerCompany | null> {
  const access = await requirePermission("service_requests.create");
  if (access.status === "forbidden") return null;
  if (!z.guid().safeParse(id).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("companies_list").select(PICKER_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const parsed = pickerCompanySchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

// 선택 회사의 보유장비 — RLS 상속. 표시명 = 카탈로그 장비명(모델) 우선, 없으면 직접입력 라벨, 시리얼 병기.
export async function listCompanyEquipmentForPicker(companyId: string): Promise<PickerEquipment[]> {
  const access = await requirePermission("service_requests.create");
  if (access.status === "forbidden") return [];
  if (!z.guid().safeParse(companyId).success) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("company_equipment")
    .select("id,label,serial_no,equipment:equipment_id(name,model)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[staff-as.equipment]", error);
    return [];
  }
  return (data ?? []).map((r) => {
    const eq = r.equipment as { name?: string | null; model?: string | null } | null;
    const base = eq?.name ? `${eq.name}${eq.model ? ` (${eq.model})` : ""}` : (r.label as string | null) ?? "(장비)";
    const serial = (r.serial_no as string | null) ?? "";
    return { id: r.id as string, label: serial ? `${base} · S/N ${serial}` : base };
  });
}

// 접수 — RPC가 권한·고객 스코프·값을 강제. 성공 시 상세로 이동(중복 제출은 기존 행으로).
export async function createServiceRequestByStaff(
  payload: StaffServiceRequestPayload,
): Promise<{ error: string } | void> {
  const access = await requirePermission("service_requests.create");
  if (access.status === "forbidden") return { error: "A/S 대행 접수 권한이 없습니다" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_service_request_by_staff", { payload });
  if (error) {
    console.error("[staff-as.create] rpc 실패", error);
    // RPC의 한국어 예외 메시지는 그대로 사용자에게(권한·고객·장비·동의 등), 그 외는 일반 문구.
    const msg = /[가-힣]/.test(error.message) ? error.message : "A/S 접수 저장에 실패했습니다. 입력값을 확인해주세요.";
    return { error: msg };
  }
  const parsed = staffSubmitResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[staff-as.create] 응답 형식 오류", data);
    return { error: "접수번호 생성에 실패했습니다." };
  }
  revalidatePath("/admin/service-requests");
  redirect(`/admin/service-requests/${parsed.data.id}?created=${encodeURIComponent(parsed.data.seq_no)}`);
}
