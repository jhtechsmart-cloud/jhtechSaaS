"use client";
import { useState } from "react";
import {
  useFieldArray,
  type Control,
  type UseFormRegister,
} from "react-hook-form";
import type { equipmentFormSchema } from "@/lib/equipment/schema";
import type { z } from "zod";

type FormInput = z.input<typeof equipmentFormSchema>;

// 사양 행 에디터 — label/value 자유 입력, 순서 = jsonb 저장 순서(AC6).
// 드래그(HTML5) + ↑↓ 버튼 병행(접근성: 드래그 only 금지, UI-SPEC).
export function SpecEditor({
  control,
  register,
}: {
  control: Control<FormInput>;
  register: UseFormRegister<FormInput>;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name: "specs" });
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">사양</h2>
        <button
          type="button"
          onClick={() => append({ label: "", value: "" })}
          className="text-small font-medium text-accent hover:underline"
        >
          + 항목 추가
        </button>
      </div>
      {fields.length === 0 ? (
        <p className="text-small text-muted">사양 항목이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <li
              key={field.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== index) move(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className="flex items-center gap-2 rounded-md border border-border bg-surface p-2"
            >
              <span className="cursor-grab select-none text-muted" aria-hidden>⋮⋮</span>
              <input
                {...register(`specs.${index}.label`)}
                placeholder="항목 (예: 전압)"
                className="w-40 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text"
              />
              <input
                {...register(`specs.${index}.value`)}
                placeholder="값 (예: 220V)"
                className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text"
              />
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                aria-label="위로"
                className="px-1 text-muted hover:text-text disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === fields.length - 1}
                aria-label="아래로"
                className="px-1 text-muted hover:text-text disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="행 삭제"
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
