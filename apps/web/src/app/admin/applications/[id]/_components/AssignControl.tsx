"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignApplication } from "@/lib/applications/admin-actions";

export function AssignControl({
  id, currentAssigneeId, staff,
}: {
  id: string;
  currentAssigneeId: string | null;
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(currentAssigneeId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 값이 바뀌어야(dirty) 저장 버튼을 스틸블루로 강조 — 평소엔 고스트(연한 테두리).
  const dirty = value !== (currentAssigneeId ?? "");

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await assignApplication(id, value === "" ? null : value);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-small text-text"
      >
        <option value="">미배정</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <button
        onClick={apply}
        disabled={pending || !dirty}
        className={`rounded-md px-2.5 py-1.5 text-small font-medium ${
          dirty
            ? "bg-accent text-white"
            : "border border-border bg-transparent text-muted"
        }`}
      >
        {pending ? "저장 중…" : "담당 저장"}
      </button>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
