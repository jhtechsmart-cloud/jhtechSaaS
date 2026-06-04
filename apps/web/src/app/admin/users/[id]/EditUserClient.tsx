"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserListRow } from "@/lib/users/queries";
import { updateUserPermissions, setUserActive } from "@/lib/users/actions";
import { PermissionPicker } from "../_components/PermissionPicker";

export function EditUserClient({
  user,
  isSelf,
}: {
  user: UserListRow;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [permissions, setPermissions] = useState<string[]>(user.permissions);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [savePending, startSave] = useTransition();
  const [activePending, startActive] = useTransition();

  function save() {
    setMessage(null);
    startSave(async () => {
      const res = await updateUserPermissions(user.id, permissions);
      if ("error" in res) setMessage({ kind: "error", text: res.error });
      else {
        setMessage({ kind: "ok", text: "권한을 저장했습니다" });
        router.refresh();
      }
    });
  }

  function toggleActive() {
    setMessage(null);
    startActive(async () => {
      const res = await setUserActive(user.id, !user.is_active);
      if ("error" in res) setMessage({ kind: "error", text: res.error });
      else router.refresh();
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-small text-muted">이메일</span>
          <span className="font-mono text-small text-text">{user.email ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-small text-muted">상태</span>
          <span className="flex items-center gap-3">
            {user.is_active ? (
              <span className="rounded-sm bg-active/10 px-2 py-0.5 text-small font-medium text-active">
                활성
              </span>
            ) : (
              <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-small font-medium text-muted">
                비활성
              </span>
            )}
            <button
              onClick={toggleActive}
              disabled={activePending || (isSelf && user.is_active)}
              title={isSelf && user.is_active ? "본인 계정은 비활성화할 수 없습니다" : undefined}
              className="text-small text-accent underline disabled:opacity-40 disabled:no-underline"
            >
              {user.is_active ? "비활성화" : "활성화"}
            </button>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-small font-medium text-text">권한</span>
        <PermissionPicker value={permissions} onChange={setPermissions} />
      </div>

      {message && (
        <p
          className={`rounded-md px-3 py-2 text-small font-medium ${
            message.kind === "ok"
              ? "bg-active/10 text-active"
              : "bg-danger/10 text-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={savePending}
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-50"
        >
          {savePending ? "저장 중…" : "권한 저장"}
        </button>
        <button
          onClick={() => router.push("/admin/users")}
          className="rounded-md border border-border bg-surface px-4 py-2 text-body font-medium text-text hover:bg-surface-2"
        >
          목록으로
        </button>
      </div>
    </div>
  );
}
