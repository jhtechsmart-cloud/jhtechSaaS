import { can, type PermissionKey } from "@jhtechsaas/shared";

// 세션 유무 + 권한으로 접근을 판정하는 순수 함수.
// 실제 강제는 항상 서버 RLS가 하고, 이건 UI 분기·가드 판정용.
export type AccessResult =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "ok" };

export function resolveAccess(
  userId: string | null,
  permissions: readonly string[] | null,
  required: PermissionKey,
): AccessResult {
  if (!userId) return { status: "unauthenticated" };
  if (!permissions || !can(permissions, required)) {
    return { status: "forbidden" };
  }
  return { status: "ok" };
}
