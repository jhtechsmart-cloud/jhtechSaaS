"use client";
import {
  useFieldArray,
  type Control,
  type UseFormRegister,
} from "react-hook-form";
import type { equipmentFormSchema } from "@/lib/equipment/schema";
import type { z } from "zod";
import { Card, AddButton } from "./Card";

type FormInput = z.input<typeof equipmentFormSchema>;

// 포함옵션 에디터 — name + price(mono tabular)만. '포함/추가' 구분은 제거(전부 포함옵션).
// 가격 기본 0. 빈 name 행은 저장 시 제거(serializeOptions). 동일높이 카드 + 목록 내부 스크롤.
export function OptionEditor({
  control,
  register,
  className,
}: {
  control: Control<FormInput>;
  register: UseFormRegister<FormInput>;
  className?: string;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "options" });

  return (
    <Card
      title="포함옵션"
      action={<AddButton onClick={() => append({ kind: "included", name: "", price: 0 })}>+ 옵션 추가</AddButton>}
      // 기본정보 카드와 동일 높이로 늘어나고, 옵션이 많아지면 목록만 내부 스크롤.
      // 본문 패딩은 스크롤 ul이 직접 가짐(포커스 링이 overflow 경계에서 잘리지 않게 안쪽 여백 확보).
      className={className}
      bodyClassName="flex min-h-0 flex-col"
    >
      {fields.length === 0 ? (
        <p className="p-3.5 text-small text-muted">옵션이 없습니다.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
          {fields.map((field, index) => (
            <li key={field.id} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
              <input
                {...register(`options.${index}.name`)}
                placeholder="옵션명"
                className="rounded-[5px] border border-border bg-surface px-2.5 py-1.5 text-body text-text"
              />
              <input
                type="number"
                min={0}
                {...register(`options.${index}.price`, { valueAsNumber: true })}
                placeholder="0"
                className="rounded-[5px] border border-border bg-surface px-2.5 py-1.5 text-right font-mono tabular-nums text-body text-text"
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
    </Card>
  );
}
