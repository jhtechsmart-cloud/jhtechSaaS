import { HomeNav } from "./_components/HomeNav";

// 공개 홈 — 3분기 진입(견적요청·A/S·소모품). 견적요청만 활성(M2 P-A).
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-display font-semibold text-text">(주)재현테크</h1>
        <p className="max-w-md text-body text-muted">포장·자동화 장비 견적·유지보수를 온라인으로.</p>
      </div>
      <HomeNav />
    </main>
  );
}
