import { z } from "zod";

// 워커 환경변수 검증. 호출 시점(런타임)에 parse — import 시점 아님.
// 존재 검증(min(1))만 — 포맷 강화는 기능 단계에서.
const envSchema = z.object({
  SUPABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // 하이웍스 메일 발송(E6) 오피스 토큰. optional — 미설정 시 FakeMailSender(로컬/미발송).
  // 프로덕션은 Railway env에 주입 + 하이웍스 허용 IP에 워커 고정 IP 등록 필요.
  HIWORKS_OFFICE_TOKEN: z.string().min(1).optional(),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadEnv(): WorkerEnv {
  return envSchema.parse(process.env);
}
