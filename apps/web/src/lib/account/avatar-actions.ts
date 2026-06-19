"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AvatarActionResult = { error: string } | null;

// 프로필 사진 경로 저장 — 로그인 사용자 본인 행. profiles_update가 users.manage 전용이라
// admin 클라로 id=본인만 갱신(비번 플래그 해제와 동일 패턴). 경로는 본인 폴더(<uid>/...)만 허용.
export async function setAvatarAction(path: string): Promise<AvatarActionResult> {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  // 클라가 보낸 경로가 본인 폴더인지 서버에서 재확인(위조 차단).
  if (!z.string().min(1).max(300).safeParse(path).success || !path.startsWith(`${access.userId}/`)) {
    return { error: "잘못된 경로입니다." };
  }
  const admin = createSupabaseAdminClient();
  // 이전 사진 경로 — 새 파일명은 고유(타임스탬프)라 교체 시 옛 객체는 고아가 됨 → 정리.
  const { data: prev } = await admin.from("profiles").select("avatar_url").eq("id", access.userId).single();
  const oldPath = (prev as { avatar_url?: string | null } | null)?.avatar_url ?? null;

  const { error } = await admin.from("profiles").update({ avatar_url: path }).eq("id", access.userId);
  if (error) {
    console.error("[avatar.set]", error);
    return { error: "사진 저장에 실패했습니다." };
  }
  if (oldPath && oldPath !== path) {
    const { error: stErr } = await admin.storage.from("avatars").remove([oldPath]);
    if (stErr) console.error("[avatar.set] 이전 사진 정리 실패(무시)", stErr);
  }
  revalidatePath("/admin", "layout");
  return null;
}

// 프로필 사진 제거 — storage 객체 삭제 + avatar_url null.
export async function removeAvatarAction(): Promise<AvatarActionResult> {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  const admin = createSupabaseAdminClient();
  const { data: prof } = await admin.from("profiles").select("avatar_url").eq("id", access.userId).single();
  const path = (prof as { avatar_url?: string | null } | null)?.avatar_url ?? null;
  if (path) {
    const { error: stErr } = await admin.storage.from("avatars").remove([path]);
    if (stErr) console.error("[avatar.remove] storage", stErr); // 행은 계속 정리
  }
  const { error } = await admin.from("profiles").update({ avatar_url: null }).eq("id", access.userId);
  if (error) {
    console.error("[avatar.remove]", error);
    return { error: "사진 제거에 실패했습니다." };
  }
  revalidatePath("/admin", "layout");
  return null;
}
