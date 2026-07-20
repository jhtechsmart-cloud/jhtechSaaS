"use client";
import { useEffect, useState } from "react";
import { judgeWarranty, WARRANTY_MONTHS } from "@jhtechsaas/shared";
import type { CatalogGroup, ReportPayload, CompanyHit } from "@/lib/service-reports/types";
import {
  equipmentCatalogAction,
  loadCompanyContextAction,
  searchCompaniesAction,
} from "@/lib/service-reports/actions";
import { DateField } from "./DateField";
import type { WizardCtx } from "./ReportWizard";

// 1·2단계 — 고객 선택(검색/직접입력 + 미종결 A/S 신청 연결)·장비 선택(보증 배지·이력).

interface StepProps {
  draft: ReportPayload;
  patch: (p: Partial<ReportPayload>) => void;
  ctx: WizardCtx;
  setCtx: (fn: (c: WizardCtx) => WizardCtx) => void;
}

export function Step1Customer({ draft, patch, ctx, setCtx }: StepProps) {
  const [query, setQuery] = useState(draft.customer_name);
  const [hits, setHits] = useState<CompanyHit[]>([]);
  const [searching, setSearching] = useState(false);

  // 검색 debounce 300ms — setState는 항상 타이머 콜백에서(렌더 연쇄 방지 lint 규칙).
  useEffect(() => {
    if (ctx.manualCustomer) return;
    const q = query.trim();
    const skip = q.length < 2 || (!!draft.company_id && q === draft.customer_name);
    const t = setTimeout(
      async () => {
        if (skip) {
          setHits([]);
          return;
        }
        setSearching(true);
        const res = await searchCompaniesAction(q);
        setSearching(false);
        setHits(res.ok ? res.data : []);
      },
      skip ? 0 : 300,
    );
    return () => clearTimeout(t);
  }, [query, ctx.manualCustomer, draft.company_id, draft.customer_name]);

  async function pick(hit: CompanyHit) {
    patch({
      company_id: hit.id,
      customer_name: hit.name,
      customer_biz_no: hit.biz_no ?? "",
      customer_tel: hit.phone ?? "",
      customer_addr: hit.address ?? "",
      recipient_email: hit.email ?? "",
      // 고객이 바뀌면 장비·신청 연결 초기화
      company_equipment_id: null,
      catalog_equipment_id: null,
      service_request_id: null,
    });
    setQuery(hit.name);
    setHits([]);
    const res = await loadCompanyContextAction(hit.id);
    if (res.ok) {
      setCtx((c) => ({ ...c, ...res.data, manualCustomer: false, manualEquipment: false }));
    }
  }

  return (
    <>
      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex rounded-full bg-surface-2 p-1" role="tablist">
          {(
            [
              { manual: false, label: "고객 검색" },
              { manual: true, label: "직접 입력" },
            ] as const
          ).map((t) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              aria-selected={ctx.manualCustomer === t.manual}
              onClick={() => {
                setCtx((c) => ({ ...c, manualCustomer: t.manual, openRequests: t.manual ? [] : c.openRequests }));
                if (t.manual) patch({ company_id: null, service_request_id: null });
              }}
              className={`min-h-11 flex-1 rounded-full text-small font-semibold ${
                ctx.manualCustomer === t.manual ? "bg-accent text-white" : "text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!ctx.manualCustomer ? (
          <>
            <label className="flex flex-col gap-1 text-small font-medium text-muted">
              고객 검색
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="상호 또는 사업자번호 — 예: 아트원, 119-25"
                className="rounded-full border border-border bg-surface px-4 py-3 text-body text-text"
              />
            </label>
            {searching && <p className="mt-2 text-small text-muted">검색 중…</p>}
            {hits.length > 0 && (
              <ul className="mt-2 overflow-hidden rounded-md border border-border">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => void pick(h)}
                      className="min-h-11 w-full border-b border-border bg-surface px-4 py-3 text-left last:border-b-0 active:bg-surface-2"
                    >
                      <span className="block text-body font-semibold text-text">{h.name}</span>
                      <span className="text-small text-muted">
                        {h.biz_no ? `사업자 ${h.biz_no}` : "사업자번호 없음"}
                        {h.phone ? ` · ${h.phone}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!searching && query.trim().length >= 2 && hits.length === 0 && !draft.company_id && (
              <p className="mt-2 text-small text-muted">검색 결과 없음 — 위 탭에서 직접 입력으로 등록하세요</p>
            )}
            {draft.company_id && (
              <div className="mt-3 rounded-md bg-accent-soft p-3 text-small text-text">
                <b>{draft.customer_name}</b> 선택됨
                {draft.customer_tel && ` · ${draft.customer_tel}`}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-small font-medium text-muted">
              고객명 *
              <input
                value={draft.customer_name}
                onChange={(e) => patch({ customer_name: e.target.value })}
                placeholder="상호 또는 성명"
                className="rounded-full border border-border bg-surface px-4 py-3 text-body text-text"
              />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-muted">
              사업자등록번호
              <input
                value={draft.customer_biz_no}
                onChange={(e) => patch({ customer_biz_no: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                inputMode="numeric"
                placeholder="숫자 10자리"
                className="rounded-full border border-border bg-surface px-4 py-3 font-mono text-body text-text"
              />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-muted">
              연락처
              <input
                value={draft.customer_tel}
                onChange={(e) => patch({ customer_tel: e.target.value })}
                inputMode="tel"
                placeholder="010-0000-0000"
                className="rounded-full border border-border bg-surface px-4 py-3 text-body text-text"
              />
            </label>
            <label className="flex flex-col gap-1 text-small font-medium text-muted">
              주소
              <input
                value={draft.customer_addr}
                onChange={(e) => patch({ customer_addr: e.target.value })}
                placeholder="주소 입력"
                className="rounded-full border border-border bg-surface px-4 py-3 text-body text-text"
              />
            </label>
            <p className="text-small text-muted">직접 입력한 고객은 리포트 확정 시 고객 DB에 등록됩니다.</p>
          </div>
        )}
      </div>

      {ctx.openRequests.length > 0 && (
        <div className="rounded-md border border-border bg-surface p-4 shadow-card">
          <h3 className="mb-2 text-small font-semibold text-muted">이 고객의 미종결 A/S 신청</h3>
          <div className="flex flex-col gap-2">
            {ctx.openRequests.map((r) => {
              const selected = draft.service_request_id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    if (selected) {
                      patch({ service_request_id: null });
                      return;
                    }
                    patch({
                      service_request_id: r.id,
                      company_equipment_id: r.company_equipment_id ?? draft.company_equipment_id,
                      diagnosis: draft.diagnosis || (r.symptom ? `[신청 증상] ${r.symptom}\n` : ""),
                    });
                  }}
                  className={`min-h-11 rounded-md border p-3 text-left ${
                    selected ? "border-accent bg-accent-soft" : "border-border bg-surface"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-small font-semibold text-text">{r.seq_no}</span>
                    <span className="text-micro text-muted">{r.created_at.slice(0, 10)}</span>
                  </div>
                  {r.symptom && <p className="mt-1 text-small text-muted">{r.symptom}</p>}
                  <span className="mt-1 block text-small font-medium text-accent">
                    {selected ? "연결됨 — 확정 시 처리완료로 전환" : "이 신청과 연결"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export function Step2Equipment({ draft, patch, ctx, setCtx }: StepProps) {
  // 고객 선택 후 새로고침/재진입으로 ctx가 비어 있으면 재적재.
  useEffect(() => {
    if (!draft.company_id || ctx.equipment.length > 0 || ctx.manualEquipment) return;
    void loadCompanyContextAction(draft.company_id).then((res) => {
      if (res.ok) setCtx((c) => ({ ...c, ...res.data }));
    });
  }, [draft.company_id, ctx.equipment.length, ctx.manualEquipment, setCtx]);

  // 장비 카탈로그(분류 그룹) — 미등록 장비 입력 섹션을 열면 1회 적재.
  const [catalog, setCatalog] = useState<CatalogGroup[] | null>(null);
  const [openCat, setOpenCat] = useState("");
  const [catQuery, setCatQuery] = useState("");
  const [freeText, setFreeText] = useState(false);
  useEffect(() => {
    if (!ctx.manualEquipment || catalog !== null) return;
    void equipmentCatalogAction().then((res) => {
      setCatalog(res.ok ? res.data : []);
    });
  }, [ctx.manualEquipment, catalog]);

  const q = catQuery.trim().toLowerCase();
  const filtered = (catalog ?? [])
    .map((grp) => ({
      ...grp,
      items: q ? grp.items.filter((it) => it.name.toLowerCase().includes(q)) : grp.items,
    }))
    .filter((grp) => grp.items.length > 0);

  const warranty = judgeWarranty(draft.purchased_at || null, new Date());

  return (
    <>
      {draft.company_id && (
        <div className="rounded-md border border-border bg-surface p-4 shadow-card">
          <h3 className="mb-2 text-small font-semibold text-muted">보유 장비</h3>
          {ctx.equipment.length === 0 ? (
            <p className="text-small text-muted">등록된 장비가 없습니다 — 아래에서 직접 입력해 주세요.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {ctx.equipment.map((eq) => {
                const selected = draft.company_equipment_id === eq.id;
                const w = judgeWarranty(eq.purchased_at, new Date());
                return (
                  <button
                    key={eq.id}
                    type="button"
                    aria-label={`장비 선택 ${eq.label}`}
                    onClick={() => {
                      setCtx((c) => ({ ...c, manualEquipment: false }));
                      patch({
                        company_equipment_id: eq.id,
                        catalog_equipment_id: null,
                        device_name: eq.label,
                        device_serial: eq.serial_no ?? "",
                        purchased_at: eq.purchased_at ?? "",
                      });
                    }}
                    className={`rounded-md border p-3 text-left ${
                      selected ? "border-accent bg-accent-soft" : "border-border bg-surface"
                    }`}
                  >
                    <span className="block text-body font-semibold text-text">{eq.label}</span>
                    <span className="text-small text-muted">
                      {eq.serial_no ? `S/N ${eq.serial_no}` : "S/N 미등록"}
                      {eq.purchased_at ? ` · 구매 ${eq.purchased_at}` : ""}
                    </span>
                    {w && (
                      <span
                        className={`mt-2 inline-block rounded-full px-3 py-1 text-micro font-bold ${
                          w.inWarranty ? "bg-accent-soft text-accent" : "bg-danger/10 text-danger"
                        }`}
                      >
                        {w.inWarranty
                          ? `보증기간 내 (${w.months}개월) · 무상 대상`
                          : `보증 만료 (${w.months}개월) · 유상`}
                      </span>
                    )}
                    {eq.history.length > 0 && (
                      <span className="mt-2 block border-t border-dashed border-border pt-2 text-small text-muted">
                        {eq.history.map((h) => (
                          <span key={h.issuedAt + h.summary} className="block">
                            <span className="font-mono text-micro">{h.issuedAt}</span> {h.summary}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border border-border bg-surface p-4 shadow-card">
        <button
          type="button"
          onClick={() => {
            setCtx((c) => ({ ...c, manualEquipment: !c.manualEquipment }));
            patch({ company_equipment_id: null, catalog_equipment_id: null });
          }}
          className="min-h-11 w-full rounded-full border-2 border-dashed border-border text-small font-semibold text-accent"
        >
          {ctx.manualEquipment ? "직접 입력 닫기" : "+ 등록되지 않은 장비 직접 입력"}
        </button>
        {ctx.manualEquipment && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-small font-medium text-muted">장비명 * — 등록 장비에서 선택</span>
              {draft.device_name && !freeText && (
                <div className="mb-1 rounded-md bg-accent-soft p-3 text-small text-text">
                  <b>{draft.device_name}</b> 선택됨
                </div>
              )}
              <input
                value={catQuery}
                onChange={(e) => setCatQuery(e.target.value)}
                placeholder="장비명 검색 — 예: 3300, XTRA"
                aria-label="장비 카탈로그 검색"
                className="rounded-full border border-border bg-surface px-4 py-3 text-body text-text"
              />
              {catalog === null ? (
                <p className="mt-1 text-small text-muted">장비 목록 불러오는 중…</p>
              ) : (
                <div className="mt-1 overflow-hidden rounded-md border border-border">
                  {filtered.length === 0 && (
                    <p className="p-3 text-small text-muted">검색 결과 없음 — 아래 직접 입력을 이용하세요</p>
                  )}
                  {filtered.map((grp) => {
                    const open = q !== "" || openCat === grp.category;
                    return (
                      <div key={grp.category} className="border-b border-border last:border-b-0">
                        <button
                          type="button"
                          onClick={() => setOpenCat(open && q === "" ? "" : grp.category)}
                          className="flex min-h-11 w-full items-center justify-between bg-surface-2 px-4 py-2 text-left text-small font-semibold text-text"
                        >
                          {grp.category}
                          <span className="text-micro text-muted">
                            {grp.items.length}종 {open ? "▲" : "▼"}
                          </span>
                        </button>
                        {open &&
                          grp.items.map((it) => {
                            const selected = draft.device_name === it.name;
                            return (
                              <button
                                key={it.id}
                                type="button"
                                onClick={() => {
                                  // 카탈로그 id를 함께 실어야 확정 시 정확히 그 모델로 연결된다
                                  // (이름 매칭은 동명 행에서 실패하므로 추정에 기대지 않는다).
                                  patch({
                                    device_name: it.name,
                                    catalog_equipment_id: it.id,
                                    company_equipment_id: null,
                                  });
                                  setFreeText(false);
                                }}
                                className={`min-h-11 w-full border-t border-border px-4 py-2.5 text-left text-body ${
                                  selected ? "bg-accent-soft font-semibold text-accent" : "bg-surface text-text"
                                }`}
                              >
                                {it.name}
                              </button>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => setFreeText((v) => !v)}
                className="mt-1 self-start text-small text-muted underline"
              >
                {freeText ? "직접 입력 닫기" : "목록에 없는 장비 — 직접 입력"}
              </button>
              {freeText && (
                <input
                  value={draft.device_name}
                  onChange={(e) => patch({ device_name: e.target.value, catalog_equipment_id: null })}
                  placeholder="예: JU-2513UV UV 평판 프린터"
                  aria-label="장비명 직접 입력"
                  className="rounded-full border border-border bg-surface px-4 py-3 text-body text-text"
                />
              )}
            </div>
            <label className="flex flex-col gap-1 text-small font-medium text-muted">
              일련번호
              <input
                value={draft.device_serial}
                onChange={(e) => patch({ device_serial: e.target.value })}
                placeholder="Serial No."
                className="rounded-full border border-border bg-surface px-4 py-3 font-mono text-body text-text"
              />
            </label>
            <div className="flex flex-col gap-1 text-small font-medium text-muted">
              구매(설치) 일자
              <DateField
                value={draft.purchased_at}
                onChange={(v) => patch({ purchased_at: v })}
                fromYear={2000}
                toYear={new Date().getFullYear()}
                aria-label="구매 일자"
              />
            </div>
            <p className="text-small text-muted">
              구매일을 입력하면 보증({WARRANTY_MONTHS}개월) 기준 무상·유상이 자동 제안됩니다. 직접
              입력한 장비는 확정 시 고객 보유장비로 등록됩니다.
            </p>
            {warranty && (
              <p
                className={`rounded-md px-3 py-2 text-small font-medium ${
                  warranty.inWarranty ? "bg-accent-soft text-accent" : "bg-danger/10 text-danger"
                }`}
              >
                {warranty.inWarranty
                  ? `✅ 무상 A/S 대상 — 구매 후 ${warranty.months}개월 (청구 단계에서 무상 기본 제안)`
                  : `💳 유상 A/S — 구매 후 ${warranty.months}개월, 보증 만료`}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
