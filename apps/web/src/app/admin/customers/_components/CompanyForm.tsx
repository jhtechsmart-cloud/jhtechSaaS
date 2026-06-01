"use client";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { formatBizNo } from "@jhtechsaas/shared";
import {
  companyFormSchema,
  type CompanyFormValues,
  type CompanyEquipmentRow,
} from "@/lib/customers/schema";
import type { CustomerActionResult } from "@/lib/customers/actions";
import type { Equipment } from "@jhtechsaas/shared";
import { CompanyEquipmentEditor } from "./CompanyEquipmentEditor";

// 담당자 선택용 간소 타입
type StaffItem = { id: string; name: string };
// 카탈로그(active 장비만)
type CatalogItem = Pick<Equipment, "id" | "name" | "model">;

// createCustomer / updateCustomer 액션 타입 호환 시그니처
type CustomerAction = (
  id: string,
  values: CompanyFormValues,
) => Promise<CustomerActionResult>;

type Props =
  | {
      mode: "create";
      id: string;
      onSubmit: CustomerAction;
      staff: StaffItem[];
      catalog: CatalogItem[];
      registered?: never;
      company?: never;
    }
  | {
      mode: "edit";
      id: string;
      onSubmit: CustomerAction;
      staff: StaffItem[];
      catalog: CatalogItem[];
      registered?: "new" | "existing" | null;
      // edit 모드: 초기값 포함
      company: CompanyFormValues;
    };

// react-hook-form input 타입(z.input — 미입력 필드 string)
type FormInput = z.input<typeof companyFormSchema>;

export function CompanyForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const defaultValues: FormInput =
    props.mode === "edit"
      ? {
          ...props.company,
          // equipment 행 타입 변환(CompanyEquipmentRow → FormInput 호환)
          equipment: props.company.equipment.map((r) => ({
            id: r.id,
            equipment_id: r.equipment_id,
            label: r.label,
            serial_no: r.serial_no,
            purchased_at: r.purchased_at,
            install_address: r.install_address,
          })),
        }
      : {
          name: "",
          biz_no: "",
          ceo: "",
          phone: "",
          email: "",
          address: "",
          note: "",
          assignee_id: "",
          equipment: [],
        };

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormInput, unknown, CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues,
  });

  // dirty 상태에서 이탈 시 경고(beforeunload)
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // biz_no blur 시 formatBizNo 적용(표시용) — 저장은 actions에서 normalize.
  function onBizNoBlur() {
    const raw = watch("biz_no");
    if (raw) setValue("biz_no", formatBizNo(raw));
  }

  function onSubmit(values: CompanyFormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await props.onSubmit(props.id, values);
      // 성공 시 액션이 redirect → 여기 도달은 에러
      if (result?.error) {
        setServerError(result.error);
      }
    });
  }

  function onCancel() {
    router.push("/admin/customers");
  }

  function onDelete() {
    if (props.mode !== "edit") return;
    const eqCount = props.company.equipment.length;
    const msg =
      eqCount > 0
        ? `보유장비 ${eqCount}대가 함께 삭제됩니다. 계속할까요?`
        : "이 고객을 삭제할까요?";
    if (!confirm(msg)) return;
    // deleteCustomer는 별도 import — props로 주입받지 않으므로 직접 import
    startTransition(async () => {
      const { deleteCustomer } = await import("@/lib/customers/actions");
      const result = await deleteCustomer(props.id);
      if (result?.error) setServerError(result.error);
    });
  }

  // 보유장비 수: 삭제 confirm 메시지에 사용
  const currentEquipment = watch("equipment") as CompanyEquipmentRow[];

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      {/* 견적 신청 가져오기 등록 배너 */}
      {props.registered === "new" && (
        <div className="rounded-md bg-active/10 p-3 text-small text-active">
          새 고객으로 등록했습니다
        </div>
      )}
      {props.registered === "existing" && (
        <div className="rounded-md bg-surface-2 p-3 text-small text-muted">
          이미 등록된 고객입니다(사업자번호 일치). 기존 정보를 불러왔습니다 — 변경은 직접
          수정하세요.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* §1 기본 정보 */}
        <section className="flex flex-col gap-5">
          <Field label="업체명 *" error={errors.name?.message}>
            <input
              {...register("name")}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            />
          </Field>
          <Field label="사업자등록번호" error={errors.biz_no?.message}>
            <input
              {...register("biz_no")}
              onBlur={onBizNoBlur}
              placeholder="123-45-67890"
              className="rounded-md border border-border bg-surface px-3 py-2 font-mono tabular-nums text-body text-text"
            />
          </Field>
          <Field label="대표자" error={errors.ceo?.message}>
            <input
              {...register("ceo")}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            />
          </Field>
          <Field label="연락처" error={errors.phone?.message}>
            <input
              {...register("phone")}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            />
          </Field>
          <Field label="이메일" error={errors.email?.message}>
            <input
              {...register("email")}
              type="email"
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            />
          </Field>
          <Field label="주소" error={errors.address?.message}>
            <input
              {...register("address")}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            />
          </Field>
          <Field label="메모" error={errors.note?.message}>
            <textarea
              {...register("note")}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            />
          </Field>
          <Field label="담당영업" error={errors.assignee_id?.message}>
            <select
              {...register("assignee_id")}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            >
              <option value="">미배정</option>
              {props.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </section>

        {/* §2 보유장비 */}
        <CompanyEquipmentEditor control={control} register={register} catalog={props.catalog} />

        {serverError ? (
          <p className="text-small text-danger">{serverError}</p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
          >
            {pending ? <Spinner /> : null}
            {pending ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-small text-muted hover:text-text"
          >
            취소
          </button>
          {props.mode === "edit" ? (
            <button
              type="button"
              onClick={() => {
                const eqCount = currentEquipment?.length ?? 0;
                const msg =
                  eqCount > 0
                    ? `보유장비 ${eqCount}대가 함께 삭제됩니다. 계속할까요?`
                    : "이 고객을 삭제할까요?";
                if (!confirm(msg)) return;
                startTransition(async () => {
                  const { deleteCustomer } = await import("@/lib/customers/actions");
                  const result = await deleteCustomer(props.id);
                  if (result?.error) setServerError(result.error);
                });
              }}
              disabled={pending}
              className="ml-auto text-small text-danger hover:underline"
            >
              삭제
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

// 저장 중 spinner
function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
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
    <label className="flex flex-col gap-1">
      <span className="text-small text-muted">{label}</span>
      {children}
      {error ? <span className="text-micro text-danger">{error}</span> : null}
    </label>
  );
}
