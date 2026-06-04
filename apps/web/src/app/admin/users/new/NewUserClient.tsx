"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SALES_PRESET } from "@jhtechsaas/shared";
import { createUserAction } from "@/lib/users/actions";
import { PermissionPicker } from "../_components/PermissionPicker";
import { TempPasswordModal } from "../_components/TempPasswordModal";

export function NewUserClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // 프리셋 우선 — 기본은 영업담당(가장 흔한 신규 계정).
  const [permissions, setPermissions] = useState<string[]>([...SALES_PRESET]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createUserAction({ name, email, permissions });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setCreated({ email: res.email, password: res.tempPassword });
    });
  }

  return (
    <>
      <form onSubmit={submit} className="flex max-w-2xl flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-small font-medium text-text">이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              placeholder="홍길동"
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-small font-medium text-text">이메일 (로그인 ID)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={200}
              placeholder="sales@jhtech.co.kr"
              className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-body text-text"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-small font-medium text-text">권한</span>
          <PermissionPicker value={permissions} onChange={setPermissions} />
        </div>

        {error && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-small font-medium text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-50"
          >
            {pending ? "생성 중…" : "계정 생성"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/users")}
            className="rounded-md border border-border bg-surface px-4 py-2 text-body font-medium text-text hover:bg-surface-2"
          >
            취소
          </button>
        </div>
      </form>

      {created && (
        <TempPasswordModal
          email={created.email}
          password={created.password}
          onClose={() => {
            setCreated(null);
            router.push("/admin/users");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
