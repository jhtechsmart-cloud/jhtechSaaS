"use client";
import { useRef, useState, type ReactNode } from "react";

// 사진/파일 첨부 공통 UI 셸 — 점선 드롭존 카드. 업로드·검증 로직은 부모가 담당하고,
// 이 컴포넌트는 "고르기 UX"(클릭·드래그앤드롭·미리보기·삭제)만 책임진다.
export type FileDropPreview =
  | { kind: "image"; url: string }
  | { kind: "file"; name: string }
  | null;

export type FileDropCardProps = {
  label: string; // 슬롯/필드 이름(카드 캡션·접근명)
  accept: string; // input accept (이미지 MIME 또는 application/pdf)
  capture?: "environment"; // 모바일 카메라 직행(AS 증상사진)
  preview: FileDropPreview; // null = 빈 상태
  onPick: (file: File) => void; // 파일 선택/드롭 시(부모가 검증·업로드)
  onClear?: () => void; // 있으면 삭제 버튼 표시
  busy?: boolean; // 업로드 중(입력 차단)
  disabled?: boolean;
  hint?: string; // 형식/크기 안내
  icon?: ReactNode; // 빈 상태 아이콘(기본 📷)
};

export function FileDropCard({
  label,
  accept,
  capture,
  preview,
  onPick,
  onClear,
  busy = false,
  disabled = false,
  hint,
  icon,
}: FileDropCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const interactive = !busy && !disabled;

  function trigger() {
    if (interactive) inputRef.current?.click();
  }
  function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (f) onPick(f);
    if (inputRef.current) inputRef.current.value = ""; // 같은 파일 재선택 허용
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-small font-medium text-muted">{label}</span>
      <div
        role="button"
        tabIndex={interactive ? 0 : -1}
        aria-label={`${label} 첨부`}
        onClick={trigger}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            trigger();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (interactive) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (interactive) handleFiles(e.dataTransfer.files);
        }}
        className={`relative flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-dashed p-2 text-center transition ${
          preview?.kind === "image" ? "h-28" : "h-16"
        } ${dragOver ? "border-accent bg-accent-soft" : "border-border bg-surface-2"} ${
          interactive ? "cursor-pointer" : "pointer-events-none opacity-60"
        }`}
      >
        {preview?.kind === "image" ? (
          // object-contain: 사진을 잘라내지 않고 박스 안에 전부 보이게(letterbox).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt={label} className="absolute inset-0 h-full w-full object-contain" />
        ) : preview?.kind === "file" ? (
          // PDF는 파일명만 — 작은 한 줄 박스로 충분.
          <>
            <span className="text-base" aria-hidden>
              📄
            </span>
            <span className="max-w-full truncate text-small text-text">{preview.name}</span>
          </>
        ) : (
          <>
            <span className="text-base" aria-hidden>
              {icon ?? "📷"}
            </span>
            <span className="text-micro text-muted">클릭 · 끌어다 놓기</span>
            {hint ? <span className="text-micro text-muted">{hint}</span> : null}
          </>
        )}

        {preview && onClear ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            aria-label={`${label} 삭제`}
            className="absolute right-1 top-1 z-10 rounded-full bg-surface/90 px-1.5 py-0.5 text-small text-danger shadow-sm"
          >
            ✕
          </button>
        ) : null}

        {busy ? <span className="absolute inset-x-0 bottom-1 text-micro text-muted">업로드 중…</span> : null}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          capture={capture}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
}
