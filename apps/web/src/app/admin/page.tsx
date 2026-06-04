import { redirect } from "next/navigation";
import { resolveLandingPath } from "@/lib/auth/guard";

// /admin 직접 진입 → 권한 기반 첫 화면(role-aware). admin/layout 가드를 거친다.
export default async function AdminIndex() {
  redirect(await resolveLandingPath());
}
