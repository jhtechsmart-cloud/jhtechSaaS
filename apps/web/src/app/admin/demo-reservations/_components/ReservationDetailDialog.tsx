"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DemoReservationRow } from "@/lib/demo-reservations/queries";
import { cancelDemoReservation } from "@/lib/demo-reservations/actions";

// 예약 상세 + 취소 — 경량 오버레이(shadcn dialog 미도입, 테마 카드 재사용).
// 취소는 비가역 안내 후 status='canceled' (행 삭제 아님 — 이력 보존).

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="shrink-0 text-small text-muted">{label}</span>
      {value ? (
        <span className="text-right text-small text-text">{value}</span>
      ) : (
        <span className="text-right text-small text-empty">미입력</span>
      )}
    </div>
  );
}

export function ReservationDetailDialog({
  reservation: r,
  canWrite,
  onClose,
}: {
  reservation: DemoReservationRow;
  canWrite: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelDemoReservation(r.id);
      if (result.status === "ok") {
        toast.success("예약이 취소되었습니다");
        onClose();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="예약 상세"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-card-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-h2 font-semibold text-text">
              {r.equipmentNames.join(", ") || "장비"} 데모
            </p>
            <p className="mt-0.5 text-small text-muted tabular-nums">
              {r.date} · {r.start}–{r.end} ({r.durationMin}분)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full p-1 text-muted hover:bg-surface-2"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 divide-y divide-row-line border-y border-row-line">
          <Row label="고객" value={r.customerName} />
          <Row label="방문자" value={r.visitorName} />
          <Row label="연락처" value={r.visitorPhone} />
          <Row label="담당자" value={r.assigneeName} />
          <Row label="등록자" value={r.createdByName} />
          <Row label="메모" value={r.memo} />
        </div>

        {canWrite && (
          <div className="mt-5 flex justify-end gap-2">
            {confirming ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                  돌아가기
                </Button>
                <Button variant="destructive" size="sm" onClick={cancel} disabled={pending}>
                  {pending ? "취소 중…" : "취소 확정"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/admin/demo-reservations/${r.id}/edit`)}
                >
                  수정
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
                  예약 취소
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
