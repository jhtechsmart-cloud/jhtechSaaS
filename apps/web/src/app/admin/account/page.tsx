import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { avatarPublicUrl } from "@/lib/avatar/avatar";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { AvatarUpload } from "./AvatarUpload";

// 계정 설정 — 로그인한 콘솔 사용자 본인의 이메일·이름·권한(읽기전용) + 비밀번호 변경.
export default async function AccountPage() {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-h1 font-semibold text-text">계정</h1>
        <p className="text-small text-muted">콘솔 접근 권한이 없습니다.</p>
      </section>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, avatar_url")
    .eq("id", access.userId)
    .single();
  const avatarUrl = avatarPublicUrl((profile as { avatar_url?: string | null } | null)?.avatar_url);

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-h1 font-semibold text-text">계정 설정</h1>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        <h2 className="text-h2 font-semibold text-text">프로필 사진</h2>
        <AvatarUpload userId={access.userId} name={profile?.name ?? null} initialUrl={avatarUrl} />
      </div>

      <div className="flex max-w-md flex-col gap-1 rounded-md border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-small text-muted">이름</span>
          <span className="text-small text-text">{profile?.name ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-small text-muted">이메일</span>
          <span className="font-mono text-small text-text">{user?.email ?? "-"}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-h2 font-semibold text-text">비밀번호 변경</h2>
        <ChangePasswordForm />
      </div>
    </section>
  );
}
