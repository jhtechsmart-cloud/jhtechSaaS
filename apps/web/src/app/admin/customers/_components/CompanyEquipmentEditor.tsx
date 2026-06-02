"use client";
import { useState } from "react";
import {
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import type { z } from "zod";
import type { companyFormSchema } from "@/lib/customers/schema";
import type { Equipment } from "@jhtechsaas/shared";

type FormInput = z.input<typeof companyFormSchema>;

// 카탈로그 아이템 — active 장비만 전달받음
type CatalogItem = Pick<Equipment, "id" | "name" | "model">;

// 장비 행 에디터 — 카탈로그(equipment_id) vs 직접입력(label) 토글 세그먼트.
// XOR 보장: 카탈로그 선택 시 label 무효화, 직접입력 시 equipment_id 무효화.
// 기존 행은 hidden input으로 id 보존 → diff-upsert 키로 사용됨.
export function CompanyEquipmentEditor({
  control,
  register,
  setValue,
  catalog,
}: {
  control: Control<FormInput>;
  register: UseFormRegister<FormInput>;
  setValue: UseFormSetValue<FormInput>;
  catalog: CatalogItem[];
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "equipment" });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 font-semibold text-text">보유장비</h2>
        <button
          type="button"
          onClick={() =>
            append({
              id: "",
              equipment_id: "",
              label: "",
              serial_no: "",
              purchased_at: "",
              install_address: "",
            })
          }
          className="text-small font-medium text-accent hover:underline"
        >
          + 장비 추가
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="text-small text-muted">보유장비가 없습니다</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <EquipmentRow
              key={field.id}
              index={index}
              control={control}
              register={register}
              setValue={setValue}
              catalog={catalog}
              onRemove={() => remove(index)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// 개별 행 — 토글 모드를 useState로 관리.
// 초기 mode는 equipment_id 유무로 결정(기존 행 로드 시 카탈로그/직접 복원).
function EquipmentRow({
  index,
  control,
  register,
  setValue,
  catalog,
  onRemove,
}: {
  index: number;
  control: Control<FormInput>;
  register: UseFormRegister<FormInput>;
  setValue: UseFormSetValue<FormInput>;
  catalog: CatalogItem[];
  onRemove: () => void;
}) {
  // 현재 행의 equipment_id를 구독 — 초기 모드 계산용(한 번만 읽으면 됨).
  const initialEquipmentId = useWatch({ control, name: `equipment.${index}.equipment_id` });
  const [mode, setMode] = useState<"catalog" | "direct">(() =>
    initialEquipmentId ? "catalog" : "direct",
  );

  return (
    <li className="flex flex-wrap items-start gap-2 rounded-md border border-border bg-surface p-3">
      {/* 카탈로그/직접입력 토글 세그먼트 */}
      <div className="flex gap-1 self-start">
        {(["catalog", "direct"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              // 반대 필드 초기화 — RHF는 언마운트 input 값을 보존하므로(shouldUnregister=false)
              // 명시적으로 비워야 XOR(둘 중 하나만)이 submit 시 보장됨.
              if (m === "catalog") setValue(`equipment.${index}.label`, "");
              else setValue(`equipment.${index}.equipment_id`, "");
              setMode(m);
            }}
            className={`rounded-sm px-2 py-1 text-small font-medium ${
              mode === m ? "bg-accent text-white" : "bg-surface-2 text-muted"
            }`}
          >
            {m === "catalog" ? "카탈로그" : "직접입력"}
          </button>
        ))}
      </div>

      {/* 카탈로그 select — mode=catalog 에만 렌더. 토글 전환 시 반대 필드는 setValue로 초기화됨. */}
      {mode === "catalog" ? (
        <select
          {...register(`equipment.${index}.equipment_id`)}
          className="min-w-[160px] rounded-sm border border-border bg-surface px-2 py-1 text-body text-text"
        >
          <option value="">장비 선택…</option>
          {catalog.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.name}
              {eq.model ? ` (${eq.model})` : ""}
            </option>
          ))}
        </select>
      ) : (
        /* 직접입력 — 토글 전환 시 equipment_id는 setValue로 초기화됨(XOR 보장). */
        <input
          {...register(`equipment.${index}.label`)}
          placeholder="장비명 직접 입력"
          className="min-w-[160px] rounded-sm border border-border bg-surface px-2 py-1 text-body text-text"
        />
      )}

      {/* 일련번호: mono tabular */}
      <input
        {...register(`equipment.${index}.serial_no`)}
        placeholder="일련번호"
        className="w-32 rounded-sm border border-border bg-surface px-2 py-1 font-mono tabular-nums text-body text-text"
      />

      {/* 구매일: date, mono */}
      <input
        type="date"
        {...register(`equipment.${index}.purchased_at`)}
        className="rounded-sm border border-border bg-surface px-2 py-1 font-mono text-body text-text"
      />

      {/* 설치주소: flex-1 */}
      <input
        {...register(`equipment.${index}.install_address`)}
        placeholder="설치주소"
        className="min-w-[160px] flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-body text-text"
      />

      {/* 기존 행 id 보존 — diff-upsert 키 */}
      <input type="hidden" {...register(`equipment.${index}.id`)} />

      {/* 행 삭제 */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="장비 행 삭제"
        className="self-start px-1 text-danger hover:underline"
      >
        ✕
      </button>
    </li>
  );
}
