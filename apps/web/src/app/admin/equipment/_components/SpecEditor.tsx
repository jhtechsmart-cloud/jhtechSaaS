"use client";
import { useFieldArray, useFormContext, useWatch, type Control, type UseFormRegister } from "react-hook-form";
import { SPEC_ICONS } from "@jhtechsaas/shared";
import { SpecGroupIcon } from "@/components/SpecGroupIcon";
import type { equipmentFormSchema } from "@/lib/equipment/schema";
import type { z } from "zod";

type FormInput = z.input<typeof equipmentFormSchema>;

// 선택된 아이콘 이름 옆에 실제 아이콘 미리보기 — native select는 옵션에 SVG를 못 넣어서.
// 공개 상세페이지에서 사양 그룹마다 이 아이콘이 표시된다(SpecGroupIcon).
function IconPreview({ control, gIndex }: { control: Control<FormInput>; gIndex: number }) {
  const icon = useWatch({ control, name: `specs.${gIndex}.icon` });
  return <SpecGroupIcon icon={icon ?? "settings"} className="h-5 w-5 shrink-0 text-muted" />;
}

// 그룹 사양 에디터 — 그룹(이름+아이콘) + 하위 items(label/value). 그룹/아이템 순서 이동.
export function SpecEditor({ control, register }: { control: Control<FormInput>; register: UseFormRegister<FormInput> }) {
  const { fields, append, remove, move } = useFieldArray({ control, name: "specs" });
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">사양</h2>
        <button type="button" onClick={() => append({ group: "", icon: "settings", items: [{ id: "", label: "", value: "", pdf: true }] })} className="text-small font-medium text-accent hover:underline">+ 그룹 추가</button>
      </div>
      {fields.length === 0 ? (
        <p className="text-small text-muted">사양 그룹이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {fields.map((field, gIndex) => (
            <li key={field.id} className="rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center gap-2">
                <IconPreview control={control} gIndex={gIndex} />
                <select {...register(`specs.${gIndex}.icon`)} className="rounded-sm border border-border bg-surface px-2 py-1 text-body text-text">
                  {SPEC_ICONS.map((ic) => (<option key={ic} value={ic}>{ic}</option>))}
                </select>
                <input {...register(`specs.${gIndex}.group`)} placeholder="그룹명 (예: 성능)" className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text" />
                <button type="button" onClick={() => gIndex > 0 && move(gIndex, gIndex - 1)} className="text-muted" aria-label="위로">↑</button>
                <button type="button" onClick={() => gIndex < fields.length - 1 && move(gIndex, gIndex + 1)} className="text-muted" aria-label="아래로">↓</button>
                <button type="button" onClick={() => remove(gIndex)} className="text-small text-danger hover:underline">그룹삭제</button>
              </div>
              <SpecItems gIndex={gIndex} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// 중첩 useFieldArray는 useFormContext로 control 획득(부모가 FormProvider로 감쌈).
function SpecItems({ gIndex }: { gIndex: number }) {
  const { control, register } = useFormContext<FormInput>();
  const { fields, append, remove } = useFieldArray({ control, name: `specs.${gIndex}.items` as const });
  return (
    <div className="flex flex-col gap-2">
      {fields.map((f, iIndex) => (
        <SpecItemRow key={f.id} control={control} register={register} gIndex={gIndex} iIndex={iIndex} onRemove={() => remove(iIndex)} />
      ))}
      <button type="button" onClick={() => append({ id: "", label: "", value: "", pdf: true })} className="self-start text-small font-medium text-accent hover:underline">+ 항목</button>
    </div>
  );
}

// 사양 항목 한 줄 — 값이 비면 PDF 포함 체크박스를 비활성(값 없는 항목은 견적서 PDF 미포함).
function SpecItemRow({
  control,
  register,
  gIndex,
  iIndex,
  onRemove,
}: {
  control: Control<FormInput>;
  register: UseFormRegister<FormInput>;
  gIndex: number;
  iIndex: number;
  onRemove: () => void;
}) {
  // 항목 이름(라벨)·값이 모두 있어야 PDF 포함 가능 — 둘 중 하나라도 비면 체크박스 비활성.
  const label = useWatch({ control, name: `specs.${gIndex}.items.${iIndex}.label` });
  const value = useWatch({ control, name: `specs.${gIndex}.items.${iIndex}.value` });
  const hasLabel = (label ?? "").trim() !== "";
  const hasValue = (value ?? "").trim() !== "";
  const canInclude = hasLabel && hasValue;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <label
          className="flex shrink-0 items-center gap-1 text-small text-muted"
          title={canInclude ? "견적서 PDF에 기본 포함" : "항목 이름과 값을 모두 입력하면 PDF에 포함할 수 있습니다"}
        >
          <input
            type="checkbox"
            {...register(`specs.${gIndex}.items.${iIndex}.pdf`)}
            disabled={!canInclude}
            className="h-4 w-4 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span className="hidden sm:inline">PDF</span>
        </label>
        <input {...register(`specs.${gIndex}.items.${iIndex}.label`)} placeholder="항목 (예: 속도)" className="w-40 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text" />
        <input {...register(`specs.${gIndex}.items.${iIndex}.value`)} placeholder="값 (예: 1200매/h)" className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 font-mono text-body text-text" />
        <button type="button" onClick={onRemove} className="text-small text-danger hover:underline">삭제</button>
      </div>
      {!canInclude && (
        <p className="pl-1 text-small text-muted">항목 이름과 값을 모두 입력해야 견적서 PDF에 포함됩니다.</p>
      )}
    </div>
  );
}
