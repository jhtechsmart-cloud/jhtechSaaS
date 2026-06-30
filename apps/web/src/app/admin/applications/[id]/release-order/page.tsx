import Link from "next/link";
import { requireReleaseOrdersWrite } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";
import { loadReleaseOrderForForm } from "@/lib/release-orders/queries";
import { kstDateOf, kstHmOf } from "@/lib/format/kst";
import { ReleaseOrderForm } from "../_components/ReleaseOrderForm";

// 장비출고의뢰서 작성 — release_orders.write 가드 + 프리필 적재 후 폼 렌더.
export default async function ReleaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireReleaseOrdersWrite();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">출고의뢰서 작성 권한(release_orders.write)이 필요합니다.</p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const data = await loadReleaseOrderForForm(id);
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">의뢰를 찾을 수 없습니다.</p>
        <Link href="/admin/applications" className="text-small text-accent">← 목록으로</Link>
      </div>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-[1000px] flex-col gap-4">
      <Link href={`/admin/applications/${id}`} className="text-small text-muted hover:text-text">
        ← 의뢰로
      </Link>
      <h1 className="text-h1 font-semibold text-text">장비출고의뢰서 — {data.company}</h1>
      <ReleaseOrderForm
        applicationId={id}
        initial={{
          company: data.company,
          deviceName: data.deviceName,
          contactPhone: data.contactPhone,
          installAddress: data.installAddress,
          // install_at(KST ISO) → 날짜·시각 입력 초기값. 미정이면 빈칸.
          installDate: data.installAt ? (kstDateOf(data.installAt) ?? "") : "",
          installTime: data.installAt ? (kstHmOf(data.installAt) ?? "") : "",
        }}
        hasIssuedQuote={data.hasIssuedQuote}
        initialDeviceKind={data.deviceKind}
        initialDetails={data.details}
        releaseOrder={data.releaseOrder}
        pdfReady={data.pdfReady}
        versions={data.versions}
      />
    </section>
  );
}
