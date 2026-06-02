import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ServiceRequestStatus } from "./status";

export { SERVICE_REQUEST_STATUSES } from "./status";
export type { ServiceRequestStatus } from "./status";

export interface ServiceRequestListRow {
  id: string;
  seq_no: string;
  status: ServiceRequestStatus;
  contact_company: string;
  assignee_id: string | null;
  assignee_name: string | null;
  symptom: string;
  verified: boolean; // company_id 매칭 여부(미확인=미등록 접수)
  unread: boolean; // admin_read_at NULL
  created_at: string;
}

// A/S 목록 — 최신순. RLS: 자기 배정 건 OR service_requests.view_all.
export async function listServiceRequests(): Promise<ServiceRequestListRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_requests")
    .select("id,seq_no,status,company_id,contact_company,assignee_id,admin_read_at,created_at,fields,profiles:assignee_id(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) { console.error("[service_requests.list]", error); return []; }
  return (data ?? []).map((r: Record<string, unknown>) => {
    const profiles = r.profiles as { name?: string } | null;
    const fields = (r.fields as { symptom?: string } | null) ?? {};
    return {
      id: r.id as string,
      seq_no: r.seq_no as string,
      status: r.status as ServiceRequestStatus,
      contact_company: r.contact_company as string,
      assignee_id: r.assignee_id as string | null,
      assignee_name: profiles?.name ?? null,
      symptom: fields.symptom ?? "",
      verified: r.company_id != null,
      unread: r.admin_read_at == null,
      created_at: r.created_at as string,
    };
  });
}

// 미열람 건수(경량 알림 배지). RLS가 가시 범위를 제한.
export async function countUnreadServiceRequests(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("service_requests")
    .select("id", { count: "exact", head: true })
    .is("admin_read_at", null);
  if (error) return 0;
  return count ?? 0;
}

// A/S 단건 — 상세 페이지용. 회사·담당·보유장비 조인.
export async function getServiceRequest(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("service_requests")
    .select("*, profiles:assignee_id(name), companies:company_id(name,biz_no), company_equipment:company_equipment_id(label, equipment:equipment_id(name,model))")
    .eq("id", id)
    .maybeSingle();
  return data;
}
