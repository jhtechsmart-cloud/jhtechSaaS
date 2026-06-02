"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SERVICE_REQUEST_STATUSES, type ServiceRequestStatus } from "@/lib/service-requests/status";
import { updateServiceRequestStatus } from "@/lib/service-requests/admin-actions";
import { STATUS_META } from "../../_components/StatusBadge";

const TERMINAL = new Set<ServiceRequestStatus>(["done", "canceled"]);

export function StatusControl({ id, current }: { id: string; current: ServiceRequestStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<ServiceRequestStatus>(current);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 종결(done/canceled)은 DB 트리거가 변경을 막음 → UI에서도 비활성.
  if (TERMINAL.has(current)) {
    return <p className="text-small text-muted">종결된 신청입니다(상태 변경 불가).</p>;
  }

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await updateServiceRequestStatus(id, status);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as ServiceRequestStatus)}
        className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
      >
        {SERVICE_REQUEST_STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_META[s].label}</option>
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
