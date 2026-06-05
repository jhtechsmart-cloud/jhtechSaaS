"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  serviceRequestFormSchema,
  buildServiceRequestPayload,
  type ServiceRequestFormInput,
  type ServiceRequestFormInputRaw,
  type LookupResult,
  type AsPhotoSlot,
} from "@/lib/service-requests/schema";
import { uploadAsPhotos } from "@/lib/service-requests/upload";
import { formatBizNo } from "@jhtechsaas/shared";
import { lookupCompany, submitServiceRequest } from "../actions";
import { AsPhotoUploader } from "./AsPhotoUploader";
import { FormErrorSummary } from "@/components/FormErrorSummary";

const FIELD = "rounded-md border border-border bg-surface px-3 py-2 text-body text-text";
// TODO: 재현테크 대표 A/S 직통번호로 교체.
const SUPPORT_PHONE = "1577-0000";

type LookupStatus = "idle" | "loading" | "found" | "notfound";

export function ServiceRequestForm({ policyBody }: { policyBody: string }) {
  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    setValue,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<ServiceRequestFormInputRaw, unknown, ServiceRequestFormInput>({
    resolver: zodResolver(serviceRequestFormSchema),
    defaultValues: {
      biz_no: "", contact_company: "", contact_ceo: "", contact_phone: "",
      contact_email: "", contact_address: "", company_equipment_id: "",
      symptom: "", preferred_date: "",
    },
  });
  const [status, setStatus] = useState<LookupStatus>("idle");
  const [company, setCompany] = useState<LookupResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<Partial<Record<AsPhotoSlot, File>>>({});

  async function onLookup() {
    setServerError(null);
    if (!(await trigger("biz_no"))) return;
    setStatus("loading");
    const result = await lookupCompany(getValues("biz_no"));
    if (result) {
      setCompany(result);
      setValue("contact_company", result.name ?? "");
      setValue("contact_ceo", result.ceo ?? "");
      setValue("contact_phone", result.phone ?? "");
      setValue("contact_email", result.email ?? "");
      setValue("contact_address", result.address ?? "");
      setStatus("found");
    } else {
      setCompany(null);
      setStatus("notfound");
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const submissionId = crypto.randomUUID();
      const photos = await uploadAsPhotos(submissionId, photoFiles);
      const payload = buildServiceRequestPayload(values, photos);
      const res = await submitServiceRequest(payload);
      if (res?.error) setServerError(res.error);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "제출에 실패했습니다");
    }
  });

  const revealed = status === "found" || status === "notfound";

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
      {/* 1단계: 사업자번호 조회 */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
        <label className="text-small text-muted" htmlFor="sr-bizno">
          사업자등록번호로 조회
        </label>
        <div className="flex gap-2">
          <input
            id="sr-bizno"
            {...register("biz_no", {
              onBlur: () => {
                const raw = getValues("biz_no");
                if (raw) setValue("biz_no", formatBizNo(raw), { shouldValidate: false });
              },
            })}
            inputMode="numeric"
            placeholder="123-45-67890"
            className={`${FIELD} flex-1 font-mono`}
          />
          <button
            type="button"
            onClick={onLookup}
            disabled={status === "loading"}
            className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
          >
            {status === "loading" ? "조회 중…" : "조회"}
          </button>
        </div>
        {errors.biz_no && <p className="text-small text-danger">{errors.biz_no.message}</p>}
        {status === "found" && (
          <p className="text-small text-success">
            ✓ <span className="font-medium">{company?.name}</span> 확인됨 — 정보가 자동완성되었습니다(수정 가능).
          </p>
        )}
        {status === "notfound" && (
          <p className="text-small text-muted">
            미등록 사업자번호입니다. 아래에 직접 입력해 접수하거나, 담당자에게 연락주세요:{" "}
            <a href={`tel:${SUPPORT_PHONE}`} className="font-mono text-accent hover:underline">{SUPPORT_PHONE}</a>
          </p>
        )}
      </div>

      {revealed && (
        <>
          <FormErrorSummary errors={errors} submitCount={submitCount} />
          {/* 보유장비 선택(등록고객만) */}
          {status === "found" && company && (
            company.equipment.length > 0 ? (
              <Field label="A/S 신청 장비" error={errors.company_equipment_id?.message}>
                <select {...register("company_equipment_id")} className={FIELD}>
                  <option value="">장비를 선택하세요</option>
                  {company.equipment.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.equipment_name ?? e.label ?? "장비"}
                      {e.purchased_at ? ` (구입 ${e.purchased_at})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-muted">
                등록된 보유장비가 없습니다. 증상을 적어 접수하시면 담당자가 확인합니다.
              </p>
            )
          )}

          {/* 연락처(등록=자동완성·수정가능 / 미등록=직접입력) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="회사명" error={errors.contact_company?.message}>
              <input {...register("contact_company")} className={FIELD} />
            </Field>
            <Field label="대표자/담당자" error={errors.contact_ceo?.message}>
              <input {...register("contact_ceo")} className={FIELD} />
            </Field>
            <Field label="연락처" error={errors.contact_phone?.message}>
              <input {...register("contact_phone")} inputMode="tel" placeholder="010-1234-5678" className={`${FIELD} font-mono`} />
            </Field>
            <Field label="이메일(선택)" error={errors.contact_email?.message}>
              <input {...register("contact_email")} type="email" placeholder="example@company.com" className={FIELD} />
            </Field>
            <Field label="주소(선택)" error={errors.contact_address?.message}>
              <input {...register("contact_address")} className={FIELD} />
            </Field>
            <Field label="희망 방문일(선택)" error={errors.preferred_date?.message}>
              <input {...register("preferred_date")} type="date" className={`${FIELD} font-mono`} />
            </Field>
          </div>

          <Field label="고장 증상" error={errors.symptom?.message}>
            <textarea {...register("symptom")} rows={4} placeholder="어떤 증상인지 구체적으로 적어주세요" className={FIELD} />
          </Field>

          <AsPhotoUploader onChange={setPhotoFiles} />

          {/* 개인정보 동의 */}
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
            <label className="flex items-start gap-2 text-body text-text">
              <input type="checkbox" {...register("privacy_consent")} className="mt-1" />
              <span>개인정보 수집·이용에 동의합니다 <span className="text-danger">(필수)</span></span>
            </label>
            <details>
              <summary className="cursor-pointer text-small text-accent">전문 보기</summary>
              <div className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-sm bg-surface-2 p-3 text-small text-muted">
                {policyBody}
              </div>
            </details>
            {errors.privacy_consent && <p className="text-small text-danger">{errors.privacy_consent.message}</p>}
          </div>

          {serverError && <p className="text-small text-danger">{serverError}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-accent px-6 py-3 text-body font-medium text-white disabled:opacity-60"
          >
            {isSubmitting ? "제출 중…" : "A/S 신청하기"}
          </button>
        </>
      )}
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
