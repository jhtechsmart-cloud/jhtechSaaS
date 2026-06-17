import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveLandingPath } from "@/lib/auth/guard";
import { SAVED_EMAIL_COOKIE, parseSavedEmail } from "@/lib/auth/saved-email";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(await resolveLandingPath());

  // 저장해 둔 이메일을 서버에서 읽어 초기값으로 주입(서버·클라 일치 → hydration mismatch 방지).
  const savedEmail = parseSavedEmail((await cookies()).get(SAVED_EMAIL_COOKIE)?.value);
  return <LoginForm savedEmail={savedEmail} />;
}
