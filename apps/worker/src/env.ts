import { z } from "zod";

// 워커 환경변수 검증. 호출 시점(런타임)에 parse — import 시점 아님.
// 존재 검증(min(1))만 — 포맷 강화는 기능 단계에서.
const envSchema = z.object({
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // 메일(E6) 전용 — PDF 워커엔 불필요하므로 optional. E6에서 필수화.
  GMAIL_USER: z.string().min(1).optional(),
  GMAIL_APP_PASSWORD: z.string().min(1).optional(),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadEnv(): WorkerEnv {
  return envSchema.parse(process.env);
}
