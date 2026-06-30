"use client";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useForm, useController, FormProvider } from "react-hook-form";
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
import { equipmentSelectableOptions, type CategoryNode } from "@/lib/equipment/category-tree";
import { SpecEditor } from "./SpecEditor";
import { HighlightsEditor } from "./HighlightsEditor";
import { YoutubeUrlsEditor } from "./YoutubeUrlsEditor";
import { OptionEditor } from "./OptionEditor";
import { ImageUploader } from "./ImageUploader";
import { BannerUploader } from "./BannerUploader";
import { CatalogUploader } from "./CatalogUploader";
import { Card, DeleteButton } from "./Card";

type EquipmentFormInput = z.input<typeof equipmentFormSchema>;

type Props =
  | { mode: "create"; categories: CategoryNode[] }
  | { mode: "edit"; id: string; initial: EquipmentFormValues; categories: CategoryNode[] };

export function EquipmentForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // create 모드는 진입 시 id 확정(이미지 경로 안정화). edit은 props.id.
  // useState 초기값으로 고정 — useRef.current 를 렌더 중 읽으면 react-hooks/refs 위반.
  const [equipmentId] = useState(
    () => props.mode === "edit" ? props.id : crypto.randomUUID(),
  );
  const cleanupRef = useRef<(() => Promise<void>) | null>(null);

  const methods = useForm<EquipmentFormInput, unknown, EquipmentFormValues>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues:
      props.mode === "edit"
        ? props.initial
        : {
            name: "",
            model: "",
            category_id: "",
            base_price: 0,
            status: "active",
            is_demo: false,
            highlights: [],
            youtube_urls: [],
            // UI-SPEC: 생성 시 1 빈 그룹(아이템 1 빈 행)
            specs: [{ group: "", icon: "settings", items: [{ id: "", label: "", value: "", pdf: true }] }],
            photos: [],
            options: [],
            quote_device_name: "",
            quote_device_image: "",
            catalog_pdf: "",
          },
  });
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = methods;

  // photos는 배열 스칼라 → useController로 value/onChange 연결.
  const {
    field: { value: photos, onChange: setPhotos },
  } = useController({ control, name: "photos" });

  // 견적서 장비 자산(네임·이미지)도 스칼라 → useController로 연결(watch() 미사용=React Compiler 경고 회피).
  const {
    field: { value: deviceName, onChange: setDeviceName },
  } = useController({ control, name: "quote_device_name" });
  const {
    field: { value: deviceImage, onChange: setDeviceImage },
  } = useController({ control, name: "quote_device_image" });
  const {
    field: { value: catalogPdf, onChange: setCatalogPdf },
  } = useController({ control, name: "catalog_pdf" });

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
        result = await createEquipment(equipmentId, values);
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

  // 편집 중인 장비의 현재 분류가 선택 가능한 옵션에 없으면(예: 자식이 생겨 그룹헤더가 된 대분류)
  // "재배정 필요" 옵션으로 노출해 값 보존(저장 시 조용히 null로 덮어쓰는 사고 방지).
  const selectableIds = new Set(
    equipmentSelectableOptions(props.categories).flatMap((g) => g.options.map((o) => o.id)),
  );
  const currentCategoryId = props.mode === "edit" ? props.initial.category_id : "";
  const orphanCategory =
    currentCategoryId && !selectableIds.has(currentCategoryId)
      ? props.categories.find((n) => n.id === currentCategoryId)
      : null;

  return (
    <FormProvider {...methods}>
    <form
      // cleanupRef.current는 startTransition 내부(비동기)에서만 읽힘 — 렌더 중 읽기 아님.
      // eslint-disable-next-line react-hooks/refs
      onSubmit={handleSubmit(onSubmit)}
      className="flex w-full max-w-[940px] flex-col gap-4"
    >
      {/* 상단 2열 — 좌: 기본 정보(한 줄에 하나씩) / 우: 포함옵션(동일 높이·내부 스크롤).
          고정 높이라 옵션이 많아지면 카드가 안 늘고 목록만 스크롤된다. */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card title="기본 정보" className="h-[28rem]">
          <div className="flex flex-col gap-3.5">
            <Field label="장비명" error={errors.name?.message}>
              {/* 장비명 옆 '데모 가능' 체크박스 — 켜면 데모예약 폼 장비 목록에 노출된다. */}
              <div className="flex items-center gap-3">
                <input
                  {...register("name")}
                  className="flex-1 rounded-[5px] border border-border bg-surface px-3 py-2 text-body text-text"
                />
                <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-small text-text">
                  <input type="checkbox" {...register("is_demo")} className="h-4 w-4 accent-accent" />
                  데모 가능
                </label>
              </div>
            </Field>
            <Field label="모델" error={errors.model?.message}>
              <input
                {...register("model")}
                className="rounded-[5px] border border-border bg-surface px-3 py-2 font-mono text-body text-text"
              />
            </Field>
            <Field label="분류" error={errors.category_id?.message}>
              {/* equipment_category 드롭다운 — category_id FK 저장 */}
              <select
                {...register("category_id")}
                className="rounded-[5px] border border-border bg-surface px-3 py-2 text-body text-text"
              >
                <option value="">미지정</option>
                {/* 현재 category_id가 선택 불가 노드(그룹헤더)면 재배정 필요 옵션으로 노출해 값 보존 */}
                {orphanCategory ? (
                  <option value={orphanCategory.id}>{orphanCategory.name} (재배정 필요)</option>
                ) : null}
                {equipmentSelectableOptions(props.categories).map((g, i) =>
                  g.group === null ? (
                    // 독립 옵션(최상위 리프 노드)은 Fragment로 래핑해 React key 경고 방지
                    <Fragment key={`standalone-${i}`}>
                      {g.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </Fragment>
                  ) : (
                    <optgroup key={`g${i}`} label={g.group}>
                      {g.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </optgroup>
                  ),
                )}
              </select>
            </Field>
            <Field label="기본가(₩)" error={errors.base_price?.message}>
              <input
                type="number"
                min={0}
                {...register("base_price", { valueAsNumber: true })}
                className="rounded-[5px] border border-border bg-surface px-3 py-2 font-mono tabular-nums text-body text-text"
              />
            </Field>
            <Field label="상태" error={errors.status?.message}>
              <select
                {...register("status")}
                className="rounded-[5px] border border-border bg-surface px-3 py-2 text-body text-text"
              >
                <option value="active">판매중</option>
                <option value="inactive">비활성</option>
              </select>
            </Field>
          </div>
        </Card>

        {/* 포함옵션 — 기본정보 우측(동일 높이·고정) */}
        <OptionEditor control={control} register={register} className="h-[28rem]" />
      </div>

      {/* 박스 밖 안내 — 기본정보 + 포함옵션 아래 한 줄 */}
      <div className="flex items-center gap-2 rounded-[10px] border border-border bg-mint-hover px-3.5 py-2.5 text-small text-muted">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">i</span>
        포함옵션의 가격은 견적서에 표기되지 않습니다. 포함옵션 가격을 입력할 경우 기본가격에 포함되어 견적서에 표시됩니다.
      </div>

      {/* 사양 · 요약 · 영상 */}
      <Card>
        <div className="flex flex-col gap-6">
          <HighlightsEditor control={control} register={register} />
          <SpecEditor control={control} register={register} />
          <YoutubeUrlsEditor control={control} register={register} />
        </div>
      </Card>

      {/* 제품 이미지 */}
      <Card>
        <ImageUploader
          equipmentId={equipmentId}
          value={photos ?? []}
          onChange={setPhotos}
          onUploadingChange={setUploading}
          registerCleanup={(fn) => {
            cleanupRef.current = fn;
          }}
        />
      </Card>

      {/* 견적서 장비 자산 · 카탈로그 PDF */}
      <Card title="견적서 장비 자산 · 카탈로그 PDF">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BannerUploader
            equipmentId={equipmentId}
            slot="name"
            value={deviceName ?? ""}
            onChange={setDeviceName}
            onUploadingChange={setUploading}
          />
          <BannerUploader
            equipmentId={equipmentId}
            slot="image"
            value={deviceImage ?? ""}
            onChange={setDeviceImage}
            onUploadingChange={setUploading}
          />
        </div>
        <div className="mt-4">
          <CatalogUploader
            equipmentId={equipmentId}
            value={catalogPdf ?? ""}
            onChange={setCatalogPdf}
            onUploadingChange={setUploading}
          />
        </div>
      </Card>

      {serverError ? (
        <p className="text-small text-danger">{serverError}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || uploading}
          className="flex items-center gap-2 rounded-[5px] bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
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
          <DeleteButton onClick={onDelete} label="장비 삭제" className="ml-auto" />
        ) : null}
      </div>
    </form>
    </FormProvider>
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
