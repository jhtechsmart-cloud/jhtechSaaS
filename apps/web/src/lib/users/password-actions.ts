"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAnonClient, validateNewPassword } from "@jhtechsaas/shared";
import { requirePermission } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPublicEnv } from "@/env";
import { generateTempPassword } from "./password";

export type ChangePasswordResult = { error: string } | { ok: true };
export type ResetPasswordResult = { error: string } | { ok: true; tempPassword: string };

const changeSchema = z.object({
  currentPassword: z.string().min(1, "현재 비밀번호를 입력하세요"),
  newPassword: z.string().min(1, "새 비밀번호를 입력하세요"),
});

// 본인 비밀번호 변경 — 로그인 세션 필요. 현재 비밀번호 재로그인 검증 → updateUser → 플래그 해제.
export async function changeOwnPasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ChangePasswordResult> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다" };
  }
  const { currentPassword, newPassword } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "로그인이 필요합니다" };

  // 1) 현재 비밀번호 검증 — 세션을 건드리지 않는 별도 anon 클라이언트로 재로그인 시도.
  //    createAnonClient는 SSR 쿠키 클라이언트가 아니라 인메모리 클라이언트라 현재 콘솔 세션에 영향 없음.
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
  const verifier = createAnonClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const verify = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verify.error) return { error: "현재 비밀번호가 올바르지 않습니다" };

  // 2) 새 비밀번호 규칙 검증.
  const violation = validateNewPassword(newPassword, { current: currentPassword });
  if (violation) return { error: violation };

  // 3) 비밀번호 변경(현재 세션 클라이언트).
  const updated = await supabase.auth.updateUser({ password: newPassword });
  if (updated.error) return { error: "비밀번호 변경에 실패했습니다" };

  // 4) 강제 변경 플래그 해제 — 일반 직원은 RLS상 본인 profiles UPDATE 불가 → admin 클라로 수행.
  //    세션 user.id 본인 행만 변경하므로 안전.
  const admin = createSupabaseAdminClient();
  const cleared = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (cleared.error) {
    // 비밀번호는 이미 바뀌었으나 플래그 해제 실패 — 다음 로그인에 강제 패널이 또 뜰 수 있음.
    return { error: "비밀번호는 변경됐으나 상태 갱신에 실패했습니다. 다시 시도하세요." };
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}

// 관리자 비밀번호 재설정 — users.manage 필요. 새 임시 비밀번호 발급 + 강제 변경 플래그 set.
export async function resetUserPasswordAction(userId: string): Promise<ResetPasswordResult> {
  const access = await requirePermission("users.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };

  const id = z.string().uuid().safeParse(userId);
  if (!id.success) return { error: "잘못된 사용자입니다" };

  // 본인 계정은 이 경로로 재설정 금지. admin API가 본인 세션을 무효화하면
  // 임시 비밀번호를 화면에서 보기 전에 로그아웃돼 스스로 잠길 수 있다.
  // 본인 비밀번호 변경은 '계정 설정'(/admin/account)의 현재-비번 검증 흐름으로.
  if (access.userId === id.data) {
    return { error: "본인 계정은 여기서 재설정할 수 없습니다. '계정 설정'에서 비밀번호를 변경하세요." };
  }

  const admin = createSupabaseAdminClient();
  const tempPassword = generateTempPassword();

  const updated = await admin.auth.admin.updateUserById(id.data, { password: tempPassword });
  if (updated.error) return { error: `재설정 실패: ${updated.error.message}` };

  const flagged = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", id.data);
  if (flagged.error) {
    return { error: "비밀번호는 재설정됐으나 상태 갱신에 실패했습니다" };
  }

  revalidatePath(`/admin/users/${id.data}`);
  return { ok: true, tempPassword };
}
