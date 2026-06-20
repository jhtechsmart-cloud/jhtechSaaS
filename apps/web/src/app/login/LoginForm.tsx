"use client";
import { useActionState, useState } from "react";
import { signIn, type SignInState } from "./actions";
import { buildSavedEmailCookie } from "@/lib/auth/saved-email";

export default function LoginForm({ savedEmail = "" }: { savedEmail?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signIn,
    null,
  );
  // 이메일은 제어 입력으로 둔다. React 19는 form action 제출 후 비제어 입력을
  // defaultValue로 자동 초기화하는데, 로그인 실패 시(리다이렉트 없음) 사용자가
  // 방금 친 아이디가 옛 저장값으로 되돌아가는 버그가 생기기 때문이다.
  const [email, setEmail] = useState(savedEmail);
  const [remember, setRemember] = useState(savedEmail !== "");

  // 제출 시 "이메일 저장" 체크 상태에 따라 쿠키를 쓰거나 지운다.
  // preventDefault 하지 않으므로 서버 액션(action)은 그대로 실행된다.
  function rememberOnSubmit() {
    document.cookie = buildSavedEmailCookie(email, remember);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-h1 font-semibold text-text">재현테크 견적관리</h1>
      <form action={action} onSubmit={rememberOnSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-small text-muted">
          이메일
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
          />
        </label>
        <label className="flex flex-col gap-1 text-small text-muted">
          비밀번호
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
          />
        </label>
        <label className="flex items-center gap-2 text-small text-muted">
          <input
            name="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 rounded border-border accent-accent"
          />
          아이디 저장
        </label>
        {state?.error ? (
          <p className="text-small text-danger">{state.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
        >
          {pending ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
