import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 영업일지 한 건(표시용). author 이름은 profiles 조인(RLS상 비관리자는 null일 수 있음 → 폴백).
export type SalesLogItem = {
  id: string;
  company_id: string;
  content: string;
  created_at: string;
  author_id: string;
  author_name: string | null;
};

// 작성자별 모아보기 한 건 — 업체명 포함(companies RLS상 접근 불가 업체는 null).
export type MySalesLogItem = SalesLogItem & { company_name: string | null };

type RawLog = {
  id: string;
  company_id: string;
  content: string;
  created_at: string;
  author_id: string;
  author?: { name?: string | null } | null;
  company?: { name?: string | null } | null;
};

// 업체별 영업일지(최신순). RLS sales_logs_select가 행 스코프 강제(본인 작성 OR 담당/전체조회).
export async function listSalesLogsForCompany(companyId: string): Promise<SalesLogItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sales_logs")
    .select("id, company_id, content, created_at, author_id, author:author_id(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[salesLogs.listForCompany]", error);
    return [];
  }
  return (data as RawLog[] | null ?? []).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    content: r.content,
    created_at: r.created_at,
    author_id: r.author_id,
    author_name: r.author?.name ?? null,
  }));
}

// 작성자 본인 영업일지 모아보기(최신순). author_id = 현재 사용자.
export async function listMySalesLogs(authorId: string): Promise<MySalesLogItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sales_logs")
    .select("id, company_id, content, created_at, author_id, author:author_id(name), company:company_id(name)")
    .eq("author_id", authorId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[salesLogs.listMine]", error);
    return [];
  }
  return (data as RawLog[] | null ?? []).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    content: r.content,
    created_at: r.created_at,
    author_id: r.author_id,
    author_name: r.author?.name ?? null,
    company_name: r.company?.name ?? null,
  }));
}
