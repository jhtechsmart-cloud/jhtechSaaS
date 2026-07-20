"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// 고객 서명 캔버스 — 터치/마우스, DPR 보정, 유효 스트로크(경로 길이 ≥100px) 판정.
// 회전/리사이즈 시 캔버스가 리셋되므로 안내 후 재서명(autoplan F-A2).
export function SignaturePad({
  onChange,
}: {
  // 유효 서명이면 PNG Blob, 지우면 null.
  onChange: (blob: Blob | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawing = useRef(false);
  const pathLength = useRef(0);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasValidStroke, setHasValidStroke] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [resetNote, setResetNote] = useState(false);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0F4439";
    ctxRef.current = ctx;
    pathLength.current = 0;
    lastPoint.current = null;
    setHasValidStroke(false);
    setEmpty(true);
    onChange(null);
  }, [onChange]);

  useEffect(() => {
    setup();
    // 폭이 바뀌는 리사이즈(회전)만 캔버스 리셋(비트맵 왜곡 방지) — 서명 유실 안내 노출.
    // 모바일 스크롤로 주소창이 접히면 높이만 변한 resize가 오는데, 이때 리셋하면 서명이 지워진다.
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width === Math.round(canvas.clientWidth * dpr)) return;
      setup();
      setResetNote(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  function pos(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function emitIfValid() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (pathLength.current >= 100) {
      setHasValidStroke(true);
      canvas.toBlob((blob) => onChange(blob), "image/png");
    } else {
      setHasValidStroke(false);
      onChange(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-md border-2 border-border bg-white">
        <canvas
          ref={canvasRef}
          aria-label="고객 서명 입력"
          className="block h-52 w-full touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const p = pos(e);
            lastPoint.current = p;
            ctxRef.current?.beginPath();
            ctxRef.current?.moveTo(p.x, p.y);
            setEmpty(false);
            setResetNote(false);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !ctxRef.current) return;
            const p = pos(e);
            const lp = lastPoint.current;
            if (lp) pathLength.current += Math.hypot(p.x - lp.x, p.y - lp.y);
            lastPoint.current = p;
            ctxRef.current.lineTo(p.x, p.y);
            ctxRef.current.stroke();
          }}
          onPointerUp={() => {
            drawing.current = false;
            emitIfValid();
          }}
          onPointerCancel={() => {
            drawing.current = false;
            emitIfValid();
          }}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-body text-faint">
            여기에 서명해 주세요
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-small text-muted">
          {resetNote
            ? "화면이 회전되어 서명이 지워졌습니다 — 다시 서명해 주세요"
            : hasValidStroke
              ? "서명이 입력되었습니다"
              : empty
                ? ""
                : "서명이 너무 짧습니다 — 이어서 서명해 주세요"}
        </span>
        <button
          type="button"
          onClick={setup}
          className="min-h-11 px-2 text-small text-muted underline"
        >
          다시 서명
        </button>
      </div>
    </div>
  );
}
