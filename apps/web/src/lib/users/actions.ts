"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizePermissions } from "./permissions-ui";
import { generateTempPassword } from "./password";
import { hasDeleteBlockers, type DeleteUserBlockers } from "./delete-blockers";

export type CreateUserResult =
  | { error: string }
  | { ok: true; userId: string; email: string; tempPassword: string };

export type UserActionResult = { error: string } | { ok: true };

const createSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요").max(60),
  email: z.string().trim().toLowerCase().email("올바른 이메일이 아닙니다").max(200),
  permissions: z.array(z.string()).default([]),
  position: z.string().trim().max(50, "직책은 50자 이내로 입력하세요").optional(),
  phone: z.string().trim().max(30, "연락처는 30자 이내로 입력하세요").optional(),
});

// 계정 생성 — users.manage 필요. createUser(임시 PW) → 트리거가 profile 자동생성 → 권한 UPDATE.
// 권한 0개면 is_active=false 기본(권한 부여 전 활성화 안 함). 임시 PW는 1회만 반환(저장 안 함).
export async function createUserAction(input: {
  name: string;
  email: string;
  permissions: string[];
  position?: string;
  phone?: string;
}): Promise<CreateUserResult> {
  const access = await requirePermission("users.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다" };
  }
  const { name, email } = parsed.data;
  const position = parsed.data.position?.trim() || null;
  const phone = parsed.data.phone?.trim() || null;
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
  const patch = { permissions, name, position, phone, is_active: isActive, must_change_password: true };
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

// 기본정보(이름·직책·연락처) 수정 — users.manage 필요. 이름은 profiles + auth user_metadata 동기.
// 빈 직책·연락처는 null로 저장. 이메일(로그인ID)은 여기서 못 바꿈.
const basicsSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요").max(60),
  position: z.string().trim().max(50, "직책은 50자 이내로 입력하세요"),
  phone: z.string().trim().max(30, "연락처는 30자 이내로 입력하세요"),
});

export async function updateUserBasics(
  userId: string,
  input: { name: string; position: string; phone: string },
): Promise<UserActionResult> {
  const access = await requirePermission("users.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const parsed = basicsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다" };
  }
  const { name } = parsed.data;
  const position = parsed.data.position.trim() || null;
  const phone = parsed.data.phone.trim() || null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ name, position, phone })
    .eq("id", userId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "정보 저장에 실패했습니다" };

  // 이름은 auth user_metadata에도 동기(가입 메타·표시 일관). 실패해도 치명적 아님(로그만).
  const admin = createSupabaseAdminClient();
  const metaErr = (await admin.auth.admin.updateUserById(userId, { user_metadata: { name } })).error;
  if (metaErr) console.error("[updateUserBasics] user_metadata 동기 실패", metaErr);

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

// 하이웍스 발송자 계정 ID 설정 — users.manage 필요. 견적 메일을 이 담당자 명의로 발송할 때 사용.
// 빈 문자열이면 null로 저장(미설정 = 메일 발송 차단).
export async function setUserHiworksId(userId: string, value: string): Promise<UserActionResult> {
  const access = await requirePermission("users.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const parsed = z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9._-]*$/, "영문·숫자·._- 만 사용할 수 있습니다")
    .safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "형식을 확인하세요" };
  const hiworks = parsed.data.length > 0 ? parsed.data : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ hiworks_user_id: hiworks })
    .eq("id", userId)
    .select("id");
  if (error || !data || data.length === 0) return { error: "하이웍스 ID 저장에 실패했습니다" };
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export type DeleteUserResult =
  | { ok: true }
  | { error: string }
  | { error: string; blockers: DeleteUserBlockers };

// 계정 하드 삭제 — users.manage 필요, 본인 불가.
// 담당(assignee) 건이 하나라도 있으면 차단하고 건수를 돌려줘 화면이 "재배정 후 삭제" 안내를 띄운다.
// 감사기록(작성자)은 마이그레이션의 ON DELETE SET NULL로 자동 정리되므로 차단하지 않는다.
// 실삭제 = auth.users 삭제 → profiles ON DELETE CASCADE(아바타 등 동반). 사전 카운트와 실삭제 사이
// 경쟁으로 담당이 새로 생겨도, assignee FK(NO ACTION)가 막아 deleteUser가 실패 → friendly 에러로 처리.
export async function deleteUserAction(userId: string): Promise<DeleteUserResult> {
  const access = await requirePermission("users.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  if (userId === access.userId) return { error: "본인 계정은 삭제할 수 없습니다" };

  const admin = createSupabaseAdminClient();

  // 담당 건 카운트 — service_role이라 RLS 우회. head:true로 행 없이 count만.
  const [companies, applications, quotes, supplyRequests, serviceRequests] = await Promise.all([
    admin.from("companies").select("id", { count: "exact", head: true }).eq("assignee_id", userId),
    admin.from("applications").select("id", { count: "exact", head: true }).eq("assignee_id", userId),
    admin.from("quotes").select("id", { count: "exact", head: true }).eq("assignee_id", userId),
    admin.from("supply_requests").select("id", { count: "exact", head: true }).eq("assignee_id", userId),
    admin.from("service_requests").select("id", { count: "exact", head: true }).eq("assignee_id", userId),
  ]);
  const blockers: DeleteUserBlockers = {
    companies: companies.count ?? 0,
    applications: applications.count ?? 0,
    quotes: quotes.count ?? 0,
    supply_requests: supplyRequests.count ?? 0,
    service_requests: serviceRequests.count ?? 0,
  };
  if (hasDeleteBlockers(blockers)) {
    return { error: "담당 건이 있어 삭제할 수 없습니다", blockers };
  }

  // 아바타 스토리지 정리(best-effort) — avatars/<uid>/ 하위 객체 제거. 실패해도 삭제는 진행.
  const listed = await admin.storage.from("avatars").list(userId);
  if (listed.data && listed.data.length > 0) {
    await admin.storage.from("avatars").remove(listed.data.map((o) => `${userId}/${o.name}`));
  }

  // 실삭제. auth.users 제거 → profiles CASCADE → 감사기록 FK는 SET NULL.
  const del = await admin.auth.admin.deleteUser(userId);
  if (del.error) {
    console.error("[deleteUserAction] 삭제 실패", del.error);
    return {
      error: "삭제 중 오류가 발생했습니다. 담당 건을 모두 재배정했는지 확인 후 다시 시도하세요.",
    };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}
