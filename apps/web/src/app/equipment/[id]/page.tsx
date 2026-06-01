import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPublicEquipment } from "@/lib/equipment/public-queries";
import { buildEquipmentMetadata } from "@/lib/seo/equipment-meta";
import { siteUrl } from "@/lib/seo/site";
import { getPublicEnv } from "@/env";
import { PublicGallery } from "./_components/PublicGallery";
import { SpecTable } from "./_components/SpecTable";
import { YoutubeEmbed } from "./_components/YoutubeEmbed";

// Next 16: params는 Promise.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  // UUID 형식이 아니면 DB 조회 없이 404 메타 반환(PostgREST 22P02 예외 방지).
  if (!z.string().uuid().safeParse(id).success) return { title: "장비를 찾을 수 없습니다" };
  const eq = await getPublicEquipment(id);
  if (!eq) return { title: "장비를 찾을 수 없습니다" };
  return buildEquipmentMetadata(eq, siteUrl(), getPublicEnv().NEXT_PUBLIC_SUPABASE_URL);
}

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // UUID 형식이 아니면 DB 조회 없이 404(PostgREST 22P02 예외 → 500 방지).
  if (!z.string().uuid().safeParse(id).success) notFound();
  const eq = await getPublicEquipment(id);
  if (!eq) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <Link href="/equipment" className="mb-6 inline-block text-small text-muted hover:text-text">
        ← 카탈로그로
      </Link>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <PublicGallery photos={eq.photos} name={eq.name} />
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-display font-semibold text-text">{eq.name}</h1>
            {eq.model && <span className="font-mono text-body text-muted">{eq.model}</span>}
            {eq.category && <span className="text-small text-muted">{eq.category}</span>}
          </header>
          <section className="flex flex-col gap-3">
            <h2 className="text-h2 font-medium text-text">사양</h2>
            <SpecTable specs={eq.specs} />
          </section>
          {/* P2에서 /request?equipment=[id] 폼으로 배선(머지 시 P2 동시 존재). */}
          <Link
            href={`/request?equipment=${eq.id}`}
            className="inline-flex w-fit items-center justify-center rounded-md bg-accent px-6 py-3 text-body font-medium text-white"
          >
            이 장비로 견적 요청
          </Link>
        </div>
      </div>
      {eq.youtube_urls.length > 0 && (
        <section className="mt-10 flex flex-col gap-3">
          <h2 className="text-h2 font-medium text-text">제품 영상</h2>
          <div className="flex flex-col gap-6">
            {eq.youtube_urls.map((url, i) => (
              <YoutubeEmbed key={i} url={url} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
