"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  requestFormSchema,
  buildSubmitPayload,
  type RequestFormInput,
  type RequestFormInputRaw,
  type PhotoSlot,
} from "@/lib/applications/schema";
import { uploadSitePhotos } from "@/lib/applications/upload";
import { formatBizNo } from "@jhtechsaas/shared";
import { submitRequest } from "../actions";
import { ConsentAccordion } from "./ConsentAccordion";
import { SitePhotoUploader } from "./SitePhotoUploader";
import { InstallSurvey } from "./InstallSurvey";
import { FormErrorSummary } from "@/components/FormErrorSummary";

const FIELD = "rounded-md border border-border bg-surface px-3 py-2 text-body text-text";

export function RequestForm({
  equipmentId,
  equipmentName,
  policyBody,
}: {
  equipmentId?: string;
  equipmentName?: string;
  policyBody: string;
}) {
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<RequestFormInputRaw, unknown, RequestFormInput>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      equipment_id: equipmentId ?? "",
      requirements: "",
      handling: [],
      survey_extra: "",
      building_type: "factory",
      location: "ground",
      elevator: "none",
      power: "single_220",
      pneumatic: "none",
    },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<Partial<Record<PhotoSlot, File>>>({});

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const submissionId = crypto.randomUUID();
      // 제출 시에만 업로드(고아 없음). 폼 검증 통과 후 실행.
      const photos = await uploadSitePhotos(submissionId, photoFiles);
      const payload = buildSubmitPayload(values, equipmentName, photos);
      const res = await submitRequest(payload);
      if (res?.error) setServerError(res.error);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "제출에 실패했습니다");
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
      <FormErrorSummary errors={errors} submitCount={submitCount} />
      <ConsentAccordion register={register} error={errors.privacy_consent} policyBody={policyBody} />

      {equipmentName && (
        <div className="rounded-xl border border-accent-ring bg-accent-soft px-4 py-3 text-small text-muted">
          선택 장비: <span className="font-mono text-text">{equipmentName}</span>
        </div>
      )}
      <input type="hidden" {...register("equipment_id")} />

      {/* 신청 정보 — 회사/연락처 입력을 하나의 카드 박스로 묶어 배경에서 분리. */}
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h2 className="text-h2 font-medium text-text">신청 정보</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="회사명" error={errors.company?.message}>
            <input {...register("company")} className={FIELD} />
          </Field>
          <Field label="대표자명" error={errors.ceo?.message}>
            <input {...register("ceo")} className={FIELD} />
          </Field>
          <Field label="사업자등록번호" error={errors.biz_no?.message}>
            <input
              {...register("biz_no", {
                onBlur: () => {
                  // blur 시 대시 포맷(admin 고객폼과 일관). 저장은 서버가 normalize.
                  const raw = getValues("biz_no");
                  if (raw) setValue("biz_no", formatBizNo(raw), { shouldValidate: false });
                },
              })}
              inputMode="numeric"
              placeholder="123-45-67890"
              className={`${FIELD} font-mono`}
            />
          </Field>
          <Field label="연락처" error={errors.phone?.message}>
            <input {...register("phone")} inputMode="tel" placeholder="02-1234-5678" className={`${FIELD} font-mono`} />
          </Field>
          <Field label="이메일" error={errors.email?.message}>
            <input {...register("email")} type="email" placeholder="example@company.com" className={FIELD} />
          </Field>
          <Field label="주소" error={errors.address?.message}>
            <input {...register("address")} className={FIELD} />
          </Field>
        </div>

        <Field label="요청사항" error={errors.requirements?.message}>
          <textarea {...register("requirements")} rows={4} placeholder="장비 사양·예산·납기 등" className={FIELD} />
        </Field>
      </section>

      {/* 선택 입력(사진·설치설문) — 기본 접힘. 안내문구는 접힌 영역 바로 위에 노출.
          details 내부도 DOM에 마운트되어 설치설문 기본값은 접힌 채로도 제출에 포함됨. */}
      <div className="flex flex-col gap-2">
        <p className="text-small text-muted">
          {/* TODO(문구검토): 재현테크 톤에 맞게 다듬어 주세요. */}
          더 정확한 견적을 위해 <span className="text-text">설치 장소 사진</span>과{" "}
          <span className="text-text">설치 환경 정보</span>를 함께 남겨주시면 좋습니다(선택).
          현장 방문 전에 더 빠르고 정확하게 안내드릴 수 있어요.
        </p>
        <details className="rounded-2xl border border-border bg-surface shadow-card">
          <summary className="cursor-pointer px-5 py-4 text-body font-medium text-text">
            설치 환경 정보·사진 입력하기 <span className="text-small text-muted">(선택)</span>
          </summary>
          <div className="flex flex-col gap-6 border-t border-border p-5">
            <SitePhotoUploader onChange={setPhotoFiles} />
            <InstallSurvey register={register} />
          </div>
        </details>
      </div>

      {serverError && <p className="text-small text-danger">{serverError}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-accent px-6 py-3 text-body font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "제출 중…" : "견적 요청 보내기"}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
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
