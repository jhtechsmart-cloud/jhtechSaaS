"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatBizNo, formatPhone } from "@jhtechsaas/shared";
import {
  staffServiceRequestFormSchema,
  buildStaffServiceRequestPayload,
  type StaffServiceRequestFormInput,
  type StaffServiceRequestFormInputRaw,
} from "@/lib/service-requests/staff-schema";
import type { AsPhotoSlot } from "@/lib/service-requests/schema";
import { uploadAsPhotos } from "@/lib/service-requests/upload";
import { STAFF_CHANNELS, CHANNEL_META } from "@/lib/service-requests/channel";
import {
  createServiceRequestByStaff,
  listCompanyEquipmentForPicker,
  type PickerCompany,
  type PickerEquipment,
} from "@/lib/service-requests/staff-actions";
import { AsPhotoUploader } from "@/app/(portal)/support/_components/AsPhotoUploader";
import { FormErrorSummary } from "@/components/FormErrorSummary";
import { CompanyPicker } from "./CompanyPicker";

const FIELD = "rounded-md border border-border bg-surface px-3 py-2 text-body text-text";
const DRAFT_KEY = "jh-as-staff-draft"; // 미등록 고객 등록으로 이탈 시 증상 초안 보존

// A/S 대행 접수 폼(#281). 회사 선택 게이트 → 통화자/회신번호 → 장비 → 증상 → 희망일 → 사진(접이식) → 경로 → 동의 → [접수].
// 우측 고정 고객 카드. 사진은 제출 시 submissionId(폼 수명 동안 고정)로 1회 업로드 — 실패 후 재제출은 같은 id로 재업로드 없이 재시도.
export function StaffServiceRequestForm({
  initialCompany,
  policyBody,
}: {
  initialCompany: PickerCompany | null;
  policyBody: string;
}) {
  const [company, setCompany] = useState<PickerCompany | null>(initialCompany);
  const [equipment, setEquipment] = useState<PickerEquipment[] | null>(null); // null = 로딩 중
  const [photoFiles, setPhotoFiles] = useState<Partial<Record<AsPhotoSlot, File>>>({});
  // 제출 세션 상태(멱등 키·업로드 결과) — 이벤트 핸들러에서만 읽고 쓴다.
  const submitState = useRef<{ submissionId: string; uploaded: Partial<Record<AsPhotoSlot, string>> | null }>({
    submissionId: "",
    uploaded: null,
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const symptomRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<StaffServiceRequestFormInputRaw, unknown, StaffServiceRequestFormInput>({
    resolver: zodResolver(staffServiceRequestFormSchema),
    defaultValues: {
      company_id: initialCompany?.id ?? "",
      company_equipment_id: "",
      contact_name: initialCompany?.ceo ?? "",
      callback_phone: initialCompany?.phone ?? "",
      symptom: "",
      preferred_date: "",
      channel: "phone",
      privacy_consent: undefined,
    },
  });

  // 미등록 고객 등록 후 복귀 시 증상 초안 복원(RHF setValue는 React state가 아니라 effect에서 안전).
  useEffect(() => {
    const draft = sessionStorage.getItem(DRAFT_KEY);
    if (draft) {
      sessionStorage.removeItem(DRAFT_KEY);
      setValue("symptom", draft);
    }
  }, [setValue]);

  // 선택 회사의 보유장비 로드(비동기 결과만 상태 반영). 초기 고정 회사도 여기서 로드.
  useEffect(() => {
    if (!company) return;
    let alive = true;
    listCompanyEquipmentForPicker(company.id).then((rows) => {
      if (alive) setEquipment(rows);
    });
    return () => {
      alive = false;
    };
  }, [company]);

  function selectCompany(c: PickerCompany) {
    setCompany(c);
    setEquipment(null); // 로딩 상태로
    setValue("company_id", c.id, { shouldValidate: true });
    setValue("company_equipment_id", "");
    if (!getValues("contact_name")) setValue("contact_name", c.ceo ?? "");
    if (!getValues("callback_phone")) setValue("callback_phone", c.phone ?? "");
    setTimeout(() => symptomRef.current?.focus(), 0);
  }

  function changeCompany() {
    // 회사 교체: 장비·프리필 리셋, 증상은 유지.
    setCompany(null);
    setEquipment(null);
    setValue("company_id", "");
    setValue("company_equipment_id", "");
    setValue("contact_name", "");
    setValue("callback_phone", "");
  }

  async function submitValues(values: StaffServiceRequestFormInput) {
    setServerError(null);
    const st = submitState.current;
    try {
      if (!st.submissionId) st.submissionId = crypto.randomUUID(); // 폼 수명 동안 고정(재제출=같은 키)
      if (!st.uploaded) st.uploaded = await uploadAsPhotos(st.submissionId, photoFiles);
      const payload = buildStaffServiceRequestPayload(values, st.submissionId, st.uploaded);
      const res = await createServiceRequestByStaff(payload);
      if (res?.error) setServerError(res.error);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "접수에 실패했습니다");
    }
  }

  const symptomReg = register("symptom");

  return (
    <form
      onSubmit={(e) => void handleSubmit(submitValues)(e)}
      className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
      noValidate
    >
      <div className="flex flex-col gap-5">
        <FormErrorSummary errors={errors} submitCount={submitCount} extraMessages={serverError ? [serverError] : []} />

        {/* 1) 고객사 — 선택 전엔 나머지 비노출(게이트) */}
        {!company ? (
          <CompanyPicker
            onSelect={selectCompany}
            autoFocus
            onNewCustomerClick={() => {
              const draft = getValues("symptom");
              if (draft) sessionStorage.setItem(DRAFT_KEY, draft);
            }}
          />
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-mint px-3 py-2">
            <span className="min-w-0 truncate text-body font-medium text-text">
              {company.name}
              <span className="ml-2 font-mono text-small tabular-nums text-muted">
                {company.biz_no ? formatBizNo(company.biz_no) : "사업자번호 없음"}
              </span>
            </span>
            <button type="button" onClick={changeCompany} className="shrink-0 text-small text-accent hover:underline">
              변경
            </button>
          </div>
        )}
        <input type="hidden" {...register("company_id")} />
        {errors.company_id && !company && <p className="-mt-3 text-small text-danger">{errors.company_id.message}</p>}

        {company && (
          <>
            {/* 2) 통화자·회신번호 (고객 DB 프리필, 수정 가능) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="통화하신 분(담당자)" error={errors.contact_name?.message}>
                <input {...register("contact_name")} placeholder="성함" className={FIELD} />
              </Field>
              <Field label="회신 받을 번호" error={errors.callback_phone?.message}>
                <input {...register("callback_phone")} inputMode="tel" placeholder="010-1234-5678" className={`${FIELD} font-mono`} />
              </Field>
            </div>

            {/* 3) 보유장비 */}
            <Field label="장비(보유장비에서 선택)" error={errors.company_equipment_id?.message}>
              {equipment === null ? (
                <span className="rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-muted">보유장비 불러오는 중…</span>
              ) : equipment.length > 0 ? (
                <select {...register("company_equipment_id")} className={FIELD}>
                  <option value="">선택 안 함</option>
                  {equipment.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-muted">
                  등록된 보유장비가 없습니다 — 모델명을 증상란에 함께 적어주세요.
                </span>
              )}
            </Field>

            {/* 4) 증상 */}
            <Field label="증상" error={errors.symptom?.message}>
              <textarea
                {...symptomReg}
                ref={(el) => {
                  symptomReg.ref(el);
                  symptomRef.current = el;
                }}
                rows={6}
                placeholder="고객이 말한 증상을 그대로 적어주세요 (모델명·발생 시점·에러 표시 등)"
                className={FIELD}
              />
            </Field>

            {/* 5) 희망일 */}
            <Field label="희망 방문일(선택)" error={errors.preferred_date?.message}>
              <input {...register("preferred_date")} type="date" className={`${FIELD} font-mono sm:max-w-60`} />
            </Field>

            {/* 6) 사진 — 접이식(전화 접수엔 드묾) */}
            <details className="rounded-md border border-border bg-surface p-3">
              <summary className="cursor-pointer text-small font-medium text-text">증상 사진 첨부(선택)</summary>
              <div className="mt-3">
                <AsPhotoUploader onChange={setPhotoFiles} />
              </div>
            </details>

            {/* 7) 접수 경로 */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-small text-muted">접수 경로</legend>
              <div className="flex flex-wrap gap-4">
                {STAFF_CHANNELS.map((ch) => (
                  <label key={ch} className="flex items-center gap-1.5 text-body text-text">
                    <input type="radio" value={ch} {...register("channel")} />
                    {CHANNEL_META[ch].label}
                  </label>
                ))}
              </div>
              {errors.channel && <p className="text-small text-danger">{errors.channel.message}</p>}
            </fieldset>

            {/* 8) 동의(구두 확인) */}
            <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
              <label className="flex items-start gap-2 text-body text-text">
                <input type="checkbox" {...register("privacy_consent")} className="mt-1" />
                <span>
                  고객에게 개인정보 수집·이용 동의를 구두로 안내·확인했습니다 <span className="text-danger">(필수)</span>
                </span>
              </label>
              <details>
                <summary className="cursor-pointer text-small text-accent">안내 문구 전문 보기</summary>
                <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-sm bg-surface-2 p-3 text-small text-muted">
                  {policyBody}
                </div>
              </details>
              {errors.privacy_consent && <p className="text-small text-danger">{errors.privacy_consent.message}</p>}
            </div>

            {serverError && <p className="text-small text-danger">{serverError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-accent px-6 py-2.5 text-body font-medium text-white disabled:opacity-60"
              >
                {isSubmitting ? "접수 중…" : "A/S 접수"}
              </button>
              <Link href="/admin/service-requests" className="text-small text-muted hover:text-text">
                취소
              </Link>
            </div>
          </>
        )}
      </div>

      {/* 우측 고정 고객 카드 — 통화 중 "이 번호 맞으시죠?" 확인용 */}
      <aside className="lg:sticky lg:top-4">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-card">
          <span className="text-micro font-semibold uppercase tracking-wide text-muted">고객 정보</span>
          {company ? (
            <>
              <span className="text-h2 font-semibold text-text">{company.name}</span>
              <Row label="대표/담당" value={company.ceo} />
              <Row label="전화" value={company.phone ? formatPhone(company.phone) : null} mono big />
              <Row label="주소" value={company.address} />
              <Row label="담당영업" value={company.assignee_name ?? "미배정"} />
              <Row label="사업자번호" value={company.biz_no ? formatBizNo(company.biz_no) : "미등록"} mono />
              <p className="mt-1 text-micro text-muted">
                고객 정보는 고객 DB 기준으로 저장됩니다(수정은 고객 상세에서). 담당자는 이 고객사의 담당영업으로 자동 배정됩니다.
              </p>
            </>
          ) : (
            <p className="text-small text-muted">고객사를 검색해 선택하면 정보가 표시됩니다.</p>
          )}
        </div>
      </aside>
    </form>
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

function Row({ label, value, mono, big }: { label: string; value: string | null; mono?: boolean; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-row-line py-1.5 first:border-t-0">
      <span className="shrink-0 text-small text-muted">{label}</span>
      <span
        className={`min-w-0 text-right ${mono ? "font-mono tabular-nums" : ""} ${big ? "text-h2 font-semibold text-text" : "text-body text-text"} ${
          value ? "" : "text-empty"
        }`}
      >
        {value ?? "미입력"}
      </span>
    </div>
  );
}
