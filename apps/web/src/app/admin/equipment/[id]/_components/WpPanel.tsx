"use client";
// 장비 상세 "홈페이지" 패널(#253) — 3축 상태 배지 + 상태별 버튼 매트릭스 + 구성 미리보기 + 잡 폴링.
// 공개 글 저장은 자동 반영되지 않으므로 '반영 대기' 보조 배지와 [홈페이지 갱신](primary)이 핵심 동선.
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { WpPrimaryStatus } from "@jhtechsaas/shared";
import { enqueueWpAction, getWpSnapshot, type WpSnapshot } from "@/lib/equipment/wp-actions";

const POLL_MS = 4000;

// 배지 톤 = DESIGN.md 3톤 체계(신규 색 0): 공개=민트+파인 / 중립=muted / 실패·매핑필요=코랄 / 반영대기=라임.
const BADGE: Record<WpPrimaryStatus, { label: string; cls: string }> = {
  not_linked: { label: "미연동", cls: "bg-surface-2 text-muted" },
  mapping_required: { label: "분류 매핑 필요", cls: "bg-danger/10 text-danger" },
  pending_create: { label: "동기화 대기", cls: "bg-surface-2 text-muted" },
  syncing: { label: "동기화 중", cls: "bg-surface-2 text-muted" },
  failed: { label: "실패", cls: "bg-danger/10 text-danger" },
  manual_edit: { label: "수동 편집됨", cls: "bg-danger/10 text-danger" },
  draft: { label: "초안", cls: "bg-surface-2 text-muted" },
  published: { label: "공개", cls: "bg-active/10 text-active" },
};

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

// 상대시간은 마운트 후에만 렌더 — SSR 시각과 클라 시각이 어긋나면 hydration 텍스트 불일치.
// setState-in-effect 금지 규칙 준수: useSyncExternalStore 서버/클라 스냅샷 분기(표준 hydration 감지).
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function WpPanel({
  equipmentId,
  initial,
  previewHtml,
  publicSiteUrl,
  canManage,
  canForce,
  equipmentInactive,
}: {
  equipmentId: string;
  initial: WpSnapshot;
  previewHtml: string;
  publicSiteUrl: string; // 예: http(s)://jhtech.co.kr — 글 링크 조립용
  canManage: boolean;
  // #262 [그래도 덮어쓰기] 노출 여부 — RPC가 users.manage를 서버에서 재강제, UI는 노출 제어만.
  canForce: boolean;
  // 비활성 장비는 트리거가 자동 sync를 건너뛰고 워커도 조용히 스킵 — 안내 없이는 '동기화 대기' 고착으로 보인다.
  equipmentInactive: boolean;
}) {
  const [snap, setSnap] = useState<WpSnapshot>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useMounted();

  const syncing = snap.status.primary === "syncing";

  // 잡 진행 중에만 폴링(패널이 떠 있는 동안) — 견적 PDF 폴링 패턴.
  useEffect(() => {
    if (!syncing) return;
    pollRef.current = setInterval(() => {
      void getWpSnapshot(equipmentId).then((s) => {
        if (!("error" in s)) setSnap(s);
      });
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [syncing, equipmentId]);

  function run(action: "publish" | "refresh" | "sync" | "force_sync") {
    setErr(null);
    startTransition(async () => {
      const r = await enqueueWpAction(equipmentId, action);
      if (r?.error) {
        setErr(r.error);
        return;
      }
      const s = await getWpSnapshot(equipmentId);
      if (!("error" in s)) setSnap(s);
    });
  }

  const primary = snap.status.primary;
  const postLink = snap.postId ? `${publicSiteUrl}/?p=${snap.postId}` : null;
  const disabled = pending || syncing;

  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-small font-semibold text-muted">홈페이지</h2>
        <span className={`rounded-sm px-2 py-0.5 text-micro font-medium ${BADGE[primary].cls}`}>
          {syncing ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-muted border-t-transparent" />
              {BADGE[primary].label}
            </span>
          ) : (
            BADGE[primary].label
          )}
        </span>
        {snap.status.pendingRefresh && !syncing ? (
          <span className="rounded-sm bg-lime/30 px-2 py-0.5 text-micro font-medium text-text">
            반영 대기
          </span>
        ) : null}
        {snap.syncedAt && mounted ? (
          <span className="ml-auto font-mono text-micro tabular-nums text-muted">
            마지막 반영: {relativeTime(snap.syncedAt)}
          </span>
        ) : null}
      </div>

      {snap.status.error && primary !== "manual_edit" ? (
        <p role="alert" className="mt-2 rounded-sm bg-danger/5 px-3 py-2 text-small text-danger">
          {snap.status.error}
        </p>
      ) : null}
      {primary === "manual_edit" ? (
        <p role="alert" className="mt-2 rounded-sm bg-danger/5 px-3 py-2 text-small text-danger">
          홈페이지에서 직접 수정된 글입니다 — 덮어쓰기를 막기 위해 자동 반영·[홈페이지 갱신]이
          차단됩니다. 이후 홈페이지에서 직접 관리하거나, 관리자가 [그래도 덮어쓰기]로 SaaS 내용으로
          되돌릴 수 있습니다.
        </p>
      ) : null}
      {err ? (
        <p role="alert" className="mt-2 text-small text-danger">
          {err}
        </p>
      ) : null}

      {primary === "not_linked" ? (
        <p className="mt-2 text-small text-muted">
          장비 수정 화면에서 &lsquo;홈페이지에 등록&rsquo;을 체크하면 여기서 발행을 진행할 수 있습니다.
        </p>
      ) : null}
      {primary === "mapping_required" ? (
        <p className="mt-2 text-small text-muted">
          이 장비 분류에 WP 카테고리가 설정돼 있지 않습니다.{" "}
          <a href="/admin/categories" className="text-accent underline">
            분류 설정으로 이동
          </a>
        </p>
      ) : null}
      {equipmentInactive && primary !== "not_linked" && primary !== "mapping_required" ? (
        <p className="mt-2 rounded-sm bg-danger/5 px-3 py-2 text-small text-danger">
          비활성 장비는 홈페이지에 등록되지 않습니다. 장비 상태를 &lsquo;판매중&rsquo;으로 변경해
          저장하면 자동으로 초안이 동기화됩니다.
        </p>
      ) : null}
      {primary === "pending_create" && !equipmentInactive ? (
        <p className="mt-2 text-small text-muted">
          장비를 저장하면 홈페이지 초안이 자동 생성됩니다. 지금 만들려면 [초안 동기화]를 누르세요.
        </p>
      ) : null}

      {canManage && primary !== "not_linked" && primary !== "mapping_required" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen((v) => !v)}
            className="rounded-full border border-border px-3.5 py-1.5 text-small font-medium text-text hover:bg-surface-2"
          >
            {previewOpen ? "미리보기 닫기" : "구성 미리보기"}
          </button>
          {!equipmentInactive && (primary === "pending_create" || primary === "failed") ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => run("sync")}
              className="rounded-full border border-border px-3.5 py-1.5 text-small font-medium text-text hover:bg-surface-2 disabled:opacity-50"
            >
              {primary === "failed" ? "다시 시도" : "초안 동기화"}
            </button>
          ) : null}
          {primary === "draft" && !equipmentInactive ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => run("publish")}
              className="rounded-full bg-accent px-3.5 py-1.5 text-small font-medium text-white disabled:opacity-50"
            >
              홈페이지 발행
            </button>
          ) : null}
          {primary === "manual_edit" && canForce && !equipmentInactive ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                // eslint-disable-next-line no-alert -- 파괴적 확인(홈페이지 수동 편집분 소실) — 장비 삭제와 동일 패턴
                if (window.confirm("홈페이지에서 직접 수정한 내용이 SaaS 내용으로 덮어써집니다. 계속할까요?"))
                  run("force_sync");
              }}
              className="rounded-full border border-danger/40 px-3.5 py-1.5 text-small font-medium text-danger hover:bg-danger/5 disabled:opacity-50"
            >
              그래도 덮어쓰기
            </button>
          ) : null}
          {primary === "published" && snap.status.pendingRefresh && !equipmentInactive ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => run("refresh")}
              className="rounded-full bg-accent px-3.5 py-1.5 text-small font-medium text-white disabled:opacity-50"
            >
              홈페이지 갱신
            </button>
          ) : null}
          {postLink && (primary === "published" || primary === "draft" || primary === "manual_edit") ? (
            <a
              href={postLink}
              target="_blank"
              rel="noreferrer"
              className="text-small font-medium text-accent hover:underline"
            >
              홈페이지 글 보기 ↗
            </a>
          ) : null}
        </div>
      ) : null}

      {primary === "published" ? (
        <p className="mt-2 text-micro text-muted">
          발행·갱신 후 홈페이지 목록 반영에 몇 분 걸릴 수 있습니다.
        </p>
      ) : null}

      {previewOpen ? (
        <div className="mt-3">
          <p className="mb-1 text-micro text-muted">
            구성 미리보기 — 내용(텍스트·사진·사양) 확인용입니다. 실제 디자인은 홈페이지 템플릿로
            적용됩니다.
          </p>
          {/* sandbox iframe(srcdoc) 격리 — SaaS CSS 오염·스크립트 실행 이중 차단 */}
          <iframe
            sandbox=""
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;max-width:720px;margin:16px auto;padding:0 12px;color:#1a1a1a}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:14px}iframe{width:100%;aspect-ratio:16/9;border:0}ul{padding-left:20px}</style></head><body>${previewHtml}</body></html>`}
            title="홈페이지 글 구성 미리보기"
            className="h-[480px] w-full rounded-md border border-border bg-white"
          />
        </div>
      ) : null}
    </div>
  );
}
