"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UserListRow } from "@/lib/users/queries";
import { updateUserPermissions, setUserActive, setUserHiworksId, updateUserBasics, deleteUserAction } from "@/lib/users/actions";
import { resetUserPasswordAction } from "@/lib/users/password-actions";
import { formatDeleteBlockers } from "@/lib/users/delete-blockers";
import { PermissionPicker } from "../_components/PermissionPicker";
import { TempPasswordModal } from "../_components/TempPasswordModal";

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
  const [resetPending, startReset] = useTransition();
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [hiworks, setHiworks] = useState<string>(user.hiworks_user_id ?? "");
  const [hiworksPending, startHiworks] = useTransition();
  const [name, setName] = useState<string>(user.name);
  const [position, setPosition] = useState<string>(user.position ?? "");
  const [phone, setPhone] = useState<string>(user.phone ?? "");
  const [basicsPending, startBasics] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const basicsDirty =
    name.trim() !== user.name || position !== (user.position ?? "") || phone !== (user.phone ?? "");

  function saveBasics() {
    setMessage(null);
    startBasics(async () => {
      const res = await updateUserBasics(user.id, { name, position, phone });
      if ("error" in res) setMessage({ kind: "error", text: res.error });
      else {
        setMessage({ kind: "ok", text: "기본 정보를 저장했습니다" });
        router.refresh();
      }
    });
  }

  function resetPassword() {
    if (!window.confirm("이 사용자의 비밀번호를 새 임시 비밀번호로 재설정할까요?")) return;
    setMessage(null);
    startReset(async () => {
      const res = await resetUserPasswordAction(user.id);
      if ("error" in res) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      setResetResult({ email: user.email ?? "-", password: res.tempPassword });
    });
  }

  function saveHiworks() {
    setMessage(null);
    startHiworks(async () => {
      const res = await setUserHiworksId(user.id, hiworks);
      if ("error" in res) setMessage({ kind: "error", text: res.error });
      else {
        setMessage({ kind: "ok", text: "하이웍스 ID를 저장했습니다" });
        router.refresh();
      }
    });
  }

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

  function deleteUser() {
    if (
      !window.confirm(
        "이 계정을 완전히 삭제할까요?\n되돌릴 수 없습니다. (담당 건이 남아 있으면 삭제되지 않습니다.)",
      )
    )
      return;
    setMessage(null);
    startDelete(async () => {
      const res = await deleteUserAction(user.id);
      if ("ok" in res) {
        router.push("/admin/users");
        return;
      }
      if ("blockers" in res) {
        setMessage({
          kind: "error",
          text: `이 사용자에게 연결된 ${formatDeleteBlockers(res.blockers)}이(가) 있어 삭제할 수 없습니다. 먼저 다른 담당자로 변경(재배정)한 뒤 다시 시도하세요.`,
        });
        return;
      }
      setMessage({ kind: "error", text: res.error });
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
      {/* 기본 정보 — 이름·직책·연락처 편집(이메일=로그인ID는 읽기전용). */}
      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        <span className="text-body font-semibold text-text">기본 정보</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-micro text-muted">이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="rounded-md border border-border px-3 py-2 text-small text-text"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-micro text-muted">직책</span>
            <input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              maxLength={50}
              placeholder="영업팀 대리"
              className="rounded-md border border-border px-3 py-2 text-small text-text"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-micro text-muted">연락처</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              maxLength={30}
              placeholder="010-1234-5678"
              className="rounded-md border border-border px-3 py-2 text-small text-text"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            onClick={saveBasics}
            disabled={basicsPending || !basicsDirty || name.trim().length === 0}
            className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-50"
          >
            {basicsPending ? "저장 중…" : "기본 정보 저장"}
          </button>
        </div>
      </div>

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
        <div className="flex items-center justify-between gap-2">
          <span className="text-small text-muted">비밀번호</span>
          {/* 본인 계정은 임시 비번 재설정 금지 — admin API가 본인 세션을 무효화해
              임시 비번을 보기 전에 로그아웃돼 잠기기 때문. 계정 설정에서 직접 변경. */}
          {isSelf ? (
            <button
              onClick={() => router.push("/admin/account")}
              className="text-small text-accent underline"
            >
              계정 설정에서 변경
            </button>
          ) : (
            <button
              onClick={resetPassword}
              disabled={resetPending}
              className="text-small text-accent underline disabled:opacity-40 disabled:no-underline"
            >
              {resetPending ? "재설정 중…" : "임시 비밀번호로 재설정"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-body font-semibold text-text">권한</span>
        <PermissionPicker value={permissions} onChange={setPermissions} />
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <span className="text-body font-semibold text-text">하이웍스 발송자 ID</span>
        <span className="text-micro text-muted">
          견적 메일을 이 담당자 명의로 발송할 때 쓰는 하이웍스 계정 ID. 미설정 시 발송 차단됩니다.
        </span>
        <div className="flex items-center gap-2">
          <input
            value={hiworks}
            onChange={(e) => setHiworks(e.target.value)}
            placeholder="예: hong"
            className="flex-1 rounded-md border border-border px-3 py-2 font-mono text-small"
          />
          <button
            onClick={saveHiworks}
            disabled={hiworksPending || hiworks === (user.hiworks_user_id ?? "")}
            className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-50"
          >
            {hiworksPending ? "저장 중…" : "저장"}
          </button>
        </div>
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

      {/* 위험 구역 — 계정 하드 삭제. 담당 건이 있으면 서버가 차단하고 안내. 본인 계정은 불가. */}
      <div className="flex flex-col gap-2 rounded-md border border-danger/40 bg-danger/5 p-4">
        <span className="text-body font-semibold text-danger">위험 구역 — 계정 삭제</span>
        <span className="text-micro text-muted">
          계정을 완전히 삭제합니다(되돌릴 수 없음). 담당 고객사·의뢰·견적·소모품·A/S가 남아 있으면
          삭제되지 않으니, 먼저 다른 담당자로 변경(재배정)하세요. 작성 이력은 보존되고 작성자 표시만 비워집니다.
        </span>
        <div className="flex justify-end">
          <button
            onClick={deleteUser}
            disabled={deletePending || isSelf}
            title={isSelf ? "본인 계정은 삭제할 수 없습니다" : undefined}
            className="rounded-md border border-danger px-4 py-2 text-small font-medium text-danger hover:bg-danger hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-danger"
          >
            {deletePending ? "삭제 중…" : "계정 삭제"}
          </button>
        </div>
      </div>

      {resetResult && (
        <TempPasswordModal
          email={resetResult.email}
          password={resetResult.password}
          title="비밀번호가 재설정되었습니다"
          description="아래 임시 비밀번호를 담당자에게 전달하세요. 다음 로그인 시 비밀번호 변경이 필요합니다."
          onClose={() => {
            setResetResult(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
