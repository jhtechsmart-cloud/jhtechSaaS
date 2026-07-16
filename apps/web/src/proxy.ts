import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/env";
import { resolveHostRedirect } from "@/lib/routing/host-routing";

// Next 16: 구 middleware. 매 요청 세션 쿠키를 갱신하고, 미인증 /admin/* 접근을 /login으로.
// 권한(equipment.manage) 검증은 여기서 하지 않는다(layout·action이 DB로 강제).
export async function proxy(request: NextRequest) {
  // 서브도메인 분기 — admin.jhtech.co.kr 루트(/) 진입 시 관리자 콘솔(/admin)로.
  // 이후 /admin이 미인증=로그인·인증=대시보드로 분기한다. sales(공개 포털)는 통과.
  const hostRedirect = resolveHostRedirect(request.headers.get("host"), request.nextUrl.pathname);
  if (hostRedirect) {
    const url = request.nextUrl.clone();
    url.pathname = hostRedirect;
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();

  const supabase = createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // 현장 콘솔(/field)은 로그인 후 원래 화면으로 복귀(next) — 현장 작성 중 세션 만료 대비.
  if (!user && request.nextUrl.pathname.startsWith("/field")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?next=" + encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // 세션 갱신 응답은 Set-Cookie를 실으므로 CDN/엣지(Vercel)에서 캐시되면 안 됨.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // 정적 자산·이미지·favicon 제외, 나머지 전 경로에서 세션 갱신.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
