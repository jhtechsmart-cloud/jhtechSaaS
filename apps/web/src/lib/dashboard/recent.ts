import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RequestDomain = "application" | "service" | "supply";

export interface RecentRequest {
  id: string;
  domain: RequestDomain;
  typeLabel: string; // 견적 / A/S / 소모품
  seq_no: string;
  company: string;
  status: string;
  created_at: string;
}

// 우측 캘린더·이번 달 신청 리스트용 — 신청 3종을 created_at desc로 모아 통합. RLS 적용(역할별 가시범위).
// "이벤트"가 없는 도메인이라, 신청 제출일을 캘린더에 점으로 찍고 리스트로 보여준다.
export async function listRecentRequests(limit = 40): Promise<RecentRequest[]> {
  const supabase = await createSupabaseServerClient();
  const [apps, svc, sup] = await Promise.all([
    supabase.from("applications").select("id,seq_no,company,status,created_at").order("created_at", { ascending: false }).limit(limit),
    supabase.from("service_requests").select("id,seq_no,contact_company,status,created_at").order("created_at", { ascending: false }).limit(limit),
    supabase.from("supply_requests").select("id,seq_no,status,created_at,companies:company_id(name)").order("created_at", { ascending: false }).limit(limit),
  ]);

  const rows: RecentRequest[] = [];
  for (const r of apps.data ?? []) {
    rows.push({ id: r.id as string, domain: "application", typeLabel: "견적", seq_no: r.seq_no as string, company: (r.company as string) ?? "-", status: r.status as string, created_at: r.created_at as string });
  }
  for (const r of svc.data ?? []) {
    rows.push({ id: r.id as string, domain: "service", typeLabel: "A/S", seq_no: r.seq_no as string, company: (r.contact_company as string) ?? "-", status: r.status as string, created_at: r.created_at as string });
  }
  for (const r of (sup.data ?? []) as unknown as Array<Record<string, unknown>>) {
    const co = r.companies as { name?: string } | null;
    rows.push({ id: r.id as string, domain: "supply", typeLabel: "소모품", seq_no: r.seq_no as string, company: co?.name ?? "-", status: r.status as string, created_at: r.created_at as string });
  }

  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return rows;
}

// KST 기준 YYYY-MM-DD (캘린더 매칭용).
export function kstDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
}
