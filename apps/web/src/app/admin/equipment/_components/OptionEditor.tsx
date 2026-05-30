"use client";
import {
  useFieldArray,
  type Control,
  type UseFormRegister,
} from "react-hook-form";
import type { equipmentFormSchema } from "@/lib/equipment/schema";
import type { z } from "zod";

type FormInput = z.input<typeof equipmentFormSchema>;

// 옵션 행 에디터 — included(포함)/extra(추가) 세그먼트 + name + price(mono tabular).
// 빈 name 행은 저장 시 제거(serializeOptions).
export function OptionEditor({
  control,
  register,
}: {
  control: Control<FormInput>;
  register: UseFormRegister<FormInput>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "options" });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">옵션</h2>
        <button
          type="button"
          onClick={() => append({ kind: "included", name: "", price: 0 })}
          className="text-small font-medium text-accent hover:underline"
        >
          + 옵션 추가
        </button>
      </div>
      {fields.length === 0 ? (
        <p className="text-small text-muted">옵션이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <li
              key={field.id}
              className="flex items-center gap-2 rounded-md border border-border bg-surface p-2"
            >
              <select
                {...register(`options.${index}.kind`)}
                className="rounded-sm border border-border bg-surface px-2 py-1 text-small text-text"
              >
                <option value="included">포함</option>
                <option value="extra">추가</option>
              </select>
              <input
                {...register(`options.${index}.name`)}
                placeholder="옵션명"
                className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text"
              />
              <input
                type="number"
                min={0}
                {...register(`options.${index}.price`, { valueAsNumber: true })}
                placeholder="0"
                className="w-32 rounded-sm border border-border bg-surface px-2 py-1 text-right font-mono tabular-nums text-body text-text"
              />
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="옵션 삭제"
                className="px-1 text-danger hover:underline"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
