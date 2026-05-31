import { z } from "zod";
import { getPublicEquipment } from "@/lib/equipment/public-queries";
import { RequestForm } from "./_components/RequestForm";

// Next 16: searchParams는 Promise. 잘못된/inactive id면 preselection 없이 일반 문의로 동작.
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment?: string }>;
}) {
  const { equipment } = await searchParams;
  let equipmentId: string | undefined;
  let equipmentName: string | undefined;
  // UUID 형식이 아닌 ?equipment= 값이 getPublicEquipment에 넘어가면 22P02 예외 발생 → 에러 바운더리 루프 방지.
  if (equipment && z.string().uuid().safeParse(equipment).success) {
    const eq = await getPublicEquipment(equipment);
    if (eq) {
      equipmentId = eq.id;
      equipmentName = eq.name;
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-display font-semibold text-text">견적 요청</h1>
      <p className="mt-2 text-small text-muted">
        요청 주시면 담당자가 확인 후 연락드립니다.
      </p>
      <RequestForm equipmentId={equipmentId} equipmentName={equipmentName} />
    </main>
  );
}
