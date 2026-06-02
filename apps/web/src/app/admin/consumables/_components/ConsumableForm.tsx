"use client";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { consumableFormSchema, type ConsumableFormValues } from "@/lib/consumables/schema";
import type { ConsumableActionResult } from "@/lib/consumables/actions";
import { ConsumableScopeEditor } from "./ConsumableScopeEditor";
import { type OptGroup } from "@/lib/equipment/category-tree";

// 카탈로그(active 장비만)
type CatalogItem = { id: string; name: string; model: string | null };

// createConsumable / updateConsumable 액션 타입 호환 시그니처
type ConsumableAction = (id: string, values: ConsumableFormValues) => Promise<ConsumableActionResult>;

type Props =
  | {
      mode: "create";
      id: string;
      onSubmit: ConsumableAction;
      catalog: CatalogItem[];
      categoryOptions: OptGroup[];
      consumable?: never;
    }
  | {
      mode: "edit";
      id: string;
      onSubmit: ConsumableAction;
      catalog: CatalogItem[];
      categoryOptions: OptGroup[];
      // edit 모드: 초기값 포함
      consumable: ConsumableFormValues;
    };

// react-hook-form input 타입(z.input — 미입력 필드 string)
type FormInput = z.input<typeof consumableFormSchema>;

export function ConsumableForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const defaultValues: FormInput =
    props.mode === "edit"
      ? {
          ...props.consumable,
          // scopes 행 타입 변환(ConsumableScopeRow → FormInput 호환)
          scopes: props.consumable.scopes.map((s) => ({
            id: s.id,
            category_id: s.category_id,
            equipment_id: s.equipment_id,
          })),
        }
      : {
          name: "",
          unit: "",
          sku: "",
          price: "",
          note: "",
          status: "active",
          scopes: [],
        };

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormInput, unknown, ConsumableFormValues>({
    resolver: zodResolver(consumableFormSchema),
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

  function onSubmit(values: ConsumableFormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await props.onSubmit(props.id, values);
      // 성공 시 액션이 redirect → 여기 도달은 에러
      if (result?.error) {
        setServerError(result.error);
      }
    });
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* §1 기본 정보 */}
        <section className="flex flex-col gap-5">
          <Field label="소모품명 *" error={errors.name?.message}>
            <input
              {...register("name")}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            />
          </Field>
          <Field label="단위" error={errors.unit?.message}>
            <input
              {...register("unit")}
              placeholder="개 / 병 / L / 롤"
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            />
          </Field>
          <Field label="품번(SKU)" error={errors.sku?.message}>
            <input
              {...register("sku")}
              className="rounded-md border border-border bg-surface px-3 py-2 font-mono tabular-nums text-body text-text"
            />
          </Field>
          <Field label="가격(내부용)" error={errors.price?.message}>
            <input
              {...register("price")}
              inputMode="decimal"
              placeholder="비공개 참고가"
              className="rounded-md border border-border bg-surface px-3 py-2 font-mono tabular-nums text-body text-text"
            />
          </Field>
          <Field label="상태" error={errors.status?.message}>
            <select
              {...register("status")}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            >
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>
          </Field>
          <Field label="메모" error={errors.note?.message}>
            <textarea
              {...register("note")}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
            />
          </Field>
        </section>

        {/* §2 적용 범위 */}
        <ConsumableScopeEditor
          control={control}
          register={register}
          setValue={setValue}
          catalog={props.catalog}
          categoryOptions={props.categoryOptions}
        />

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
            onClick={() => router.push("/admin/consumables")}
            className="text-small text-muted hover:text-text"
          >
            취소
          </button>
          {props.mode === "edit" ? (
            <button
              type="button"
              onClick={() => {
                if (!confirm("이 소모품을 삭제할까요? 매핑도 함께 삭제됩니다.")) return;
                startTransition(async () => {
                  const { deleteConsumable } = await import("@/lib/consumables/actions");
                  const result = await deleteConsumable(props.id);
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
