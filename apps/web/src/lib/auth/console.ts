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

// 권한 기반 랜딩 우선순위 테이블. (E5b 이후 landingPathFor는 사용 안 함 —
// 향후 대시보드 카드/메뉴 우선순위 힌트로 의도적 보존.)
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 향후 우선순위 힌트로 의도적 보존(E5b)
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

// 로그인 후 첫 화면 — E5b: 콘솔 자격자는 전원 대시보드.
// #228: 콘솔 자격 없이 service_reports.write만 있는 현장 기사 계정은 /field로.
export function landingPathFor(permissions: readonly string[]): string {
  if (!hasAnyConsoleCapability(permissions) && can(permissions, "service_reports.write")) {
    return "/field";
  }
  return "/admin/dashboard";
}
