"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryTreeNode } from "@/lib/equipment/category-tree";
import type { CategoryNode } from "@/lib/equipment/category-tree";
import {
  createCategory,
  renameCategory,
  deleteCategory,
} from "@/lib/categories/actions";

// action 결과 타입 — null이면 성공, { error } 이면 실패.
type ActionResult = { error: string } | null;

// 분류 트리 클라이언트 컴포넌트 — 대분류·소분류 추가·수정·삭제 인터랙션 처리.
export function CategoryTree({ tree }: { tree: CategoryTreeNode[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [newTop, setNewTop] = useState("");

  // 서버 액션 실행 후 성공이면 refresh, 실패면 에러 표시.
  function run(fn: () => Promise<ActionResult>) {
    setErr(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-4">
      {err ? <p className="text-small text-danger">{err}</p> : null}

      {/* 대분류 추가 입력행 */}
      <div className="flex gap-2">
        <input
          value={newTop}
          onChange={(e) => setNewTop(e.target.value)}
          placeholder="새 대분류명(예: 프린터)"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
        <button
          type="button"
          disabled={pending || !newTop.trim()}
          onClick={() => {
            const name = newTop;
            setNewTop("");
            run(() => createCategory(name, null));
          }}
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
        >
          + 대분류
        </button>
      </div>

      {/* 대분류 목록 */}
      <ul className="flex flex-col gap-3">
        {tree.map((top) => (
          <TopNode key={top.id} node={top} pending={pending} run={run} />
        ))}
      </ul>
    </div>
  );
}

// 대분류 한 항목 — 내부에 소분류 목록 + 소분류 추가 입력행.
function TopNode({
  node,
  pending,
  run,
}: {
  node: CategoryTreeNode;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  const [child, setChild] = useState("");

  return (
    <li className="rounded-md border border-border bg-surface p-3">
      {/* 대분류 행 */}
      <div className="flex items-center gap-2">
        <span className="font-medium text-text">{node.name}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const n = prompt("대분류 이름 변경", node.name);
            if (n) run(() => renameCategory(node.id, n));
          }}
          className="text-micro text-muted hover:text-text"
        >
          수정
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(`'${node.name}' 삭제?`)) run(() => deleteCategory(node.id));
          }}
          className="text-micro text-danger hover:underline"
        >
          삭제
        </button>
      </div>

      {/* 소분류 목록 + 추가 입력행 */}
      <ul className="mt-2 flex flex-col gap-1 pl-4">
        {node.children.map((c: CategoryNode) => (
          <li key={c.id} className="flex items-center gap-2 text-body text-text">
            <span>– {c.name}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const n = prompt("소분류 이름 변경", c.name);
                if (n) run(() => renameCategory(c.id, n));
              }}
              className="text-micro text-muted hover:text-text"
            >
              수정
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`'${c.name}' 삭제?`)) run(() => deleteCategory(c.id));
              }}
              className="text-micro text-danger hover:underline"
            >
              삭제
            </button>
          </li>
        ))}

        {/* 소분류 추가 입력행 */}
        <li className="flex gap-2 pt-1">
          <input
            value={child}
            onChange={(e) => setChild(e.target.value)}
            placeholder="새 소분류명"
            className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-small text-text"
          />
          <button
            type="button"
            disabled={pending || !child.trim()}
            onClick={() => {
              const name = child;
              setChild("");
              run(() => createCategory(name, node.id));
            }}
            className="text-small font-medium text-accent hover:underline"
          >
            + 소분류
          </button>
        </li>
      </ul>
    </li>
  );
}
