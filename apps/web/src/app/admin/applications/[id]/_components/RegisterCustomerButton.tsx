"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerCustomerFromApplication } from "@/lib/applications/admin-actions";

export function RegisterCustomerButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await registerCustomerFromApplication(id);
      if ("error" in res) { setError(res.error); return; }
      if (res.companyId) router.push(`/admin/customers/${res.companyId}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={apply}
        disabled={pending}
        className="rounded-md border border-accent px-2.5 py-1 text-small font-medium text-accent disabled:opacity-60"
      >
        {pending ? "등록 중…" : "고객으로 등록"}
      </button>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
