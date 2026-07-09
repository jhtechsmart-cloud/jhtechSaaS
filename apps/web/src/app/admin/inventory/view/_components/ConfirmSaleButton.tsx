"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmSaleAction } from "@/lib/inventory/actions";

// 읽기전용 재고 뷰의 [판매확정] 버튼(장비별) — 콘솔 사용자 전원.
// 누르면 재고 -1·판매확정 +1(서버 RPC). 재고 0이면 비활성. 성공 시 새로고침으로 반영.
export function ConfirmSaleButton({
  equipmentId,
  name,
  stockQty,
}: {
  equipmentId: string;
  name: string;
  stockQty: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!window.confirm(`${name} 1대를 판매확정 처리합니다. 재고 -1, 판매확정 +1 됩니다. 진행할까요?`)) return;
    startTransition(async () => {
      const res = await confirmSaleAction(equipmentId);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${name} 판매확정 처리됨`);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={confirm}
      disabled={pending || stockQty <= 0}
      title={stockQty <= 0 ? "재고가 없습니다" : "판매확정(재고 -1)"}
      className="whitespace-nowrap rounded-md bg-accent px-3 py-1 text-small font-medium text-white disabled:opacity-40"
    >
      {pending ? "처리중…" : "판매확정"}
    </button>
  );
}
