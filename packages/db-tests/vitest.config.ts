import { defineConfig } from "vitest/config";

// DB 통합 테스트는 단일 로컬 Postgres를 공유한다. 파일 병렬 실행 시 고정 UUID
// fixture가 동시 트랜잭션에서 PK 락 충돌을 일으키므로 파일을 직렬로 돌린다.
export default defineConfig({
  test: {
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
