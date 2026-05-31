"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  requestFormSchema,
  type RequestFormInput,
  type RequestFormInputRaw,
} from "@/lib/applications/schema";
import { submitRequest } from "../actions";

const FIELD_CLASS =
  "rounded-md border border-border bg-surface px-3 py-2 text-body text-text";

export function RequestForm({
  equipmentId,
  equipmentName,
}: {
  equipmentId?: string;
  equipmentName?: string;
}) {
  // RHF 3제네릭: input(preprocess 전)·unknown·output(검증 후) 명시.
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestFormInputRaw, unknown, RequestFormInput>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: { equipment_id: equipmentId ?? "", requirements: "" },
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    // values는 zodResolver가 파싱한 출력 타입(RequestFormInput) — 캐스트 불필요.
    const res = await submitRequest(values);
    // 성공 시 서버액션이 redirect → 아래 도달 안 함. 실패만 처리.
    if (res?.error) setServerError(res.error);
  });

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
      {equipmentName && (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-small text-muted">
          선택 장비: <span className="font-mono text-text">{equipmentName}</span>
        </div>
      )}
      <input type="hidden" {...register("equipment_id")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            회사명
            <input {...register("company")} className={FIELD_CLASS} />
          </label>
          {errors.company && <p className="text-small text-danger">{errors.company.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            대표자명
            <input {...register("ceo")} className={FIELD_CLASS} />
          </label>
          {errors.ceo && <p className="text-small text-danger">{errors.ceo.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            사업자등록번호
            <input {...register("biz_no")} inputMode="numeric" placeholder="123-45-67890" className={`${FIELD_CLASS} font-mono`} />
          </label>
          {errors.biz_no && <p className="text-small text-danger">{errors.biz_no.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            연락처
            <input {...register("phone")} inputMode="tel" placeholder="02-1234-5678" className={`${FIELD_CLASS} font-mono`} />
          </label>
          {errors.phone && <p className="text-small text-danger">{errors.phone.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            이메일
            <input {...register("email")} type="email" placeholder="example@company.com" className={FIELD_CLASS} />
          </label>
          {errors.email && <p className="text-small text-danger">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-small text-muted">
            주소
            <input {...register("address")} className={FIELD_CLASS} />
          </label>
          {errors.address && <p className="text-small text-danger">{errors.address.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1 text-small text-muted">
          요청사항
          <textarea {...register("requirements")} rows={4} placeholder="장비 사양·예산·납기 등" className={FIELD_CLASS} />
        </label>
        {errors.requirements && <p className="text-small text-danger">{errors.requirements.message}</p>}
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
