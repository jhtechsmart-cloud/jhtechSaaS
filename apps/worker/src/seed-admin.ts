// 부트스트랩/개발 시드 — service_role admin API로 초기 사용자를 만든다 (D3).
// 닭-달걀 해결: RLS상 users.manage 보유자만 사용자를 관리할 수 있으므로,
// 첫 관리자를 service_role로 만들어 전체 권한을 부여한다.
//
// 실행: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요 (로컬: scripts/seed-local.sh).
// 멱등 — 이미 있으면 권한만 다시 맞춘다. raw SQL auth.users INSERT보다 버전 견고.

import { createServiceClient } from "@jhtechsaas/shared/supabase";
import { PERMISSIONS, type PermissionKey } from "@jhtechsaas/shared/permissions";

const url = process.env.SUPABASE_URL ?? process.env.API_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요. 로컬은 scripts/seed-local.sh 사용.",
  );
  process.exit(1);
}

interface SeedUser {
  email: string;
  password: string;
  name: string;
  permissions: PermissionKey[];
}

const SEED_USERS: SeedUser[] = [
  {
    email: "admin@jhtech.local",
    password: "jhtech-admin-dev",
    name: "관리자",
    permissions: [...PERMISSIONS], // 전체 권한 (users.manage 포함)
  },
  {
    email: "sales@jhtech.local",
    password: "jhtech-sales-dev",
    name: "영업담당",
    permissions: ["applications.view_all", "quotes.write", "email.send"],
  },
];

async function main(): Promise<void> {
  const sb = createServiceClient(url!, key!);

  for (const u of SEED_USERS) {
    // 멱등: 생성 시도 → 이미 있으면 목록에서 id 조회.
    const created = await sb.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { name: u.name },
    });

    let id = created.data?.user?.id;
    if (!id) {
      const { data } = await sb.auth.admin.listUsers();
      id = data.users.find((x) => x.email === u.email)?.id;
    }
    if (!id) throw new Error(`사용자 생성/조회 실패: ${u.email}`);

    // 트리거가 만든 profiles 행에 권한·이름 반영(service_role → RLS 우회).
    const { error } = await sb
      .from("profiles")
      .update({ permissions: u.permissions, name: u.name, is_active: true })
      .eq("id", id);
    if (error) throw new Error(`권한 부여 실패 ${u.email}: ${error.message}`);

    console.log(`✓ ${u.email} — ${u.permissions.length}개 권한`);
  }
  console.log("시드 완료.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
