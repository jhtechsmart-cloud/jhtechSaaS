import { redirect } from "next/navigation";

// /admin 직접 진입 → 기본 화면. (admin/layout 가드를 거친다)
export default function AdminIndex() {
  redirect("/admin/equipment");
}
