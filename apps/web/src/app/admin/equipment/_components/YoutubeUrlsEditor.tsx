"use client";
import { useFieldArray, type Control, type UseFormRegister } from "react-hook-form";
import type { equipmentFormSchema } from "@/lib/equipment/schema";
import type { z } from "zod";

type FormInput = z.input<typeof equipmentFormSchema>;

// 복수 제품 영상 URL 에디터 — 문자열 배열(YouTube 호스트 검증은 zod에서).
export function YoutubeUrlsEditor({ control, register }: { control: Control<FormInput>; register: UseFormRegister<FormInput> }) {
  const { fields, append, remove } = useFieldArray({ control, name: "youtube_urls" as never });
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">제품 영상(YouTube, 복수)</h2>
        <button type="button" onClick={() => append("" as never)} className="text-small font-medium text-accent hover:underline">+ 영상 추가</button>
      </div>
      {fields.length === 0 ? (
        <p className="text-small text-muted">영상이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <li key={field.id} className="flex items-center gap-2">
              <input {...register(`youtube_urls.${index}` as const)} placeholder="https://youtu.be/..." className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text" />
              <button type="button" onClick={() => remove(index)} className="text-small text-danger hover:underline">삭제</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
