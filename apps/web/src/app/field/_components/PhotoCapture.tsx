"use client";
import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { SERVICE_REPORT_LIMITS } from "@jhtechsaas/shared";

// 현장 사진 캡처/업로드 — 슬롯당 최대 6장, 클라 압축(최대 1600px JPEG — HEIC·용량·회전 해소),
// 썸네일 삭제(✕)·업로드 진행/실패·탭 재시도. 경로 = `<reportId>/<slot>-<n>.jpg` (스토리지 정책과 동일).
// (autoplan F6·F16·F-S2)

type Slot = "before" | "after";
type Item = { path: string; url: string; state: "uploading" | "done" | "error" };

// 이미지 파일 → 최대 1600px JPEG Blob. 디코드 실패(브라우저 미지원 포맷)면 null.
async function compressImage(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file); // EXIF 회전은 브라우저가 보정
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
    );
  } catch {
    return null;
  }
}

export function PhotoCapture({
  reportId,
  slot,
  title,
  initialPaths,
  onPathsChange,
}: {
  reportId: string;
  slot: Slot;
  title: string;
  initialPaths: string[];
  onPathsChange: (paths: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<Item[]>(
    initialPaths.map((p) => ({ path: p, url: "", state: "done" })),
  );
  const [note, setNote] = useState("");

  function sync(next: Item[]) {
    setItems(next);
    onPathsChange(next.filter((i) => i.state === "done").map((i) => i.path));
  }

  // 슬롯 내 미사용 번호(1~6) 배정 — 삭제 후 재업로드해도 충돌 없음.
  function nextIndex(current: Item[]): number | null {
    for (let n = 1; n <= SERVICE_REPORT_LIMITS.maxPhotosPerSlot; n++) {
      if (!current.some((i) => i.path.endsWith(`/${slot}-${n}.jpg`))) return n;
    }
    return null;
  }

  async function upload(file: File) {
    const n = nextIndex(items);
    if (n === null) {
      setNote(`사진은 최대 ${SERVICE_REPORT_LIMITS.maxPhotosPerSlot}장입니다`);
      return;
    }
    setNote("");
    const blob = await compressImage(file);
    if (!blob) {
      setNote("이미지를 처리할 수 없습니다 — 다른 사진으로 시도해 주세요");
      return;
    }
    const path = `${reportId}/${slot}-${n}.jpg`;
    const url = URL.createObjectURL(blob);
    const pending: Item = { path, url, state: "uploading" };
    const withPending = [...items, pending];
    setItems(withPending);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.storage
      .from("service-reports")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    sync(
      withPending.map((i) =>
        i.path === path ? { ...i, state: error ? "error" : "done" } : i,
      ),
    );
    if (error) setNote("업로드 실패 — 사진을 탭해 다시 시도해 주세요");
  }

  async function retry(item: Item) {
    // 실패 항목 탭 = 재시도(objectURL의 blob 재사용 불가 → 삭제 후 재선택 안내가 더 단순하지만,
    // 현장 흐름을 위해 blob을 다시 받아 재업로드).
    const res = await fetch(item.url).catch(() => null);
    const blob = res ? await res.blob() : null;
    if (!blob) {
      remove(item);
      setNote("다시 사진을 선택해 주세요");
      return;
    }
    setItems((cur) => cur.map((i) => (i.path === item.path ? { ...i, state: "uploading" } : i)));
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.storage
      .from("service-reports")
      .upload(item.path, blob, { contentType: "image/jpeg", upsert: true });
    setItems((cur) => {
      const next = cur.map((i) =>
        i.path === item.path ? { ...i, state: (error ? "error" : "done") as Item["state"] } : i,
      );
      onPathsChange(next.filter((i) => i.state === "done").map((i) => i.path));
      return next;
    });
  }

  async function remove(item: Item) {
    const supabase = createSupabaseBrowserClient();
    await supabase.storage.from("service-reports").remove([item.path]);
    sync(items.filter((i) => i.path !== item.path));
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div key={item.path} className="relative">
            <button
              type="button"
              aria-label={item.state === "error" ? "업로드 재시도" : "사진"}
              onClick={() => item.state === "error" && retry(item)}
              className={`block size-[72px] overflow-hidden rounded-md border ${
                item.state === "error" ? "border-2 border-danger" : "border-border"
              }`}
            >
              {/* objectURL/스토리지 썸네일 — next/image 비적용(로컬 blob) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url || undefined}
                alt=""
                className={`size-full object-cover ${item.state === "uploading" ? "opacity-40" : ""}`}
              />
              {item.state === "uploading" && (
                <span className="absolute inset-0 flex items-center justify-center text-micro text-muted">
                  업로드 중…
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label="사진 삭제"
              onClick={() => remove(item)}
              className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full border border-border bg-surface text-small text-text shadow-card"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex size-[72px] flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-surface text-micro text-muted"
        >
          <span className="text-h2 leading-none">＋</span>
          {title}
        </button>
      </div>
      {note && <p className="text-small text-danger">{note}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
