"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizePermissions } from "./permissions-ui";
import { generateTempPassword } from "./password";

export type CreateUserResult =
  | { error: string }
  | { ok: true; userId: string; email: string; tempPassword: string };

export type UserActionResult = { error: string } | { ok: true };

const createSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요").max(60),
  email: z.string().trim().toLowerCase().email("올바른 이메일이 아닙니다").max(200),
  permissions: z.array(z.string()).default([]),
});

// 계정 생성 — users.manage 필요. createUser(임시 PW) → 트리거가 profile 자동생성 → 권한 UPDATE.
// 권한 0개면 is_active=false 기본(권한 부여 전 활성화 안 함). 임시 PW는 1회만 반환(저장 안 함).
export async function createUserAction(input: {
  name: string;
  email: string;
  permissions: string[];
}): Promise<CreateUserResult> {
  const access = await requirePermission("users.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다" };
  }
  const { name, email } = parsed.data;
  const permissions = sanitizePermissions(parsed.data.permissions);
  const isActive = permissions.length > 0;

  const admin = createSupabaseAdminClient();
  const tempPassword = generateTempPassword();

  // 1) 계정 생성. 트리거가 profiles 행 자동생성(permissions='{}').
  const created = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name },
  });
  const userId = created.data?.user?.id;
  if (!userId) {
    const dup = created.error?.message?.toLowerCase().match(/already|registered|exist/);
    if (dup) return { error: "이미 등록된 이메일입니다" };
    return { error: `계정 생성 실패: ${created.error?.message ?? "알 수 없는 오류"}` };
  }

  // 2) 권한·이름·활성 반영(insert 아닌 UPDATE). 부분 실패 시 멱등 재시도 1회.
  // 신규 계정은 임시 비밀번호 상태 → 첫 로그인 시 강제 변경.
  const patch = { permissions, name, is_active: isActive, must_change_password: true };
  let upErr = (await admin.from("profiles").update(patch).eq("id", userId)).error;
  if (upErr) {
    upErr = (await admin.from("profiles").update(patch).eq("id", userId)).error;
  }
  if (upErr) {
    return {
      error: "계정은 생성됐으나 권한 반영에 실패했습니다. 목록에서 권한을 다시 설정하세요.",
    };
  }

  revalidatePath("/admin/users");
  return { ok: true, userId, email, tempPassword };
}

// 권한 변경 — users.manage 필요. RLS(profiles_update=users.manage)가 강제, SSR 클라로 수행.
// 본인 계정의 users.manage 회수는 락아웃 방지로 차단.
export async function updateUserPermissions(
  userId: string,
  permissionsInput: string[],
): Promise<UserActionResult> {
  const access = await requirePermission("users.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const permissions = sanitizePermissions(permissionsInput);
  if (userId === access.userId && !permissions.includes("users.manage")) {
    return { error: "본인 계정의 사용자 관리 권한은 회수할 수 없습니다" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ permissions })
    .eq("id", userId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "권한 변경에 실패했습니다" };
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

// 활성/비활성 토글 — users.manage 필요. 하드삭제 안 함(is_active 한 컬럼).
// has_permission()이 is_active를 이미 체크 → 비활성 계정은 DB 레벨에서 차단.
// 본인 계정 비활성화는 락아웃 방지로 차단.
export async function setUserActive(
  userId: string,
  active: boolean,
): Promise<UserActionResult> {
  const access = await requirePermission("users.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  if (userId === access.userId && !active) {
    return { error: "본인 계정은 비활성화할 수 없습니다" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: active })
    .eq("id", userId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "상태 변경에 실패했습니다" };
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
