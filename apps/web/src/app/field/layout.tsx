import type { ReactNode } from "react";
import Link from "next/link";
import { requireServiceReportsWrite } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";

// 현장 콘솔(as.jhtech.co.kr → /field) 셸 — admin 사이드바 없이 모바일 전용(430px 중앙).
// 미인증은 proxy가 /login?next=로 보냄. 권한 없는 로그인 계정은 안내 화면(fail-closed).
export default async function FieldLayout({ children }: { children: ReactNode }) {
  const guard = await requireServiceReportsWrite();
  if (guard.status !== "ok") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-h2 font-semibold text-text">접근 권한이 없습니다</h1>
        <p className="text-body text-muted">
          현장 서비스 리포트는 <span className="font-mono text-small">service_reports.write</span>{" "}
          권한이 있는 계정만 사용할 수 있습니다. 관리자에게 권한을 요청해 주세요.
        </p>
        <form action={signOut}>
          <button className="rounded-full border border-border bg-surface px-5 py-2 text-body text-text">
            다른 계정으로 로그인
          </button>
        </form>
      </main>
    );
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-bg shadow-[0_0_40px_rgba(23,100,85,0.10)]">
      <header className="sticky top-0 z-20 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/field" className="text-body font-extrabold tracking-tight text-text">
            재현테크 <span className="text-accent">서비스 리포트</span>
          </Link>
          <form action={signOut}>
            <button className="text-small text-muted underline">로그아웃</button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
