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
        className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      >
        <option value="">미배정</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <button
        onClick={apply}
        disabled={pending || value === (currentAssigneeId ?? "")}
        className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
      >
        {pending ? "저장 중…" : "담당 저장"}
      </button>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
