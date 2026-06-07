import { z } from "zod";

// 견적 status enum 검증 — "use server" 파일은 async 함수만 export 가능하므로 분리.
// application-status.tsx의 APPLICATION_STATUSES와 동일 5상태(견적발송 포함).
export const applicationStatusSchema = z.enum(["new", "assigned", "quoted", "quote_sent", "closed"]);
