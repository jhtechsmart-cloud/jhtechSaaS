"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { DEFAULT_QUOTE_NOTES, defaultSpecSelection, normalizeQuoteNotes } from "@jhtechsaas/shared";
import {
  buildQuoteOptions,
  formBreakdown,
  itemRowsToLines,
  mainEquipmentSpecs,
  rowsToQuoteInput,
  specSelectionBudget,
  validateQuoteForm,
  type ItemRow,
  type QuoteCatalogItem,
  type QuoteRow,
} from "@/lib/quotes/form";
import { createManualQuoteAction } from "@/lib/quotes/actions";
import type { QuoteCustomer } from "@/lib/quotes/customer-search";
import { customerToFormFields } from "@/lib/quotes/customer-prefill";
import { CustomerPicker } from "./CustomerPicker";
import { QuoteLinesEditor } from "@/app/admin/_components/QuoteLinesEditor";
import { QuoteNotesEditor } from "@/app/admin/_components/QuoteNotesEditor";
import { SalesLogPanel } from "@/app/admin/_components/SalesLogPanel";
import { SpecSelectionEditor } from "@/app/admin/_components/SpecSelectionEditor";
import { QuoteTotalsAside } from "@/app/admin/_components/QuoteTotalsAside";
import { QuoteEditModeBanner } from "@/app/admin/_components/QuoteEditModeBanner";
import { QuoteBottomBar } from "@/app/admin/_components/QuoteBottomBar";

// 수기 견적 폼 — 회사 필드 + 카탈로그 라인 에디터. 저장 시 create_manual_quote(app+quote 원자).
// initialCustomer: 고객상세에서 "새 견적"으로 진입(딥링크) 시 프리필될 고객. 폼 내 검색으로도 선택 가능.
export function ManualQuoteForm({
  catalog,
  initialCustomer,
  currentUserId,
}: {
  catalog: QuoteCatalogItem[];
  initialCustomer?: QuoteCustomer;
  currentUserId: string;
}) {
  const init = initialCustomer ? customerToFormFields(initialCustomer) : null;
  const [company, setCompany] = useState(init?.company ?? "");
  const [ceo, setCeo] = useState(init?.ceo ?? "");
  const [phone, setPhone] = useState(init?.phone ?? "");
  const [email, setEmail] = useState(init?.email ?? "");
  // 연결된 고객 id(있으면 견적이 그 고객 이력에 노출). 검색 선택/딥링크로 설정, "직접 입력"으로 해제.
  const [companyId, setCompanyId] = useState<string | null>(init?.companyId ?? null);
  const [items, setItems] = useState<ItemRow[]>([{ equipmentId: "", name: "", unitPrice: 0, quantity: 1, included: [] }]);
  // 추가옵션(별도 과금) — 포함옵션과 별개. 수기 견적은 빈 목록으로 시작.
  const [options, setOptions] = useState<QuoteRow[]>([]);
  // 수기 견적은 초기 장비 없음 → []로 시작. 첫 장비 선택 시 아래 effect가 기본 사양을 채운다.
  const [specSelection, setSpecSelection] = useState<string[]>([]);
  // 특기사항 — 기본 2줄 프리필. 편집한 줄이 발행 PDF에 반영된다.
  const [notes, setNotes] = useState<string[]>(() => [...DEFAULT_QUOTE_NOTES]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 메인 장비가 바뀌면 그 장비의 기본 사양(pdf:true, 없으면 전체)으로 재설정.
  // mainEqId로 catalog를 직접 조회 → 의존성에 items 불필요(수량만 바꿔도 안 도는다).
  const mainEqId = items.find((i) => i.equipmentId)?.equipmentId ?? "";
  const prevEqRef = useRef(mainEqId);
  useEffect(() => {
    if (prevEqRef.current !== mainEqId) {
      prevEqRef.current = mainEqId;
      const specs = mainEqId ? (catalog.find((c) => c.id === mainEqId)?.specs ?? []) : [];
      setSpecSelection(defaultSpecSelection(specs));
    }
  }, [mainEqId, catalog]);

  // 실시간 소계 분해(폼 상태 기반, 표시 전용 — 저장 권위는 서버 RPC). 상세 요약과 동일 표기.
  const breakdown = formBreakdown(items, options);
  const supplyPrice = breakdown.equipmentSubtotal + breakdown.optionSubtotal;

  function submit(status: "draft" | "issued") {
    if (company.trim() === "") {
      setError("회사명을 입력하세요.");
      return;
    }
    const { items: pItems, options: pOptions } = rowsToQuoteInput(
      itemRowsToLines(items),
      buildQuoteOptions(items, options),
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
        specSelection,
        notes: normalizeQuoteNotes(notes),
        companyId: companyId ?? undefined,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <QuoteEditModeBanner />
      <div className="grid grid-cols-1 gap-6 pb-24 lg:grid-cols-[1fr_320px] lg:pb-0">
      <div className="flex flex-col gap-6">
        <section className="rounded-md border border-border border-l-4 border-l-accent bg-surface p-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-h2 font-medium text-text">고객</h2>
            {companyId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-small font-medium text-accent-2">
                고객 연결됨
                <button
                  type="button"
                  onClick={() => setCompanyId(null)}
                  disabled={pending}
                  className="underline disabled:opacity-50"
                  title="연결 해제(직접 입력)"
                >
                  직접 입력
                </button>
              </span>
            )}
          </div>
          {/* 기존 고객 검색·선택 → 회사 정보 프리필 + companyId 연결(견적이 고객 이력에 노출) */}
          <div className="mb-3">
            <CustomerPicker
              disabled={pending}
              onSelect={(c) => {
                const f = customerToFormFields(c);
                setCompany(f.company);
                setCeo(f.ceo);
                setPhone(f.phone);
                setEmail(f.email);
                setCompanyId(f.companyId);
              }}
            />
          </div>
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
          options={options}
          setOptions={setOptions}
          disabled={pending}
        />
        <SpecSelectionEditor
          specs={mainEquipmentSpecs(items, catalog)}
          selected={specSelection}
          setSelected={setSpecSelection}
          max={specSelectionBudget(items, options, catalog, specSelection).max}
          disabled={pending}
        />
        <QuoteNotesEditor notes={notes} setNotes={setNotes} disabled={pending} />
      </div>

      <QuoteTotalsAside
        equipmentSubtotal={breakdown.equipmentSubtotal}
        optionSubtotal={breakdown.optionSubtotal}
        itemLines={breakdown.itemLines}
        optionLines={breakdown.optionLines}
        total={supplyPrice}
        // 영업일지 — 우측 합계 박스 아래. 연결 고객이 있을 때만 의미(미연결이면 안내만 노출).
        below={<SalesLogPanel companyId={companyId} currentUserId={currentUserId} />}
      >
        {error && <p className="text-small text-danger">{error}</p>}
        <button type="button" onClick={() => submit("draft")} disabled={pending}
          className="rounded-md bg-surface-2 px-4 py-2 text-small font-medium text-text disabled:opacity-50">임시저장</button>
        <button type="button" onClick={() => submit("issued")} disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-small font-medium text-white disabled:opacity-50">발행하기</button>
      </QuoteTotalsAside>
      </div>
      {/* lg 미만: 하단 고정 합계 바(데스크톱은 우측 sticky 요약) — 같은 totals·submit 재사용 */}
      <QuoteBottomBar
        supplyPrice={supplyPrice}
        pending={pending}
        onSave={() => submit("draft")}
        onIssue={() => submit("issued")}
        error={error}
      />
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
