"use client";
import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signIn,
    null,
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-h1 font-semibold text-text">재현테크 견적관리</h1>
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-small text-muted">
          이메일
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
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
