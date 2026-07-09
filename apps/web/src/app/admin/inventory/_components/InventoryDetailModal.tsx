"use client";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  cancelSaleAction,
  listSaleLogAction,
  updateInventoryNoteAction,
} from "@/lib/inventory/actions";
import type { SaleLogEntry } from "@/lib/inventory/queries";

// 재고 상세 모달 — 전 항목 순서대로 표시 + 메모 편집 + 판매확정 로그(최근 2개월) + 관리자 취소.
// 작성 페이지(equipment.manage 전용)에서만 열리므로 취소 버튼은 항상 노출.

export interface InventoryModalData {
  equipmentId: string;
  name: string;
  model: string | null;
  stockQty: number;
  soldConfirmed: number;
  restockDate: string | null;
  usedQty: number;
  demoQty: number;
  note: string;
  updatedLabel: string;
}

function Row({ label, value, emphasis }: { label: string; value: React.ReactNode; emphasis?: "stock" | "sold" }) {
  const bg = emphasis === "stock" ? "#E7F5EF" : emphasis === "sold" ? "#FCF1DC" : undefined;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-row-line py-2 last:border-b-0" style={bg ? { backgroundColor: bg } : undefined}>
      <span className="shrink-0 px-1 text-small text-muted">{label}</span>
      <span className="px-1 text-right text-small font-medium text-text">{value}</span>
    </div>
  );
}

function fmtLogTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function InventoryDetailModal({
  data,
  onClose,
  onNoteSaved,
  onCanceled,
}: {
  data: InventoryModalData;
  onClose: () => void;
  onNoteSaved: (note: string) => void;
  onCanceled: () => void;
}) {
  const [note, setNote] = useState(data.note);
  const [logs, setLogs] = useState<SaleLogEntry[] | null>(null);
  const [pending, startTransition] = useTransition();

  // 로그 조회(최근 2개월). Esc 닫기.
  useEffect(() => {
    let cancelled = false;
    listSaleLogAction(data.equipmentId).then((res) => {
      if (cancelled) return;
      setLogs("entries" in res ? res.entries : []);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      document.removeEventListener("keydown", onKey);
    };
  }, [data.equipmentId, onClose]);

  function saveNote() {
    startTransition(async () => {
      const res = await updateInventoryNoteAction(data.equipmentId, note.trim() === "" ? null : note);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("메모 저장됨");
      onNoteSaved(note.trim());
    });
  }

  function cancelSale() {
    if (!confirm("판매확정 1건을 취소합니다. 판매확정 -1, 재고 +1 됩니다. 진행할까요?")) return;
    startTransition(async () => {
      const res = await cancelSaleAction(data.equipmentId);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("판매확정 1건이 취소되었습니다");
      onCanceled();
      // 로그 갱신
      const fresh = await listSaleLogAction(data.equipmentId);
      setLogs("entries" in fresh ? fresh.entries : []);
    });
  }

  const total = data.stockQty + data.soldConfirmed;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${data.name} 재고 상세`}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-card-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-h2 font-semibold text-text">{data.name}</p>
            {data.model && <p className="truncate font-mono text-small text-muted">{data.model}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 rounded-md px-2 py-1 text-muted hover:bg-surface-2 hover:text-text">
            ✕
          </button>
        </div>

        {/* 항목 순서: 상태 → 재고수량 → 판매확정 → 입고예정일 → 중고장비 → 데모장비 → 전체재고 → 최종수정 */}
        <div className="rounded-xl border border-border">
          <div className="px-3">
            <Row label="재고 수량" value={<span className="font-mono tabular-nums">{data.stockQty}</span>} emphasis="stock" />
            <Row label="판매확정" value={<span className="font-mono tabular-nums">{data.soldConfirmed}</span>} emphasis="sold" />
            <Row label="입고예정일" value={data.restockDate ?? "—"} />
            <Row label="중고장비" value={<span className="font-mono tabular-nums">{data.usedQty}</span>} />
            <Row label="데모장비" value={<span className="font-mono tabular-nums">{data.demoQty}</span>} />
            <Row label="전체재고(재고+판매확정)" value={<span className="font-mono tabular-nums">{total}</span>} />
            <Row label="최종수정" value={data.updatedLabel} />
          </div>
        </div>

        {/* 메모 편집 */}
        <div className="mt-4">
          <label className="mb-1 block text-small font-medium text-muted">메모</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="메모를 입력하세요"
            className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-small text-text"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={saveNote}
              disabled={pending}
              className="rounded-md bg-accent px-3 py-1.5 text-small font-medium text-white disabled:opacity-50"
            >
              메모 저장
            </button>
          </div>
        </div>

        {/* 판매확정 로그(최근 2개월) + 관리자 취소 */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-small font-medium text-muted">판매확정 기록 (최근 2개월)</span>
            <button
              type="button"
              onClick={cancelSale}
              disabled={pending || data.soldConfirmed <= 0}
              className="rounded-md border border-border px-2.5 py-1 text-small font-medium text-coral-text hover:bg-surface-2 disabled:opacity-40"
              title={data.soldConfirmed <= 0 ? "취소할 판매확정이 없습니다" : "판매확정 1건 취소(관리자)"}
            >
              판매확정 취소
            </button>
          </div>
          <div className="rounded-md border border-border">
            {logs === null ? (
              <p className="px-3 py-3 text-small text-muted">불러오는 중…</p>
            ) : logs.length === 0 ? (
              <p className="px-3 py-3 text-small text-muted">최근 2개월 기록이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-row-line">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-small">
                    <span className={l.action === "cancel" ? "font-medium text-coral-text" : "font-medium text-accent"}>
                      {l.action === "cancel" ? "취소" : "판매확정"}
                    </span>
                    <span className="text-text">{l.actorName ?? "—"}</span>
                    <span className="font-mono tabular-nums text-muted">{fmtLogTime(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
