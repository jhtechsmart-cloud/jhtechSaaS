"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDropCard, type FileDropPreview } from "@/components/ui/FileDropCard";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { setUserApprovalStamp, clearUserApprovalStamp } from "@/lib/users/actions";

const MAX_BYTES = 2 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// #285 결재 직인·서명 이미지(관리자 등록) — approval-stamps/<대상 uid>/stamp-<ts>.<ext>(버전 파일명, 승인본 불변).
// 클라(관리자 세션·RLS users.manage)로 업로드 → setUserApprovalStamp가 포인터 저장(경로 접두=uid 서버 재검증).
// D-B12: PNG 투명 배경 권장·3:2~1:1·최소 300px·2MB. 교체·삭제해도 이미 승인된 문서는 바뀌지 않는다.
export function StampUpload({
  userId,
  initialUrl,
  needsStamp,
}: {
  userId: string;
  initialUrl: string | null; // 서명 URL(10분) — 서버가 admin 클라로 생성
  needsStamp: boolean; // service_reports.approve 보유 → 안내 강조
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<FileDropPreview>(initialUrl ? { kind: "image", url: initialUrl } : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPick(file: File) {
    setError(null);
    const ext = EXT[file.type];
    if (!ext) return setError("PNG·JPG·WEBP 이미지만 올릴 수 있습니다.");
    if (file.size > MAX_BYTES) return setError("이미지 크기는 2MB 이하여야 합니다.");
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const path = `${userId}/stamp-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("approval-stamps").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) return setError(`업로드에 실패했습니다: ${up.error.message}`);
      const res = await setUserApprovalStamp(userId, path);
      if ("error" in res) return setError(res.error);
      setPreview({ kind: "image", url: URL.createObjectURL(file) });
      router.refresh();
    });
  }

  function onClear() {
    setError(null);
    startTransition(async () => {
      const res = await clearUserApprovalStamp(userId);
      if ("error" in res) return setError(res.error);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4" data-testid="stamp-upload">
      <span className="text-body font-semibold text-text">결재 직인·서명 이미지</span>
      <span className="text-micro text-muted">
        서비스 리포트 승인 시 PDF 결재 박스(본부장 칸)에 찍힙니다. PNG 투명 배경 권장, 가로세로 3:2~1:1, 최소 300px, 2MB 이하.
        교체·삭제해도 이미 승인된 문서는 바뀌지 않습니다(승인 시점 파일을 그대로 참조).
      </span>
      {needsStamp && !preview && (
        <p className="rounded-md bg-coral-soft px-3 py-2 text-small font-medium text-coral-text">
          승인 권한자는 직인이 필요합니다 — 등록 전에는 승인 버튼이 비활성입니다.
        </p>
      )}
      <div className="max-w-xs">
        <FileDropCard
          label="직인 이미지"
          accept="image/png,image/jpeg,image/webp"
          preview={preview}
          onPick={onPick}
          onClear={preview ? onClear : undefined}
          busy={pending}
          hint="PNG/JPG/WEBP · 2MB"
        />
      </div>
      {error && <p className="text-small text-danger">{error}</p>}
    </div>
  );
}
