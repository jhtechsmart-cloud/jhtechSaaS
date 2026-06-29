"use client";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  supplyRequestFormSchema,
  buildSupplyRequestPayload,
  QTY_MAX,
  type SupplyRequestFormInput,
  type SupplyRequestFormInputRaw,
  type LookupResult,
  type ListConsumablesResult,
} from "@/lib/supply-requests/schema";
import { buildSections } from "@/lib/supply-requests/grouping";
import { formatBizNo, formatPhone } from "@/lib/supply-requests/format";
import { FormErrorSummary } from "@/components/FormErrorSummary";
import {
  lookupCompanyForSupply,
  listConsumablesForCompany,
  lastSupplyRequestForCompany,
  submitSupplyRequest,
} from "../actions";

const FIELD = "rounded-md border border-border bg-surface px-3 py-2 text-body text-text";
// TODO: 재현테크 대표 소모품 주문 직통번호로 교체(운영 이월).
const SUPPORT_PHONE = "1577-0000";
const SUPPORT_EMAIL = "cs@jhtech.co.kr";

type LookupStatus = "idle" | "loading" | "found" | "notfound" | "error";

export function SupplyRequestForm({ policyBody }: { policyBody: string }) {
  const {
    register, handleSubmit, trigger, getValues,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<SupplyRequestFormInputRaw, unknown, SupplyRequestFormInput>({
    resolver: zodResolver(supplyRequestFormSchema),
    defaultValues: { biz_no: "", requester_name: "", requester_phone: "", note: "" },
  });

  const [status, setStatus] = useState<LookupStatus>("idle");
  const [company, setCompany] = useState<LookupResult | null>(null);
  const [data, setData] = useState<ListConsumablesResult | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [prior, setPrior] = useState<{ consumable_id: string; qty: number }[]>([]);
  const [search, setSearch] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const allowedIds = useMemo(() => new Set((data?.consumables ?? []).map((c) => c.id)), [data]);
  const sections = useMemo(() => (data ? buildSections(data) : []), [data]);
  const nameById = useMemo(() => new Map((data?.consumables ?? []).map((c) => [c.id, { name: c.name, unit: c.unit }])), [data]);
  const priorAvailable = useMemo(() => prior.filter((p) => allowedIds.has(p.consumable_id)), [prior, allowedIds]);
  const selectedCount = useMemo(() => Object.values(qty).filter((q) => q > 0).length, [qty]);

  // RHF register + 자동 하이픈 포맷(입력 즉시 표시값 재작성, RHF에도 반영).
  const bizReg = register("biz_no");
  const phoneReg = register("requester_phone");

  // 조회 결과를 초기화하고 사업자번호를 다시 편집 가능하게(오접수·stale 방지: 조회 biz를 잠그고 "다시 조회"로만 변경).
  function resetLookup() {
    setStatus("idle"); setCompany(null); setData(null); setPrior([]);
    setQty({}); setSearch(""); setServerError(null); setItemsError(null);
  }

  async function onLookup() {
    setServerError(null); setItemsError(null);
    if (!(await trigger("biz_no"))) return;
    setStatus("loading");
    const biz = getValues("biz_no");
    const outcome = await lookupCompanyForSupply(biz);
    if (outcome.kind === "error") { setStatus("error"); return; }
    if (outcome.kind === "notfound") { setCompany(null); setData(null); setStatus("notfound"); return; }
    setCompany(outcome.company);
    setStatus("found");
    setLoadingItems(true);
    const [list, last] = await Promise.all([listConsumablesForCompany(biz), lastSupplyRequestForCompany(biz)]);
    setData(list);
    setPrior(last.items);
    setQty({});
    setLoadingItems(false);
  }

  function setQuantity(id: string, n: number) {
    const clamped = Math.max(0, Math.min(QTY_MAX, Math.floor(Number.isFinite(n) ? n : 0)));
    setQty((prev) => ({ ...prev, [id]: clamped }));
  }

  function applyReorder() {
    const next: Record<string, number> = {};
    for (const p of priorAvailable) next[p.consumable_id] = Math.max(1, Math.min(QTY_MAX, p.qty));
    setQty(next);
    setItemsError(null);
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null); setItemsError(null);
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([consumable_id, q]) => ({ consumable_id, qty: q }));
    if (items.length === 0) { setItemsError("소모품을 1개 이상 선택하세요"); return; }
    try {
      const payload = buildSupplyRequestPayload(values, items);
      const res = await submitSupplyRequest(payload);
      if (res?.error) setServerError(res.error);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "제출에 실패했습니다");
    }
  });

  const needle = search.trim().toLowerCase();
  const hasConsumables = !!data && data.consumables.length > 0;

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6 pb-24">
      {/* 1단계: 사업자번호 조회 */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <label className="text-small text-muted" htmlFor="sup-bizno">사업자등록번호로 조회</label>
        <div className="flex gap-2">
          <input
            id="sup-bizno" {...bizReg}
            onChange={(e) => { e.target.value = formatBizNo(e.target.value); void bizReg.onChange(e); }}
            inputMode="numeric" placeholder="123-45-67890" readOnly={status === "found"}
            className={`${FIELD} flex-1 font-mono ${status === "found" ? "opacity-70" : ""}`}
          />
          {status === "found" ? (
            // 조회 성공 후엔 biz를 잠가 조회한 회사와 제출 회사 불일치(오접수)·stale 목록을 차단.
            <button
              type="button" onClick={resetLookup}
              className="rounded-md border border-border px-4 py-2 text-body font-medium text-text"
            >
              다시 조회
            </button>
          ) : (
            <button
              type="button" onClick={onLookup} disabled={status === "loading"}
              className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
            >
              {status === "loading" ? "조회 중…" : "조회"}
            </button>
          )}
        </div>
        {errors.biz_no && <p className="text-small text-danger">{errors.biz_no.message}</p>}
        {status === "found" && (
          <p className="text-small text-success">✓ <span className="font-medium">{company?.name}</span> 확인됨</p>
        )}
        {status === "notfound" && (
          <div className="text-small text-muted">
            <p>미등록 사업자번호입니다. 소모품은 보유 장비 기준으로 매칭하기 때문에 사전 등록이 필요합니다.</p>
            <p className="mt-1">
              담당자에게 문의해 주세요:{" "}
              <a href={`tel:${SUPPORT_PHONE}`} className="font-mono text-accent hover:underline">{SUPPORT_PHONE}</a>
              {" 또는 "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">{SUPPORT_EMAIL}</a>
            </p>
          </div>
        )}
        {status === "error" && (
          <p className="text-small text-danger">
            일시적인 오류로 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
      </div>

      {/* 업체정보 — 편집불가이므로 접힌 요약 카드 */}
      {status === "found" && company && (
        <details className="rounded-md border border-border bg-surface px-4 py-3">
          <summary className="cursor-pointer text-small text-text">
            <span className="font-medium">{company.name}</span>
            {company.ceo ? ` · 대표 ${company.ceo}` : ""} · 보유장비 {company.equipment.length}대
          </summary>
          <div className="mt-2 flex flex-col gap-1 text-small text-muted">
            {company.phone && <span>연락처 <span className="font-mono">{company.phone}</span></span>}
            {company.address && <span>주소 {company.address}</span>}
            {company.equipment.length > 0 && (
              <div className="mt-1">
                <span className="text-muted">보유 장비</span>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {company.equipment.map((e) => (
                    <li key={e.id} className="text-text">
                      · {e.equipment_name ?? e.label ?? "장비"}
                      {e.equipment_model && <span className="ml-1 font-mono text-muted">{e.equipment_model}</span>}
                      {e.purchased_at && <span className="ml-1 text-muted">(구입 {e.purchased_at})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      {/* 빈 매칭 상태(등록됐으나 매칭 소모품 0종) */}
      {status === "found" && !loadingItems && data && !hasConsumables && (
        <div className="rounded-md border border-border bg-surface-2 px-4 py-6 text-center text-small text-muted">
          <p>보유 장비에 등록된 소모품이 없습니다.</p>
          <p className="mt-1">
            담당자에게 문의해 주세요:{" "}
            <a href={`tel:${SUPPORT_PHONE}`} className="font-mono text-accent hover:underline">{SUPPORT_PHONE}</a>
          </p>
        </div>
      )}

      {status === "found" && loadingItems && (
        <div className="h-24 animate-pulse rounded-md border border-border bg-surface-2" aria-label="소모품 불러오는 중" />
      )}

      {/* 2단계: 소모품 선택 + 신청자 + 동의 */}
      {status === "found" && !loadingItems && hasConsumables && (
        <>
          <FormErrorSummary
            errors={errors}
            submitCount={submitCount}
            extraMessages={itemsError ? [itemsError] : []}
          />
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-h2 font-medium text-text">신청 소모품</h2>
              {priorAvailable.length > 0 && (
                <button type="button" onClick={applyReorder} className="rounded-md border border-border px-3 py-1.5 text-small text-accent hover:bg-surface-2">
                  지난 신청과 동일 ({priorAvailable.length}건)
                </button>
              )}
            </div>
            {priorAvailable.length > 0 && (
              // 지난 신청 내용을 버튼 누르기 전에 확인할 수 있게 품목명·수량 미리보기.
              <p className="rounded-md bg-surface-2 px-3 py-2 text-small text-muted">
                지난 신청:{" "}
                {priorAvailable
                  .map((p) => `${nameById.get(p.consumable_id)?.name ?? "소모품"} ${p.qty}${nameById.get(p.consumable_id)?.unit ?? "개"}`)
                  .join(", ")}
              </p>
            )}
            {data.consumables.length > 12 && (
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="소모품명 검색" className={FIELD}
              />
            )}
            {sections.map((sec) => {
              const items = needle ? sec.items.filter((c) => c.name.toLowerCase().includes(needle)) : sec.items;
              if (items.length === 0) return null;
              return (
                <div key={sec.key} className="rounded-md border border-border bg-surface">
                  <div className="border-b border-border px-3 py-2 text-body font-semibold text-text">{sec.title}</div>
                  <ul>
                    {items.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
                        <span className="min-w-0 flex-1 truncate text-body text-text">
                          {c.name}
                          {c.unit && <span className="ml-1 text-small text-muted">({c.unit})</span>}
                        </span>
                        <Stepper value={qty[c.id] ?? 0} onChange={(n) => setQuantity(c.id, n)} label={c.name} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {itemsError && <p className="text-small text-danger">{itemsError}</p>}
          </div>

          {/* 신청자 정보(콜백 검증) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="신청자명" error={errors.requester_name?.message}>
              <input {...register("requester_name")} className={FIELD} placeholder="담당자 이름" />
            </Field>
            <Field label="연락처" error={errors.requester_phone?.message}>
              <input
                {...phoneReg}
                onChange={(e) => { e.target.value = formatPhone(e.target.value); void phoneReg.onChange(e); }}
                inputMode="tel" placeholder="010-1234-5678" className={`${FIELD} font-mono`}
              />
            </Field>
          </div>
          <Field label="요청 메모(선택)" error={errors.note?.message}>
            <textarea {...register("note")} rows={3} placeholder="배송 요청·기타 사항" className={FIELD} />
          </Field>

          {/* 개인정보 동의 */}
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
            <label className="flex items-start gap-2 text-body text-text">
              <input type="checkbox" {...register("privacy_consent")} className="mt-1" />
              <span>개인정보 수집·이용에 동의합니다 <span className="text-danger">(필수)</span></span>
            </label>
            <details>
              <summary className="cursor-pointer text-small text-accent">전문 보기</summary>
              <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-sm bg-surface-2 p-3 text-small text-muted">{policyBody}</div>
            </details>
            {errors.privacy_consent && <p className="text-small text-danger">{errors.privacy_consent.message}</p>}
          </div>

          <p className="text-small text-muted">※ 단가·비용은 담당자가 확인 후 별도 안내드립니다.</p>
          {serverError && <p className="text-small text-danger">{serverError}</p>}

          {/* sticky 선택 요약 + 제출 */}
          <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
              <span className="text-small text-muted">선택 <span className="font-mono tabular-nums text-text">{selectedCount}</span>개 품목</span>
              <button
                type="submit" disabled={isSubmitting}
                className="rounded-md bg-accent px-6 py-3 text-body font-medium text-white disabled:opacity-60"
              >
                {isSubmitting ? "제출 중…" : "소모품 신청하기"}
              </button>
            </div>
          </div>
        </>
      )}
    </form>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button" onClick={() => onChange(value - 1)} disabled={value <= 0}
        aria-label={`${label} 수량 감소`}
        className="size-11 rounded-md border border-border text-body text-text disabled:opacity-40"
      >−</button>
      <input
        type="number" inputMode="numeric" min={0} max={QTY_MAX} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} 수량`}
        className="w-14 rounded-md border border-border bg-surface px-1 py-2 text-center font-mono tabular-nums text-body text-text"
      />
      <button
        type="button" onClick={() => onChange(value + 1)}
        aria-label={`${label} 수량 증가`}
        className="size-11 rounded-md border border-border text-body text-text"
      >+</button>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-small text-muted">
        {label}
        {children}
      </label>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
