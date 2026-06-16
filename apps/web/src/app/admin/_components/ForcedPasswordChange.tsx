import { signOut } from "@/app/login/actions";
import { ChangePasswordForm } from "../account/ChangePasswordForm";

// 강제 변경 패널 — must_change_password=true인 사용자에게 콘솔 대신 전체화면 렌더.
// 변경 전엔 어떤 메뉴에도 접근 불가(layout이 children 대신 이걸 렌더).
export function ForcedPasswordChange() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg p-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-lg">
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 font-semibold text-text">비밀번호를 변경해야 합니다</h1>
          <p className="text-small text-muted">
            임시 비밀번호로 로그인했습니다. 계속하려면 새 비밀번호로 변경하세요.
          </p>
        </div>
        <ChangePasswordForm forced />
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </div>
    </main>
  );
}
