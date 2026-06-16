import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 통합 테스트(runner.integration·email.integration)가 공유 jobs 큐를 만지고
    // runOnce는 전역에서 가장 오래된 잡을 claim하므로, 파일 병렬 실행 시 서로의 잡을
    // 가로챈다 → 파일 병렬 금지(파일 내 테스트는 순차 그대로). 단위 테스트엔 영향 없음.
    fileParallelism: false,
  },
});
