"use client";
import { useState, useTransition } from "react";
import { rowsToQuoteInput, validateQuoteForm, type QuoteRow } from "@/lib/quotes/form";
import { createQuoteAction } from "@/lib/quotes/actions";
import { QuoteLinesEditor } from "@/app/admin/_components/QuoteLinesEditor";

// 견적 작성 폼 — 기존 의뢰 위에. 라인 에디터·실시간 합계는 QuoteLinesEditor 공유.
// 금액 미리보기는 클라, 저장 권위는 서버 RPC(createQuoteAction).
export function QuoteForm({
  applicationId,
  initialItems,
  initialOptions,
}: {
  applicationId: string;
  initialItems?: QuoteRow[];
  initialOptions?: QuoteRow[];
}) {
  const [items, setItems] = useState<QuoteRow[]>(
    initialItems && initialItems.length > 0 ? initialItems : [{ name: "", unitPrice: 0, quantity: 1 }],
  );
  const [options, setOptions] = useState<QuoteRow[]>(initialOptions ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(status: "draft" | "issued") {
    const msg = validateQuoteForm(items, options);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    const { items: pItems, options: pOptions } = rowsToQuoteInput(items, options);
    startTransition(async () => {
      const res = await createQuoteAction(applicationId, { items: pItems, options: pOptions, status });
      // 성공 시 액션이 redirect(throw) → 여기 도달 시 에러만.
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <QuoteLinesEditor items={items} setItems={setItems} options={options} setOptions={setOptions} disabled={pending} />
      {error && <p className="text-small text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => submit("draft")}
          disabled={pending}
          className="rounded-md bg-surface-2 px-4 py-2 text-small font-medium text-text disabled:opacity-50"
        >
          임시저장
        </button>
        <button
          type="button"
          onClick={() => submit("issued")}
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-50"
        >
          발행하기
        </button>
      </div>
    </div>
  );
}
