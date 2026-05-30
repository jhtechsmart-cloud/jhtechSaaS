"use client";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  equipmentFormSchema,
  type EquipmentFormValues,
} from "@/lib/equipment/schema";

// RHF는 입력 타입(optional defaults)으로 제어, 액션은 출력 타입(EquipmentFormValues)으로 전달.
type EquipmentFormInput = z.input<typeof equipmentFormSchema>;
import {
  createEquipment,
  updateEquipment,
  deleteEquipment,
  type EquipmentActionResult,
} from "../actions";

type Props =
  | { mode: "create" }
  | { mode: "edit"; id: string; initial: EquipmentFormValues };

export function EquipmentForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EquipmentFormInput, unknown, EquipmentFormValues>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues:
      props.mode === "edit"
        ? props.initial
        : {
            name: "",
            model: "",
            category: "",
            base_price: 0,
            status: "active",
            youtube_url: "",
          },
  });

  function onSubmit(values: EquipmentFormValues) {
    setServerError(null);
    startTransition(async () => {
      let result: EquipmentActionResult;
      if (props.mode === "create") {
        result = await createEquipment(crypto.randomUUID(), values);
      } else {
        result = await updateEquipment(props.id, values);
      }
      // 성공 시 액션이 redirect하므로 여기 도달은 에러 케이스.
      if (result?.error) setServerError(result.error);
    });
  }

  function onDelete() {
    if (props.mode !== "edit") return;
    if (!confirm("이 장비를 삭제할까요?")) return;
    startTransition(async () => {
      const result = await deleteEquipment(props.id);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex max-w-[720px] flex-col gap-5"
    >
      <Field label="장비명" error={errors.name?.message}>
        <input
          {...register("name")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </Field>
      <Field label="모델" error={errors.model?.message}>
        <input
          {...register("model")}
          className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-body text-text"
        />
      </Field>
      <Field label="분류" error={errors.category?.message}>
        <input
          {...register("category")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </Field>
      <Field label="기본가(₩)" error={errors.base_price?.message}>
        <input
          type="number"
          min={0}
          {...register("base_price", { valueAsNumber: true })}
          className="rounded-md border border-border bg-surface px-3 py-2 font-mono tabular-nums text-body text-text"
        />
      </Field>
      <Field label="상태" error={errors.status?.message}>
        <select
          {...register("status")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        >
          <option value="active">운영중</option>
          <option value="inactive">비활성</option>
        </select>
      </Field>
      <Field label="YouTube URL(선택)" error={errors.youtube_url?.message}>
        <input
          {...register("youtube_url")}
          className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
      </Field>

      {serverError ? (
        <p className="text-small text-danger">{serverError}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/equipment")}
          className="text-small text-muted hover:text-text"
        >
          취소
        </button>
        {props.mode === "edit" ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="ml-auto text-small text-danger hover:underline"
          >
            삭제
          </button>
        ) : null}
      </div>
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
    <label className="flex flex-col gap-1">
      <span className="text-small text-muted">{label}</span>
      {children}
      {error ? <span className="text-micro text-danger">{error}</span> : null}
    </label>
  );
}
