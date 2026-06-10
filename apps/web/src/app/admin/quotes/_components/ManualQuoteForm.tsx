"use client";
import { useState, useTransition } from "react";
import {
  availableIncludedNames,
  buildQuoteOptions,
  formPreviewTotals,
  itemRowsToLines,
  rowsToQuoteInput,
  validateQuoteForm,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";
import { createManualQuoteAction } from "@/lib/quotes/actions";
import { QuoteLinesEditor } from "@/app/admin/_components/QuoteLinesEditor";
import { QuoteTotalsAside } from "@/app/admin/_components/QuoteTotalsAside";
import { QuoteEditModeBanner } from "@/app/admin/_components/QuoteEditModeBanner";

// 수기 견적 폼 — 회사 필드 + 카탈로그 라인 에디터. 저장 시 create_manual_quote(app+quote 원자).
export function ManualQuoteForm({ catalog }: { catalog: QuoteCatalogItem[] }) {
  const [company, setCompany] = useState("");
  const [ceo, setCeo] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ equipmentId: "", name: "", unitPrice: 0, quantity: 1 }]);
  const [includedDeselected, setIncludedDeselected] = useState<string[]>([]);
  const [options, setOptions] = useState<QuoteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 실시간 합계 미리보기(폼 상태 기반, 표시 전용 — 저장 권위는 서버 RPC).
  const totals = formPreviewTotals(items, options, includedDeselected, catalog);

  function submit(status: "draft" | "issued") {
    if (company.trim() === "") {
      setError("회사명을 입력하세요.");
      return;
    }
    const checkedIncluded = availableIncludedNames(items, catalog).filter((n) => !includedDeselected.includes(n));
    const { items: pItems, options: pOptions } = rowsToQuoteInput(
      itemRowsToLines(items),
      buildQuoteOptions(checkedIncluded, options),
    );
    const msg = validateQuoteForm(pItems, pOptions);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createManualQuoteAction({
        company,
        ceo,
        phone,
        email,
        items: pItems,
        options: pOptions,
        status,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <QuoteEditModeBanner />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-6">
        <section className="rounded-md border border-border border-l-4 border-l-accent bg-surface p-4">
          <h2 className="mb-2 text-h2 font-medium text-text">고객</h2>
          <div className="flex flex-col gap-2">
            <Field label="회사명" value={company} onChange={setCompany} disabled={pending} required />
            <Field label="대표자" value={ceo} onChange={setCeo} disabled={pending} />
            <Field label="연락처" value={phone} onChange={setPhone} disabled={pending} />
            <Field label="이메일" value={email} onChange={setEmail} disabled={pending} />
          </div>
        </section>

        <QuoteLinesEditor
          catalog={catalog}
          items={items}
          setItems={setItems}
          includedDeselected={includedDeselected}
          setIncludedDeselected={setIncludedDeselected}
          options={options}
          setOptions={setOptions}
          disabled={pending}
        />
      </div>

      <QuoteTotalsAside totals={totals}>
        {error && <p className="text-small text-danger">{error}</p>}
        <button type="button" onClick={() => submit("draft")} disabled={pending}
          className="rounded-md bg-surface-2 px-4 py-2 text-small font-medium text-text disabled:opacity-50">임시저장</button>
        <button type="button" onClick={() => submit("issued")} disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-50">발행하기</button>
      </QuoteTotalsAside>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  required?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 text-body">
      <span className="w-20 shrink-0 text-small text-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-body text-text"
      />
    </label>
  );
}
