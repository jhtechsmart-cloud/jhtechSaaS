import "server-only";
import { redirect } from "next/navigation";
import type { PermissionKey } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/auth/access";

// 세션+권한 서버 검증. 미인증이면 /login으로 리다이렉트(throw).
// 인증됐으나 권한 없으면 { status: "forbidden" } 반환 → layout이 403 렌더.
// ⚠️ Server Action은 직접 POST로도 도달 가능 → action에서도 이 가드를 재호출할 것.
export async function requirePermission(
  required: PermissionKey,
): Promise<
  | { status: "ok"; userId: string; permissions: string[] }
  | { status: "forbidden" }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login"); // never 반환 — 아래로 진행 안 함
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("permissions")
    .eq("id", user.id)
    .single();

  if (profileError) {
    // 행 없음(PGRST116)은 조용히 forbidden. 그 외(DB·RLS·네트워크)는 로그 후 forbidden(fail-closed).
    if (profileError.code !== "PGRST116") {
      console.error("[requirePermission] profile 조회 실패", profileError);
    }
    return { status: "forbidden" };
  }

  const permissions = profile.permissions ?? null;

  const access = resolveAccess(user.id, permissions, required);
  if (access.status === "ok") {
    return { status: "ok", userId: user.id, permissions: permissions ?? [] };
  }
  return { status: "forbidden" };
}

export const requireEquipmentManage = () => requirePermission("equipment.manage");
// E5a: customers.manage(통합) → 액션별 분해. 등록·수정=edit, 삭제=delete, 전체조회=view_all.
export const requireCustomersEdit = () => requirePermission("customers.edit");
export const requireCustomersDelete = () => requirePermission("customers.delete");
export const requireCustomersViewAll = () => requirePermission("customers.view_all");
export const requireConsumablesManage = () => requirePermission("consumables.manage");
