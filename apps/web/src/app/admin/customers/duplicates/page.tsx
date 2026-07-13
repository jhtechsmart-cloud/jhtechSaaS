import Link from "next/link";
import { formatBizNo } from "@jhtechsaas/shared";
import { requireCustomersViewAll } from "@/lib/auth/guard";
import { getDuplicateGroups, type DupGroup } from "@/lib/customers/duplicates";
import { signOut } from "@/app/login/actions";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const KIND_LABEL: Record<DupGroup["kind"], string> = {
  biz_no: "사업자번호 중복",
  name: "회사명 중복(공백·대소문자 무시)",
  no_biz: "사업자번호 없음",
};

const KIND_VARIANT: Record<DupGroup["kind"], "destructive" | "secondary" | "outline"> = {
  biz_no: "destructive",
  name: "secondary",
  no_biz: "outline",
};

// 기존 중복 의심 고객 리포트(읽기 전용) — 사업자번호 동일군 · 회사명 정규화 동일군 · 사업자번호
// 공란군을 눈으로 보고 운영자가 각 상세 화면에서 수동 정리하도록 안내. 병합 기능은 범위 밖.
// 전 고객이 대상이라 customers.view_all 권한 필요(목록/상세의 customers.edit과 다름).
export default async function CustomerDuplicatesPage() {
  const access = await requireCustomersViewAll();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          전체 고객 조회 권한(customers.view_all)이 필요합니다. 관리자에게 문의하세요.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const groups = await getDuplicateGroups();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold text-text">중복 의심 고객</h1>
          <p className="mt-0.5 text-small text-muted">
            사업자번호·회사명이 겹치는 고객을 모아봅니다 (읽기 전용 — 정리는 각 상세에서 직접)
          </p>
        </div>
        <Link href="/admin/customers" className={buttonVariants({ variant: "outline" })}>
          ← 고객 목록
        </Link>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-small text-muted">
          중복 의심 고객이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <div key={`${g.kind}-${g.key}`} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={KIND_VARIANT[g.kind]}>{KIND_LABEL[g.kind]}</Badge>
                {g.kind === "biz_no" && (
                  <span className="font-mono text-small tabular-nums text-muted">{formatBizNo(g.key)}</span>
                )}
                {g.kind === "name" && (
                  <span className="text-small text-muted">정규화 키: {g.key}</span>
                )}
                <span className="text-micro text-muted">{g.companies.length}건</span>
              </div>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>회사명</TableHead>
                      <TableHead>사업자번호</TableHead>
                      <TableHead>대표자</TableHead>
                      <TableHead className="w-16">&nbsp;</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.companies.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-body text-text">{c.name}</TableCell>
                        <TableCell className="font-mono text-small tabular-nums text-text">
                          {c.biz_no ? formatBizNo(c.biz_no) : <span className="text-muted/60">—</span>}
                        </TableCell>
                        <TableCell className="text-body text-text">
                          {c.ceo ?? <span className="text-muted/60">—</span>}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/customers/${c.id}`}
                            className="text-small text-accent hover:underline"
                          >
                            열기
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
