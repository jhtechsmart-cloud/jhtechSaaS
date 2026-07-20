// Capability 권한 registry — 권한을 고정 역할 enum이 아니라 데이터(키 목록)로 둔다.
// 새 기능 추가 시 키 1개만 추가하면 관리자 권한 체크박스에 자동 노출(스키마 변경 0).
// SQL has_permission() / RLS 정책과 1:1로 대응한다.
//
// E5a(이슈 #38): 굵게 묶인 키를 액션 단위로 분해하고 한글 메타를 단일 출처(객체 배열)로 통합.
// 키+label/description/group을 한 객체에 담아 메타 누락을 타입으로 차단한다.

/** 권한 그룹 (관리 UI 그룹핑·표시용, 한글). */
export type PermissionGroup =
  | "견적"
  | "고객"
  | "A/S"
  | "소모품신청"
  | "데모예약"
  | "카탈로그"
  | "사용자";

/** registry 한 항목. deprecated=true는 은퇴 예정(참조 제거 후 삭제), UI 그리드 미노출. */
export interface PermissionDef {
  key: string;
  label: string;
  description: string;
  group: PermissionGroup;
  deprecated?: true;
}

/**
 * v2 권한 registry (19키). E5a에서 *.manage(customers/service/supply) 3키를 액션 단위로 분해·삭제.
 * 미래 확장: delivery.dispatch, install.manage, notifications.send 등.
 */
const PERMISSION_REGISTRY_RAW = [
  // ── 견적 (applications) ──
  {
    key: "applications.view_all",
    label: "견적 전체조회",
    description: "담당 무관 모든 견적신청 조회 (없으면 본인 배정·미배정만)",
    group: "견적",
  },
  {
    key: "applications.assign",
    label: "견적 재배정",
    description: "견적신청 담당자를 다른 사람에게 배정",
    group: "견적",
  },
  {
    key: "applications.status",
    label: "견적 상태변경",
    description: "견적신청 상태를 변경",
    group: "견적",
  },
  {
    key: "applications.claim",
    label: "견적 맡기",
    description: "미배정 견적신청을 본인 담당으로 가져오기",
    group: "견적",
  },
  {
    key: "quotes.write",
    label: "견적서 작성",
    description: "견적서 작성·확정·재발행",
    group: "견적",
  },
  {
    key: "email.send",
    label: "견적 메일발송",
    description: "견적 메일 발송",
    group: "견적",
  },
  {
    key: "release_orders.write",
    label: "출고의뢰서 작성",
    description: "장비출고의뢰서 작성·발행",
    group: "견적",
  },
  // ── 고객 (customers) ──
  {
    key: "customers.edit",
    label: "고객 등록·수정",
    description: "고객·보유장비 등록 및 수정",
    group: "고객",
  },
  {
    key: "customers.delete",
    label: "고객 삭제",
    description: "고객·보유장비 삭제",
    group: "고객",
  },
  {
    key: "customers.view_all",
    label: "고객 전체조회",
    description: "담당 무관 모든 고객 조회 (없으면 본인 담당 고객만)",
    group: "고객",
  },
  // ── A/S (service_requests) ──
  {
    key: "service_requests.view_all",
    label: "A/S 전체조회",
    description: "담당 무관 모든 A/S 조회 (없으면 본인 배정·미배정만)",
    group: "A/S",
  },
  {
    key: "service_requests.status",
    label: "A/S 상태변경",
    description: "A/S 신청 상태를 변경",
    group: "A/S",
  },
  {
    key: "service_requests.claim",
    label: "A/S 맡기",
    description: "미배정 A/S를 본인 담당으로 가져오기",
    group: "A/S",
  },
  {
    key: "service_reports.write",
    label: "서비스 리포트 작성",
    description: "현장 서비스 리포트 작성·확정 (as.jhtech.co.kr 현장 콘솔)",
    group: "A/S",
  },
  {
    key: "service_reports.view",
    label: "서비스 리포트 조회",
    description: "발행·무효 리포트 조회(작성 중 문서는 제외) — 고객 응대 시 직전 A/S 확인용",
    group: "A/S",
  },
  {
    key: "service_reports.view_all",
    label: "서비스 리포트 전체조회",
    description: "담당 무관 모든 서비스 리포트 조회 (없으면 본인 작성 draft + 발행본만)",
    group: "A/S",
  },
  // ── 소모품신청 (supply_requests) ──
  {
    key: "supply_requests.view_all",
    label: "소모품신청 전체조회",
    description: "담당 무관 모든 소모품신청 조회 (없으면 본인 배정·미배정만)",
    group: "소모품신청",
  },
  {
    key: "supply_requests.status",
    label: "소모품신청 상태변경",
    description: "소모품신청 상태를 변경",
    group: "소모품신청",
  },
  {
    key: "supply_requests.claim",
    label: "소모품신청 맡기",
    description: "미배정 소모품신청을 본인 담당으로 가져오기",
    group: "소모품신청",
  },
  // ── 데모예약 (demo_reservations) — 조회는 전 직원(키 불필요), 쓰기만 capability ──
  {
    key: "demo_reservations.write",
    label: "데모예약 등록·수정",
    description: "데모센터 예약 등록·수정·취소",
    group: "데모예약",
  },
  // ── 카탈로그 ──
  {
    key: "equipment.manage",
    label: "장비 카탈로그 관리",
    description: "장비·옵션·카테고리 관리",
    group: "카탈로그",
  },
  {
    key: "consumables.manage",
    label: "소모품 카탈로그 관리",
    description: "소모품 카탈로그 관리",
    group: "카탈로그",
  },
  // ── 사용자 ──
  {
    key: "users.manage",
    label: "사용자 관리",
    description: "계정·권한 관리 (관리자, 모든 권한 전체 우회)",
    group: "사용자",
  },
] as const satisfies readonly PermissionDef[];

/**
 * 권한 registry (외부 노출). 리터럴 타입은 _RAW에 보존하고, 노출 타입은 PermissionDef[]로
 * 넓혀 deprecated(optional) 접근을 허용한다. key 리터럴 union은 PermissionKey로 파생.
 */
export const PERMISSION_REGISTRY: readonly PermissionDef[] =
  PERMISSION_REGISTRY_RAW;

/** 권한 키 목록 — registry에서 파생(단일 출처). 리터럴 union 보존. */
export const PERMISSIONS = PERMISSION_REGISTRY_RAW.map((p) => p.key);

export type PermissionKey = (typeof PERMISSION_REGISTRY_RAW)[number]["key"];

/** 관리자 = 모든 권한 보유로 취급되는 슈퍼 권한 키. */
export const SUPER_PERMISSION: PermissionKey = "users.manage";

/**
 * 영업담당 프리셋 — seed-admin + 관리 UI '영업담당' 버튼 공용.
 * view_all/assign/delete 없음(→ 본인+미배정 스코프, 재배정·삭제 불가).
 */
export const SALES_PRESET: PermissionKey[] = [
  "applications.status",
  "applications.claim",
  "quotes.write",
  "customers.edit",
  "email.send",
  "release_orders.write",
  "service_requests.status",
  "service_requests.claim",
  // 발행 리포트 조회 — 고객 응대 시 직전 A/S 확인. draft는 포함되지 않는다(view_all 아님).
  "service_reports.view",
  "supply_requests.status",
  "supply_requests.claim",
  "demo_reservations.write",
];

/** 관리자 프리셋 — users.manage 단일 super(전체 통과). */
export const ADMIN_PRESET: PermissionKey[] = ["users.manage"];

/**
 * 클라이언트 측 권한 판정 — SQL has_permission()의 미러.
 * UI 게이팅(버튼·메뉴 노출)에만 사용하고, 실제 강제는 항상 서버 RLS가 한다.
 * users.manage 보유자는 모든 키에 대해 true.
 */
export function can(
  permissions: readonly string[],
  key: PermissionKey,
): boolean {
  return permissions.includes(SUPER_PERMISSION) || permissions.includes(key);
}
