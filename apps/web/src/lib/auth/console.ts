import { can, type PermissionKey } from "@jhtechsaas/shared";

// 콘솔(admin 셸) 진입 자격이 되는 키 — 하나라도 보유하면 셸 진입 허용.
// (users.manage super는 can()이 자동 통과시킨다.)
export const CONSOLE_CAPABILITIES: PermissionKey[] = [
  "applications.view_all",
  "applications.assign",
  "applications.status",
  "applications.claim",
  "customers.edit",
  "customers.view_all",
  "customers.delete",
  "service_requests.view_all",
  "service_requests.status",
  "service_requests.claim",
  "supply_requests.view_all",
  "supply_requests.status",
  "supply_requests.claim",
  "equipment.manage",
  "consumables.manage",
  "users.manage",
];

// 콘솔 키 중 하나라도 보유하면 true. (#29 — 영업담당도 셸 진입)
export function hasAnyConsoleCapability(permissions: readonly string[]): boolean {
  return CONSOLE_CAPABILITIES.some((k) => can(permissions, k));
}

// 로그인 후 첫 화면 — 권한 기반 우선순위. applications(운영 허브)를 최우선으로,
// 매칭 없으면 가진 권한의 도메인으로. (users.manage super는 applications 규칙에 먼저 걸려 허브로.)
const LANDING_RULES: { keys: PermissionKey[]; path: string }[] = [
  {
    keys: [
      "applications.view_all",
      "applications.assign",
      "applications.status",
      "applications.claim",
    ],
    path: "/admin/applications",
  },
  { keys: ["customers.edit", "customers.view_all"], path: "/admin/customers" },
  {
    keys: ["service_requests.view_all", "service_requests.status", "service_requests.claim"],
    path: "/admin/service-requests",
  },
  {
    keys: ["supply_requests.view_all", "supply_requests.status", "supply_requests.claim"],
    path: "/admin/supply-requests",
  },
  { keys: ["equipment.manage"], path: "/admin/equipment" },
  { keys: ["consumables.manage"], path: "/admin/consumables" },
  { keys: ["users.manage"], path: "/admin/users" },
];

export function landingPathFor(permissions: readonly string[]): string {
  for (const rule of LANDING_RULES) {
    if (rule.keys.some((k) => can(permissions, k))) return rule.path;
  }
  return "/admin/applications"; // 콘솔 자격은 있으나 매칭 없음 — 안전 기본
}
