"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, useController } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  equipmentFormSchema,
  type EquipmentFormValues,
} from "@/lib/equipment/schema";
import {
  createEquipment,
  updateEquipment,
  deleteEquipment,
  type EquipmentActionResult,
} from "../actions";
import { SpecEditor } from "./SpecEditor";
import { OptionEditor } from "./OptionEditor";
import { ImageUploader } from "./ImageUploader";

type EquipmentFormInput = z.input<typeof equipmentFormSchema>;

type Props =
  | { mode: "create" }
  | { mode: "edit"; id: string; initial: EquipmentFormValues };

export function EquipmentForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // create 모드는 진입 시 id 확정(이미지 경로 안정화). edit은 props.id.
  const equipmentId = useRef(
    props.mode === "edit" ? props.id : crypto.randomUUID(),
  );
  const cleanupRef = useRef<(() => Promise<void>) | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
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
            specs: [{ label: "", value: "" }], // UI-SPEC: 생성 시 1 빈 행
            photos: [],
            options: [],
          },
  });

  // photos는 배열 스칼라 → useController로 value/onChange 연결.
  const {
    field: { value: photos, onChange: setPhotos },
  } = useController({ control, name: "photos" });

  // 이월 ②: dirty 상태에서 이탈 시 경고(beforeunload).
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

  function onSubmit(values: EquipmentFormValues) {
    setServerError(null);
    startTransition(async () => {
      let result: EquipmentActionResult;
      if (props.mode === "create") {
        result = await createEquipment(equipmentId.current, values);
      } else {
        result = await updateEquipment(props.id, values);
      }
      // 성공 시 액션이 redirect → 여기 도달은 에러. 세션 업로드 best-effort 정리.
      if (result?.error) {
        setServerError(result.error);
        await cleanupRef.current?.();
      }
    });
  }

  async function onCancel() {
    await cleanupRef.current?.(); // 취소 시 세션 업로드 정리(고아 방지)
    router.push("/admin/equipment");
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
      className="flex max-w-[720px] flex-col gap-6"
    >
      {/* §1 기본 정보 */}
      <section className="flex flex-col gap-5">
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
      </section>

      {/* §2 사양 */}
      <SpecEditor control={control} register={register} />

      {/* §3 이미지 */}
      <ImageUploader
        equipmentId={equipmentId.current}
        value={photos ?? []}
        onChange={setPhotos}
        onUploadingChange={setUploading}
        registerCleanup={(fn) => {
          cleanupRef.current = fn;
        }}
      />

      {/* §4 옵션 */}
      <OptionEditor control={control} register={register} />

      {serverError ? (
        <p className="text-small text-danger">{serverError}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || uploading}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
        >
          {pending ? <Spinner /> : null}
          {uploading ? "업로드 완료 후 저장" : pending ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onCancel}
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

// 이월 ①: 저장 중 spinner 아이콘.
function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
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
