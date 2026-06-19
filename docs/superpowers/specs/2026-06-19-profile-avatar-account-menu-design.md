# 설계 스펙 — 프로필 사진 · 계정 메뉴 팝오버 · 사이드바 고정

- **작성일:** 2026-06-19
- **한 문장:** 사용자가 계정 설정에서 프로필 사진을 올리면 우상단·사이드바·계정 팝오버에 반영되고, 사이드바는 항상 화면에 고정된다.

## Part 1 — 프로필 사진 + 계정 메뉴

### 데이터/스토리지
- `profiles.avatar_url text`(nullable, 스토리지 경로 저장) — 마이그+롤백.
- 공개 버킷 `avatars`(public=true, mime image/jpeg·png·webp, 2MB): 읽기 공개, 쓰기(insert/update/delete)=authenticated **본인 폴더만**(`name ~ ('^' || (select auth.uid())::text || '/')`). 마이그+롤백.
- ⚠️ `profiles_update`는 users.manage 전용 → 일반 사용자는 본인 행 RLS 갱신 불가. 따라서 `avatar_url` 저장은 **admin 클라로 본인 행(id=auth.uid())** 갱신(changeOwnPassword 플래그 해제와 동일 패턴).

### 업로드 (계정 설정 `/admin/account`)
- "프로필 사진" 섹션: 현재 아바타 + 파일선택(jpg/png/webp ≤2MB) → 브라우저 supabase 클라(본인 세션·RLS)로 `avatars/{uid}/avatar.<ext>` 업로드 → 서버액션 `setAvatarAction(path)`가 admin 클라로 `profiles.avatar_url` 저장. `removeAvatarAction`로 제거. 크롭/리사이즈 없음(원본).

### 공용 컴포넌트 `UserAvatar`
- `avatarUrl` 있으면 `<img>`(public URL), 없으면 이니셜 폴백. 순수함수 `avatarInitial(name)`(이름 첫 글자, 없으면 권한 이니셜). public URL 빌더 `avatarPublicUrl(path)`(NEXT_PUBLIC, equipment images 패턴 재사용).
- 적용 3곳: 우상단 헤더 · 사이드바 하단 · 계정 팝오버.

### 계정 메뉴 팝오버 `AccountMenu`(클라)
- 우상단 아바타 클릭 → 작은 팝오버(사진·이름·이메일·권한 라벨 + "계정 설정" 버튼→`/admin/account` + 로그아웃). 바깥클릭/ESC 닫힘.

### 사이드바 하단
- `관/관리자/재현테크` → `UserAvatar` + **이름 / 권한 라벨**(예: 조선제 / 관리자, 줄바꿈 유지).

### 배선·권한 라벨
- layout이 현재 사용자 profile(name·avatar_url)+email(getUser) 조회 → AdminSidebar·AccountMenu에 prop. 순수함수 `roleLabel(isAdmin)` = 관리자 / 영업담당.

## Part 2 — 사이드바 고정
- `<aside>`: `sticky top-0 h-dvh self-start` + 메뉴(SidebarNav 래퍼) `overflow-y-auto flex-1` + 하단 프로필 박스 `mt-auto`. → 본문 스크롤해도 사이드바 고정, 하단 박스 항상 보임. 모바일 드로어 무관.

## 테스트
- db-tests `avatars.test.ts`: 본인 폴더 쓰기 허용 / 타인 폴더 쓰기 거부 / 공개 읽기 / profiles.avatar_url 컬럼.
- web 단위: `avatarInitial`·`roleLabel`·`avatarPublicUrl` 순수 로직.
- e2e: 계정설정 사진 업로드→우상단·사이드바 반영 / 우상단 클릭→팝오버(이메일·계정설정 버튼) / 긴 페이지 스크롤 후 사이드바 하단 박스 보임.

## 범위 밖
이미지 크롭/리사이즈, 다중 사진, 사이드바 외 위치.
