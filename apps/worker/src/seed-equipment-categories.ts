// 장비 분류(equipment_category) 시드 — 운영 데이터 입력.
// service_role로 RLS 우회. 멱등: 같은 이름(+부모)이 이미 있으면 건드리지 않고 없는 것만 생성.
// equipment_category는 부분 UNIQUE라 ON CONFLICT가 안 먹으므로(42P10), select 후 insert로 멱등 처리.
//
// 실행: cd apps/worker && set -a && . ./.env && set +a && pnpm exec tsx src/seed-equipment-categories.ts

import { createServiceClient } from "@jhtechsaas/shared/supabase";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요.");
  process.exit(1);
}

// 대분류 → 소분류 트리. 배열 순서가 곧 sort_order.
const TREE: { name: string; children: string[] }[] = [
  {
    name: "프린터",
    children: [
      "롤 UV프린터",
      "솔벤트 프린터",
      "승화 전사 프린터",
      "평판 UV프린터",
      "하이브리드 UV프린터",
    ],
  },
  {
    name: "커팅기",
    children: ["디지털 평판 커팅기"],
  },
];

const sb = createServiceClient(url, key);

// 이름(+부모)으로 존재 확인 후 없으면 생성. 생성/존재 무관하게 id 반환.
async function ensureCategory(
  name: string,
  parentId: string | null,
  sortOrder: number,
): Promise<string> {
  let q = sb.from("equipment_category").select("id").eq("name", name);
  q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
  const { data: existing, error } = await q.maybeSingle();
  if (error) throw new Error(`조회 실패 [${name}]: ${error.message}`);
  if (existing) {
    console.log(`  = 이미 존재: ${name}`);
    return existing.id;
  }
  const { data, error: insErr } = await sb
    .from("equipment_category")
    .insert({ name, parent_id: parentId, sort_order: sortOrder })
    .select("id")
    .single();
  if (insErr) throw new Error(`생성 실패 [${name}]: ${insErr.message}`);
  console.log(`  + 생성: ${name}`);
  return data.id;
}

async function main(): Promise<void> {
  // 1) 입력 전 현황
  const { data: before, error: beErr } = await sb
    .from("equipment_category")
    .select("id, name, parent_id, sort_order")
    .order("sort_order");
  if (beErr) throw new Error(`현황 조회 실패: ${beErr.message}`);
  console.log(`\n[입력 전] equipment_category 총 ${before?.length ?? 0}건`);
  for (const c of before ?? []) {
    console.log(`  - ${c.name}${c.parent_id ? " (소분류)" : " (대분류)"}`);
  }

  // 2) 멱등 시드
  console.log(`\n[시드 진행]`);
  let topSort = 0;
  for (const top of TREE) {
    const topId = await ensureCategory(top.name, null, topSort++);
    let childSort = 0;
    for (const child of top.children) {
      await ensureCategory(child, topId, childSort++);
    }
  }

  // 3) 입력 후 트리 출력
  const { data: after, error: afErr } = await sb
    .from("equipment_category")
    .select("id, name, parent_id, sort_order")
    .order("sort_order");
  if (afErr) throw new Error(`결과 조회 실패: ${afErr.message}`);
  const tops = (after ?? []).filter((c) => !c.parent_id);
  console.log(`\n[입력 후] 총 ${after?.length ?? 0}건`);
  for (const t of tops) {
    console.log(`▸ ${t.name}`);
    for (const c of (after ?? []).filter((x) => x.parent_id === t.id)) {
      console.log(`   └ ${c.name}`);
    }
  }
  console.log("\n완료.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
