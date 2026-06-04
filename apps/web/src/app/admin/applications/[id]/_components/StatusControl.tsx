"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { APPLICATION_STATUSES, APPLICATION_STATUS_META } from "@/lib/application-status";
import type { ApplicationStatus } from "@/lib/customers/history";
import { updateApplicationStatus } from "@/lib/applications/admin-actions";

export function StatusControl({
  id, current, hasAssignee,
}: {
  id: string;
  current: ApplicationStatus;
  hasAssignee: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ApplicationStatus>(current);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 담당자 미배정이면 상태 변경 불가 — 먼저 배정하도록 안내(워크플로 강제).
  if (!hasAssignee) {
    return <p className="text-small text-muted">담당자를 먼저 배정해주세요.</p>;
  }

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await updateApplicationStatus(id, status);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
        className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>{APPLICATION_STATUS_META[s].label}</option>
        ))}
      </select>
      <button
        onClick={apply}
        disabled={pending || status === current}
        className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
      >
        {pending ? "변경 중…" : "상태 변경"}
      </button>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
