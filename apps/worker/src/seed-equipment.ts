// 장비(equipment) 시드 — 운영 데이터 입력.
// service_role로 RLS 우회. 멱등: model이 같은 장비가 이미 있으면 건드리지 않고 건너뛴다.
// 분류는 equipment_category에서 소분류 이름으로 id를 찾아 연결한다(없으면 에러).
//
// 실행: cd apps/worker && set -a && . ./.env && set +a && pnpm exec tsx src/seed-equipment.ts

import { createServiceClient } from "@jhtechsaas/shared/supabase";
import { serializeSpecs, type SpecGroupInput } from "@jhtechsaas/shared";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요.");
  process.exit(1);
}

interface EquipmentSeed {
  name: string;
  model: string;
  categoryName: string; // 연결할 소분류(또는 대분류) 이름
  status: "active" | "inactive";
  base_price?: number;
  highlights: string[];
  specs: SpecGroupInput[];
  youtube_urls: string[];
  photos?: string[];
}

const EQUIPMENT: EquipmentSeed[] = [
  {
    name: "롤 UV 프린터 (1.6m)",
    model: "XTRA R16",
    categoryName: "롤 UV프린터",
    status: "active",
    highlights: [
      "엡손 i3200-U1 프린트 헤드로 높은 인쇄 품질 구현",
      "2~4개 프린트 헤드 / 4색 + 백색·바니시(옵션)",
      "고성능 UV-LED 경화 램프로 다양한 소재 출력",
      "원단 흡착 기능 조절 시스템",
      "충돌 방지 센서로 프린트 헤드 보호",
      "자동 차압 유지 시스템",
      "X, Y 공백 스킵 기능",
    ],
    specs: [
      {
        group: "프린트 헤드·잉크",
        icon: "droplet",
        items: [
          { label: "프린트 헤드", value: "최신형 산업용 EPSON 헤드 i3200-U1" },
          { label: "UV 램프", value: "LED-UV" },
          { label: "잉크", value: "4색(CMYK), 흰색(옵션), 바니시(옵션)" },
          { label: "잉크 용량", value: "1.5L / 색상당" },
        ],
      },
      {
        group: "출력 소재",
        icon: "box",
        items: [
          { label: "소재 폭", value: "1,600mm" },
          { label: "소재 두께", value: "1mm" },
        ],
      },
      {
        group: "전원",
        icon: "power",
        items: [{ label: "전원", value: "AC 220V±10%, 2.5KW, 16A, 50/60Hz" }],
      },
      {
        group: "크기·무게",
        icon: "ruler",
        items: [
          { label: "프린터 크기", value: "가로 2,770 × 세로 740 × 높이 1,592mm" },
          { label: "무게", value: "350Kg" },
        ],
      },
      {
        group: "인터페이스",
        icon: "settings",
        items: [{ label: "인터페이스", value: "LAN" }],
      },
    ],
    youtube_urls: [
      "https://youtu.be/tZ1ZooilLas?si=_ITbVrrB_8-BfjD0",
      "https://youtu.be/OKmFzi7kbzY?si=D-bJERKV0SAOBWWk",
    ],
  },
];

const sb = createServiceClient(url, key);

// 소분류 우선, 없으면 대분류로 이름 매칭해 category_id를 찾는다.
async function resolveCategoryId(name: string): Promise<string> {
  const { data, error } = await sb
    .from("equipment_category")
    .select("id, parent_id")
    .eq("name", name);
  if (error) throw new Error(`분류 조회 실패 [${name}]: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`분류 없음: ${name}`);
  // 동명이 여럿이면 소분류(parent_id 있음)를 우선.
  const child = data.find((c) => c.parent_id);
  return (child ?? data[0]).id;
}

async function main(): Promise<void> {
  for (const eq of EQUIPMENT) {
    // 멱등: 같은 model이 이미 있으면 건너뛴다.
    const { data: existing, error: exErr } = await sb
      .from("equipment")
      .select("id")
      .eq("model", eq.model)
      .maybeSingle();
    if (exErr) throw new Error(`중복 확인 실패 [${eq.model}]: ${exErr.message}`);
    if (existing) {
      console.log(`= 이미 존재(건너뜀): ${eq.name} [${eq.model}] id=${existing.id}`);
      continue;
    }

    const categoryId = await resolveCategoryId(eq.categoryName);
    const { data, error } = await sb
      .from("equipment")
      .insert({
        name: eq.name,
        model: eq.model,
        category_id: categoryId,
        status: eq.status,
        base_price: eq.base_price ?? 0,
        highlights: eq.highlights,
        specs: serializeSpecs(eq.specs), // 트림·빈항목 제거
        youtube_urls: eq.youtube_urls,
        photos: eq.photos ?? [],
      })
      .select("id")
      .single();
    if (error) throw new Error(`등록 실패 [${eq.name}]: ${error.message}`);
    console.log(
      `+ 등록: ${eq.name} [${eq.model}] → 분류 '${eq.categoryName}' / id=${data.id}`,
    );
  }
  console.log("\n완료.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
