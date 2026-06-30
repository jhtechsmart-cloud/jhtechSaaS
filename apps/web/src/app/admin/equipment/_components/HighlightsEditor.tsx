"use client";
import { useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import type { equipmentFormSchema } from "@/lib/equipment/schema";
import type { z } from "zod";
import { DeleteButton } from "./Card";

type FormInput = z.input<typeof equipmentFormSchema>;

// 요약 불릿 에디터 — 문자열 배열. RHF useFieldArray는 원시값 배열을 직접 다루지 못해
// name 인덱스로 직접 register한다. ("highlights" as never 캐스팅은 RHF 원시배열 한계 회피용)
export function HighlightsEditor({ control, register }: { control: Control<FormInput>; register: UseFormRegister<FormInput> }) {
  const { fields, append, remove } = useFieldArray({ control, name: "highlights" as never });
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">요약(highlights)</h2>
        <button type="button" onClick={() => append("" as never)} className="text-small font-medium text-accent hover:underline">+ 불릿 추가</button>
      </div>
      {fields.length === 0 ? (
        <p className="text-small text-muted">요약 불릿이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <li key={field.id} className="flex items-center gap-2">
              <input {...register(`highlights.${index}` as const)} placeholder="예: 시간당 1,200매 처리" className="flex-1 rounded-[5px] border border-border bg-surface px-2.5 py-1.5 text-body text-text" />
              <DeleteButton onClick={() => remove(index)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
