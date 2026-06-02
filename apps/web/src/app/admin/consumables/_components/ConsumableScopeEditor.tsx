"use client";
import { Fragment, useState } from "react";
import {
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import type { z } from "zod";
import type { consumableFormSchema } from "@/lib/consumables/schema";
import { type OptGroup } from "@/lib/equipment/category-tree";

type FormInput = z.input<typeof consumableFormSchema>;
type CatalogItem = { id: string; name: string; model: string | null };

// 매핑 에디터 — 분류(category_id) vs 특정 장비(equipment_id) 토글.
// XOR 보장: 분류 선택 시 equipment_id 무효화, 장비 선택 시 category_id 무효화.
// 기존 행은 hidden input으로 id 보존 → diff-upsert 키.
export function ConsumableScopeEditor({
  control,
  register,
  setValue,
  catalog,
  categoryOptions,
}: {
  control: Control<FormInput>;
  register: UseFormRegister<FormInput>;
  setValue: UseFormSetValue<FormInput>;
  catalog: CatalogItem[];
  categoryOptions: OptGroup[];
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "scopes" });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">적용 범위</h2>
        <button
          type="button"
          onClick={() => append({ id: "", category_id: "", equipment_id: "" })}
          className="text-small font-medium text-accent hover:underline"
        >
          + 범위 추가
        </button>
      </div>
      <p className="text-micro text-muted">
        분류를 선택하면 그 분류의 모든 장비에 자동 적용됩니다. 특정 모델 전용이면 장비를 직접 선택하세요.
      </p>

      {fields.length === 0 ? (
        <p className="text-small text-muted">
          적용 범위가 없습니다 — 이 소모품은 어떤 장비에도 매칭되지 않습니다
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <ScopeRow
              key={field.id}
              index={index}
              control={control}
              register={register}
              setValue={setValue}
              catalog={catalog}
              categoryOptions={categoryOptions}
              onRemove={() => remove(index)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// 개별 행 — 토글 모드를 useState로 관리.
// 초기 mode는 equipment_id 유무로 결정(기존 행 로드 시 장비/분류 복원).
function ScopeRow({
  index,
  control,
  register,
  setValue,
  catalog,
  categoryOptions,
  onRemove,
}: {
  index: number;
  control: Control<FormInput>;
  register: UseFormRegister<FormInput>;
  setValue: UseFormSetValue<FormInput>;
  catalog: CatalogItem[];
  categoryOptions: OptGroup[];
  onRemove: () => void;
}) {
  // 현재 행의 equipment_id를 구독 — 초기 모드 계산용(한 번만 읽으면 됨).
  const initialEquipmentId = useWatch({ control, name: `scopes.${index}.equipment_id` });
  const [mode, setMode] = useState<"category" | "equipment">(() =>
    initialEquipmentId ? "equipment" : "category",
  );

  return (
    <li className="flex flex-wrap items-start gap-2 rounded-md border border-border bg-surface p-3">
      {/* 분류/특정 장비 토글 세그먼트 */}
      <div className="flex gap-1 self-start">
        {(["category", "equipment"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              // 반대 필드 초기화 — RHF는 언마운트 input 값을 보존하므로(shouldUnregister=false)
              // 명시적으로 비워야 XOR(둘 중 하나만)이 submit 시 보장됨.
              if (m === "category") setValue(`scopes.${index}.equipment_id`, "");
              else setValue(`scopes.${index}.category_id`, "");
              setMode(m);
            }}
            className={`rounded-sm px-2 py-1 text-small font-medium ${
              mode === m ? "bg-accent text-white" : "bg-surface-2 text-muted"
            }`}
          >
            {m === "category" ? "분류" : "특정 장비"}
          </button>
        ))}
      </div>

      {/* 분류 select — mode=category 에만 렌더. 토글 전환 시 equipment_id는 setValue로 초기화됨. */}
      {mode === "category" ? (
        <select
          {...register(`scopes.${index}.category_id`)}
          className="min-w-[180px] rounded-sm border border-border bg-surface px-2 py-1 text-body text-text"
        >
          <option value="">분류 선택…</option>
          {categoryOptions.map((g, gi) =>
            g.group === null ? (
              // 그룹 없는 단독 옵션들 — Fragment로 키 부여
              <Fragment key={`sg${gi}`}>
                {g.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Fragment>
            ) : (
              <optgroup key={`g${gi}`} label={g.group}>
                {g.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </select>
      ) : (
        /* 특정 장비 select — 토글 전환 시 category_id는 setValue로 초기화됨(XOR 보장). */
        <select
          {...register(`scopes.${index}.equipment_id`)}
          className="min-w-[180px] rounded-sm border border-border bg-surface px-2 py-1 text-body text-text"
        >
          <option value="">장비 선택…</option>
          {catalog.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.name}
              {eq.model ? ` (${eq.model})` : ""}
            </option>
          ))}
        </select>
      )}

      {/* 기존 행 id 보존 — diff-upsert 키 */}
      <input type="hidden" {...register(`scopes.${index}.id`)} />

      {/* 행 삭제 */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="범위 행 삭제"
        className="self-start px-1 text-danger hover:underline"
      >
        ✕
      </button>
    </li>
  );
}
