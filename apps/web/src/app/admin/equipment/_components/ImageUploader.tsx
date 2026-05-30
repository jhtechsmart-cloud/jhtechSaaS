"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  IMAGE_ACCEPT,
  validateImageFile,
  equipmentImageObjectPath,
  publicImageUrl,
} from "@/lib/equipment/images";
import { moveItem } from "@/lib/equipment/arrays";

type Props = {
  equipmentId: string;
  value: string[]; // photos 경로(RHF 필드)
  onChange: (paths: string[]) => void;
  onUploadingChange: (uploading: boolean) => void; // 폼이 저장 가드
  registerCleanup: (fn: () => Promise<void>) => void; // 취소/실패 시 세션 업로드 정리
};

// 이미지 업로더 — 첫 장 = 대표(UI-SPEC §3·AC4).
export function ImageUploader({
  equipmentId,
  value,
  onChange,
  onUploadingChange,
  registerCleanup,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // 이 세션에 업로드한 경로(취소/실패 시 best-effort 삭제 대상). 기존 사진은 미포함.
  const sessionUploads = useRef<Set<string>>(new Set());
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    onUploadingChange(uploadingCount > 0);
  }, [uploadingCount, onUploadingChange]);

  useEffect(() => {
    // 폼에 정리 함수 등록(취소·저장 실패 시 호출). 세션 업로드분만 삭제.
    registerCleanup(async () => {
      const supabase = createSupabaseBrowserClient();
      const paths = Array.from(sessionUploads.current);
      if (paths.length > 0) {
        await supabase.storage.from("equipment-images").remove(paths).catch(() => {});
      }
      sessionUploads.current.clear();
    });
  }, [registerCleanup]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const supabase = createSupabaseBrowserClient();
    const nextErrors: string[] = [];
    // 한 배치 안에서 await 사이 re-render가 없으므로 로컬 누적기로 순차 반영.
    let acc = valueRef.current.slice();

    for (const file of Array.from(files)) {
      const check = validateImageFile(file);
      if (!check.ok) {
        nextErrors.push(check.error); // 부분 성공 허용 — 거부분만 에러
        continue;
      }
      const path = equipmentImageObjectPath(equipmentId, file, crypto.randomUUID());
      setUploadingCount((n) => n + 1);
      const { error } = await supabase.storage
        .from("equipment-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      setUploadingCount((n) => n - 1);
      if (error) {
        nextErrors.push(`${file.name}: 업로드 실패`);
        continue;
      }
      sessionUploads.current.add(path);
      acc = [...acc, path];
      onChange(acc);
    }
    setErrors(nextErrors);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleRemove(index: number) {
    const path = value[index];
    if (!confirm("이 이미지를 삭제할까요?")) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.storage.from("equipment-images").remove([path]).catch(() => {});
    sessionUploads.current.delete(path);
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-h2 font-semibold text-text">이미지</h2>

      {/* 드롭존 — 업로드 진행 중엔 새 파일 진입 차단(동시 배치 경쟁 방지) */}
      <div
        onClick={() => { if (uploadingCount === 0) inputRef.current?.click(); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (uploadingCount > 0) return; // 업로드 중 드롭 무시
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-border bg-surface-2 p-6 text-center${uploadingCount > 0 ? " pointer-events-none opacity-60" : ""}`}
      >
        <p className="text-body text-text">⬆ 이미지를 끌어다 놓거나 클릭해서 선택</p>
        <p className="text-micro text-muted">jpg · png · webp · 최대 5MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          disabled={uploadingCount > 0}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* 에러 칩(부분 성공) */}
      {errors.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {errors.map((msg, i) => (
            <li key={i} className="text-micro text-danger">{msg}</li>
          ))}
        </ul>
      ) : null}

      {/* 진행 중(partial) */}
      {uploadingCount > 0 ? (
        <p className="text-small text-muted">업로드 중… ({uploadingCount})</p>
      ) : null}

      {/* 썸네일 그리드 */}
      {value.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {value.map((path, index) => (
            <li
              key={path}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== index) {
                  onChange(moveItem(value, dragIndex, index));
                }
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className="relative flex flex-col gap-1 rounded-md border border-border bg-surface p-1"
            >
              <Image
                src={publicImageUrl(path)}
                alt=""
                width={96}
                height={96}
                unoptimized
                className="h-24 w-full rounded-sm object-cover"
              />
              {index === 0 ? (
                <span className="absolute left-1 top-1 rounded-sm bg-accent px-1.5 py-0.5 text-micro font-medium text-white">
                  대표
                </span>
              ) : null}
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onChange(moveItem(value, index, index - 1))}
                    disabled={index === 0}
                    aria-label="앞으로"
                    className="px-1 text-muted hover:text-text disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange(moveItem(value, index, index + 1))}
                    disabled={index === value.length - 1}
                    aria-label="뒤로"
                    className="px-1 text-muted hover:text-text disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  aria-label="이미지 삭제"
                  className="px-1 text-danger hover:underline"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
