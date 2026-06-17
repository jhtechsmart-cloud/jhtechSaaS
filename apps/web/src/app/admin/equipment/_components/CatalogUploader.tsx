"use client";
import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// 제품 카탈로그 PDF 단일 업로더 — 공개 버킷 equipment-catalogs/equipment/{id}/catalog.pdf. 덮어쓰기(upsert).
// PDF 전용·20MB. 메일에 카탈로그 다운로드 링크로 쓰인다.
const MAX = 20 * 1024 * 1024;

type Props = {
  equipmentId: string;
  value: string;
  onChange: (path: string) => void;
  onUploadingChange: (uploading: boolean) => void; // 폼 저장 가드
};

export function CatalogUploader({ equipmentId, value, onChange, onUploadingChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File) {
    setError(null);
    if (file.type !== "application/pdf") {
      setError("PDF 파일만 업로드할 수 있습니다");
      return;
    }
    if (file.size > MAX) {
      setError("20MB 이하만 업로드할 수 있습니다");
      return;
    }
    setBusy(true);
    onUploadingChange(true);
    try {
      const path = `equipment/${equipmentId}/catalog.pdf`;
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from("equipment-catalogs")
        .upload(path, file, { contentType: "application/pdf", upsert: true });
      if (upErr) {
        setError(`업로드 실패: ${upErr.message}`);
        return;
      }
      onChange(path);
    } finally {
      setBusy(false);
      onUploadingChange(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-small font-medium text-text">제품 카탈로그 (PDF)</span>
      <span className="text-micro text-muted">
        견적 메일에 카탈로그 다운로드 링크로 함께 발송됩니다. PDF만, 최대 20MB.
      </span>
      {value ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-small">
          <span className="truncate text-text">✓ 카탈로그 등록됨 (catalog.pdf)</span>
          <button type="button" onClick={() => onChange("")} className="shrink-0 text-danger underline">
            제거
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-md border border-dashed border-border px-3 py-3 text-small text-muted hover:bg-surface-2 disabled:opacity-50"
        >
          {busy ? "업로드 중…" : "PDF 카탈로그 업로드"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          e.target.value = "";
        }}
      />
      {error && <span className="text-micro text-danger">{error}</span>}
    </div>
  );
}
