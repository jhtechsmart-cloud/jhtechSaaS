// 폴링 루프 — index.ts(실서비스)와 테스트가 공유.
// 종료 신호(isStopping)가 오면 진행 중 잡만 마치고 멈춘다(Railway 재배포 시 잡 고아 방지).
export type RunLoopDeps = {
  runOnce: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  isStopping: () => boolean;
  pollMs: number;
  onError?: (e: unknown) => void;
};

export async function runLoop(deps: RunLoopDeps): Promise<void> {
  while (!deps.isStopping()) {
    let worked = false;
    try {
      worked = await deps.runOnce();
    } catch (e) {
      deps.onError?.(e);
    }
    // 처리할 잡이 없으면 잠깐 쉬고, 있으면 바로 다음 잡(버스트 소진). 종료 중엔 쉬지 않는다.
    if (!worked && !deps.isStopping()) await deps.sleep(deps.pollMs);
  }
}
