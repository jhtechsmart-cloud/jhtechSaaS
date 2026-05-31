import { CatalogButton } from "./_components/CatalogButton";

// 공개 홈 — 미니멀(회사 한 줄 + 카탈로그 CTA). 정식 랜딩은 후속 이슈.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <h1 className="text-display font-semibold text-text">(주)재현테크</h1>
      <p className="max-w-md text-body text-muted">
        포장·자동화 장비 견적을 온라인으로 간편하게 요청하세요.
      </p>
      <CatalogButton />
    </main>
  );
}
