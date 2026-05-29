// 부트스트랩/개발 시드 — service_role admin API로 초기 사용자를 만든다 (D3).
// 닭-달걀 해결: RLS상 users.manage 보유자만 사용자를 관리할 수 있으므로,
// 첫 관리자를 service_role로 만들어 전체 권한을 부여한다.
//
// 실행: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요 (로컬: scripts/seed-local.sh).
// 멱등 — 이미 있으면 권한만 다시 맞춘다. raw SQL auth.users INSERT보다 버전 견고.

import { createServiceClient } from "@jhtechsaas/shared/supabase";
import { PERMISSIONS, type PermissionKey } from "@jhtechsaas/shared/permissions";
import { isLocalSupabaseUrl, resolveSeedPassword } from "@jhtechsaas/shared/seed";

const url = process.env.SUPABASE_URL ?? process.env.API_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요. 로컬은 supabase/seed/seed-local.sh 사용.",
  );
  process.exit(1);
}

// 프로덕션 가드: 약한 고정 비번 + 전체 권한 관리자를 실 프로젝트에 만들면 백도어가 된다.
// 로컬(localhost/127.0.0.1/*.local)이 아니면 ALLOW_SEED_PROD=1 명시 없이는 거부한다.
const isLocal = isLocalSupabaseUrl(url);
if (!isLocal && process.env.ALLOW_SEED_PROD !== "1") {
  console.error(
    `시드 거부: 비로컬 URL(${url})에 관리자 생성은 위험합니다. ` +
      "의도한 경우에만 ALLOW_SEED_PROD=1 + 강한 env 비번으로 실행하세요.",
  );
  process.exit(1);
}

interface SeedUser {
  email: string;
  name: string;
  permissions: PermissionKey[];
  passwordEnv: string; // 이 사용자 비번을 읽을 env 키
  devDefault: string; // 로컬 전용 기본 비번
  localOnly?: boolean; // true면 프로덕션 시드에서 제외(개발 편의 계정)
}

const SEED_USERS: SeedUser[] = [
  {
    email: "admin@jhtech.local",
    name: "관리자",
    permissions: [...PERMISSIONS], // 전체 권한 (users.manage 포함)
    passwordEnv: "SEED_ADMIN_PASSWORD",
    devDefault: "jhtech-admin-dev",
  },
  {
    email: "sales@jhtech.local",
    name: "영업담당",
    permissions: ["applications.view_all", "quotes.write", "email.send"],
    passwordEnv: "SEED_SALES_PASSWORD",
    devDefault: "jhtech-sales-dev",
    localOnly: true, // 개발 편의 계정 — 프로덕션엔 만들지 않음
  },
];

async function main(): Promise<void> {
  const sb = createServiceClient(url!, key!);

  for (const u of SEED_USERS) {
    // 개발 편의 계정은 프로덕션에서 건너뛴다.
    if (!isLocal && u.localOnly) {
      console.log(`↷ ${u.email} 건너뜀 (개발 전용 계정)`);
      continue;
    }
    // 비번 해석: 로컬은 dev 기본, 프로덕션은 강한 env 비번 강제(약하면 throw).
    const password = resolveSeedPassword({
      isLocal,
      envPassword: process.env[u.passwordEnv],
      devDefault: u.devDefault,
    });

    // 멱등: 생성 시도 → 이미 있으면 목록에서 id 조회.
    const created = await sb.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { name: u.name },
    });

    let id = created.data?.user?.id;
    if (!id) {
      // 이미 존재(중복 이메일)면 조회로 폴백. 그 외 에러는 삼키지 않고 던진다.
      const dup = created.error?.message
        ?.toLowerCase()
        .match(/already|registered|exist/);
      if (created.error && !dup) {
        throw new Error(`사용자 생성 실패 ${u.email}: ${created.error.message}`);
      }
      const { data, error } = await sb.auth.admin.listUsers();
      if (error) throw new Error(`사용자 조회 실패 ${u.email}: ${error.message}`);
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
