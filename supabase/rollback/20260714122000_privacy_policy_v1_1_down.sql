-- 20260714122000 롤백 — v1.1 전문 행 제거(v1.0은 이 마이그레이션이 건드리지 않았음).
-- ⚠️ 웹 PRIVACY_VERSION 상수를 v1.1로 범프한 코드가 배포돼 있으면 함께 되돌려야
-- 공개 폼 제출(RPC 버전 존재 검증)이 깨지지 않는다.
delete from public.privacy_policies where version = 'v1.1';
