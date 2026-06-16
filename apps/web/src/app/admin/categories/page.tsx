import { requireEquipmentManage } from "@/lib/auth/guard";
import { listCategoryTree } from "@/lib/equipment/queries";
import { buildTree } from "@/lib/equipment/category-tree";
import { CategoryTree } from "./_components/CategoryTree";
import { signOut } from "@/app/login/actions";

// 분류 관리 페이지 — 대분류·소분류 CRUD.
export default async function CategoriesPage() {
  const access = await requireEquipmentManage();

  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          장비 관리 권한(equipment.manage)이 필요합니다.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const tree = buildTree(await listCategoryTree());

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-h1 font-semibold text-text">장비 분류</h1>
      <p className="text-small text-muted">
        대분류(프린터·커팅기) 아래 소분류를 둡니다. 소모품 범위·장비 등록이 이 분류를 씁니다.
        대분류의 &lsquo;견적 로고&rsquo;를 정하면 그 종류 장비의 견적서 좌상단 로고가 자동으로 바뀝니다.
      </p>
      <CategoryTree tree={tree} />
    </section>
  );
}
