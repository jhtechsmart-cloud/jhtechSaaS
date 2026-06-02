// Capability 권한 registry — 권한을 고정 역할 enum이 아니라 데이터(키 목록)로 둔다.
// 새 기능 추가 시 키 1개만 추가하면 관리자 권한 체크박스에 자동 노출(스키마 변경 0).
// SQL has_permission() / RLS 정책과 1:1로 대응한다.

/** v1 권한 키 (10개). 미래 확장: delivery.dispatch, install.manage 등. */
export const PERMISSIONS = [
  "applications.view_all", // 전체 신청 조회 (없으면 자기 배정 건만)
  "applications.assign", // 담당자 배정
  "quotes.write", // 견적 작성·확정·재발행
  "equipment.manage", // 장비·옵션 관리
  "customers.manage", // 고객·보유장비 마스터 관리 (P-B)
  "consumables.manage", // 소모품 카탈로그 관리 (P-C)
  "service_requests.view_all", // 전체 A/S 조회 (없으면 자기 배정 건만) (P-D)
  "service_requests.manage", // A/S 상태변경·배정 (P-D)
  "email.send", // 견적 메일 발송
  "users.manage", // 사용자·권한 관리 (= 관리자, 전체 우회)
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

/** 관리자 = 모든 권한 보유로 취급되는 슈퍼 권한 키. */
export const SUPER_PERMISSION: PermissionKey = "users.manage";

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
