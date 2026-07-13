import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeCompanyName } from "./validation";

export type DupCompany = { id: string; name: string; biz_no: string | null; ceo: string | null };
export type DupGroup = { key: string; kind: "biz_no" | "name" | "no_biz"; companies: DupCompany[] };

// view_all 권한 전제(호출 측 requireCustomersViewAll 가드). 전 고객을 사업자번호·회사명으로
// 그룹핑해 중복 의심군만 반환(읽기 전용 — 병합은 범위 밖). 회사명 정규화는 등록 시 실시간 검증과
// 동일 규칙(normalizeCompanyName)을 재사용해 기준을 단일화한다.
export async function getDuplicateGroups(): Promise<DupGroup[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id,name,biz_no,ceo")
    .order("name");
  if (error || !data) return [];

  const byBiz = new Map<string, DupCompany[]>();
  const byName = new Map<string, DupCompany[]>();
  const noBiz: DupCompany[] = [];

  for (const c of data) {
    if (c.biz_no) {
      const g = byBiz.get(c.biz_no) ?? [];
      g.push(c);
      byBiz.set(c.biz_no, g);
    } else {
      noBiz.push(c);
    }
    const nk = normalizeCompanyName(c.name);
    const gn = byName.get(nk) ?? [];
    gn.push(c);
    byName.set(nk, gn);
  }

  const groups: DupGroup[] = [];
  for (const [key, companies] of byBiz) {
    if (companies.length > 1) groups.push({ key, kind: "biz_no", companies });
  }
  for (const [key, companies] of byName) {
    if (companies.length > 1) groups.push({ key, kind: "name", companies });
  }
  if (noBiz.length > 0) {
    groups.push({ key: "(사업자번호 없음)", kind: "no_biz", companies: noBiz });
  }
  return groups;
}
