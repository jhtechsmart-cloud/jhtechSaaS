"use client";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FileDropCard } from "@/components/ui/FileDropCard";

// 제품 카탈로그 PDF 단일 업로더 — 공개 버킷 equipment-catalogs/equipment/{id}/catalog.pdf. 덮어쓰기(upsert).
// PDF 전용·20MB. 메일에 카탈로그 다운로드 링크로 쓰인다. UI는 공통 드롭존 카드로 통일.
const MAX = 20 * 1024 * 1024;

type Props = {
  equipmentId: string;
  value: string;
  onChange: (path: string) => void;
  onUploadingChange: (uploading: boolean) => void; // 폼 저장 가드
};

export function CatalogUploader({ equipmentId, value, onChange, onUploadingChange }: Props) {
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
    <div className="flex flex-col gap-1">
      <FileDropCard
        label="제품 카탈로그 (PDF)"
        accept="application/pdf"
        icon="📄"
        preview={value ? { kind: "file", name: "catalog.pdf" } : null}
        onPick={handle}
        onClear={() => onChange("")}
        busy={busy}
        hint="PDF · 최대 20MB · 견적 메일에 첨부"
      />
      {error && <span className="text-micro text-danger">{error}</span>}
    </div>
  );
}
