<?php
/**
 * Plugin Name: JHTech SaaS Sync
 * Description: 재현테크 SaaS 장비 → Elementor 템플릿 복제 등록 endpoint (#262). REST 콜백 밖에서는 아무 일도 하지 않습니다(안전 반경 최소화).
 * Version: 1.1.0
 * Author: JHTech SaaS
 *
 * 계약(contract=1) — 워커 wp-plugin.ts와 동기:
 *   POST /wp-json/jhtech/v1/equipment-post
 *     { precheck: true, contract, equipment_uuid, known_post_id }        → 사전 체크
 *     { contract, equipment_uuid, known_post_id, template_post_id, … }   → 재복제 sync
 *   응답: precheck { contract, manual_edited, post_id }
 *         sync     { post_id, link, status, created }
 *   에러: 409 manually_edited(expected/actual 해시 동봉) · 400 template_invalid · 400 bad_request
 *
 * 원칙(autoplan 오버라이드):
 *   · 신규 생성만 draft — 갱신은 글 status 불변(강등 금지)
 *   · 매 sync = 템플릿 _elementor_data에서 재복제(동기화본 패치 금지 — 섹션 복원 가능)
 *   · known_post_id(DB) 우선, meta 조회는 보조 — 응답 created로 워커 CAS 정리 판단
 *   · 해시 기록은 데이터 기록 직후 동일 흐름(부분 실패 오탐 방지) · force=true만 해시 검사 우회
 *   · 모든 치환 텍스트 sanitize(wp_kses 허용 태그 0) · _elementor_data는 wp_slash 필수
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/includes/slot-engine.php';

define('JHTECH_SAAS_SYNC_CONTRACT', 1);
define('JHTECH_META_UUID', 'jhtech_equipment_uuid');
define('JHTECH_META_HASH', 'jhtech_synced_hash');

// findByMeta 재연결 활성화(보너스) — 코어 REST 응답 meta에 uuid 노출.
add_action('init', function () {
    register_post_meta('post', JHTECH_META_UUID, array(
        'show_in_rest' => true,
        'single' => true,
        'type' => 'string',
        'auth_callback' => function () {
            return current_user_can('edit_posts');
        },
    ));
});

add_action('rest_api_init', function () {
    register_rest_route('jhtech/v1', '/equipment-post', array(
        'methods' => 'POST',
        // edit_posts로는 Author/Contributor 계정이 타인 글을 덮어쓸 수 있다(/review 보안 지적) —
        // 이 endpoint는 임의 post를 갱신하므로 편집자 급(edit_others_posts) 이상만.
        'permission_callback' => function () {
            return current_user_can('edit_others_posts');
        },
        'callback' => 'jhtech_saas_sync_handle',
    ));
});

/** uuid meta로 글 탐색(draft·publish만, 최신 1건). */
function jhtech_find_post_by_uuid($uuid)
{
    $q = get_posts(array(
        'post_type' => 'post',
        'post_status' => array('draft', 'publish'),
        'numberposts' => 1,
        'meta_key' => JHTECH_META_UUID,
        'meta_value' => $uuid,
        'fields' => 'ids',
    ));
    return count($q) > 0 ? (int) $q[0] : null;
}

/**
 * 정규화 해시 — 바이트가 아니라 "의미"의 sha256. Elementor 에디터·플러그인이 같은 트리를
 * 다른 이스케이프(\uXXXX vs 원문 유니코드)·공백으로 재직렬화해도 해시가 흔들리지 않게
 * decode → canonical re-encode 후 해시(수동 편집 오탐 방지 — /review 해시 드리프트 지적).
 * 구조가 실제로 바뀐 편집(텍스트·위젯 변경)은 여전히 감지된다.
 */
function jhtech_canonical_hash($raw)
{
    $tree = json_decode((string) $raw, true);
    if (!is_array($tree)) {
        return hash('sha256', (string) $raw);
    }
    return hash('sha256', (string) wp_json_encode($tree, JSON_UNESCAPED_UNICODE));
}

/** 현재 글 _elementor_data의 수동 편집 여부: 저장 해시 부재 = 검사 없음(레거시 글 = 자유 덮어쓰기). */
function jhtech_manual_state($post_id)
{
    $stored = (string) get_post_meta($post_id, JHTECH_META_HASH, true);
    if ($stored === '') {
        return array('checked' => false, 'edited' => false, 'stored' => '', 'actual' => '');
    }
    $data = (string) get_post_meta($post_id, '_elementor_data', true);
    $actual = jhtech_canonical_hash($data);
    return array('checked' => true, 'edited' => $actual !== $stored, 'stored' => $stored, 'actual' => $actual);
}

function jhtech_err($code, $message, $status, $extra = array())
{
    return new WP_Error($code, $message, array_merge(array('status' => $status), $extra));
}

function jhtech_sanitize_text($v)
{
    // REST JSON 파라미터는 이미 unslash 상태 — wp_unslash를 또 걸면 정당한 백슬래시가
    // 소실된다(이중 언슬래시, /review 지적). sanitize만.
    return sanitize_text_field((string) $v);
}

function jhtech_saas_sync_handle(WP_REST_Request $req)
{
    $contract = (int) $req->get_param('contract');
    if ($contract !== JHTECH_SAAS_SYNC_CONTRACT) {
        if ((bool) $req->get_param('precheck')) {
            // precheck: 응답 contract를 보고 워커가 스스로 미가용 처리.
            return new WP_REST_Response(array(
                'contract' => JHTECH_SAAS_SYNC_CONTRACT,
                'manual_edited' => false,
                'post_id' => null,
            ), 200);
        }
        // sync(변이) 요청에 precheck 모양 200을 주면 클라이언트가 '파싱 실패'로 오진한다(/review) —
        // 명시 에러로 종류를 드러낸다(precheck→sync 사이 플러그인 업그레이드 레이스).
        return jhtech_err('contract_mismatch', '플러그인 계약 버전 불일치', 409, array(
            'contract' => JHTECH_SAAS_SYNC_CONTRACT,
        ));
    }

    $uuid = jhtech_sanitize_text($req->get_param('equipment_uuid'));
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $uuid)) {
        return jhtech_err('bad_request', 'equipment_uuid 형식 오류', 400);
    }
    $known = $req->get_param('known_post_id');
    $known_id = is_numeric($known) ? (int) $known : null;

    // DB(known_post_id)가 1차 권위자 — 단, 그 글의 uuid meta가 "비었거나(레거시 v1 글) 요청 uuid와
    // 일치"할 때만 채택. 다른 uuid의 글이나 무관 글을 stale id로 덮어쓰는 사고 차단(/review 치명 지적).
    $post_id = null;
    if ($known_id !== null) {
        $p = get_post($known_id);
        if ($p && $p->post_type === 'post' && $p->post_status !== 'trash') {
            $existing_uuid = (string) get_post_meta($known_id, JHTECH_META_UUID, true);
            if ($existing_uuid === '' || strcasecmp($existing_uuid, $uuid) === 0) {
                $post_id = $known_id;
            }
        }
    }
    if ($post_id === null) {
        $post_id = jhtech_find_post_by_uuid($uuid);
    }

    $manual = $post_id !== null ? jhtech_manual_state($post_id) : array('checked' => false, 'edited' => false, 'stored' => '', 'actual' => '');

    // ── precheck: 상태만 보고 반환(쓰기 0) ──
    if ((bool) $req->get_param('precheck')) {
        return new WP_REST_Response(array(
            'contract' => JHTECH_SAAS_SYNC_CONTRACT,
            'manual_edited' => (bool) $manual['edited'],
            'post_id' => $post_id,
        ), 200);
    }

    // ── sync ──
    $force = (bool) $req->get_param('force');
    if ($post_id !== null && $manual['edited'] && !$force) {
        return jhtech_err('manually_edited', 'WP에서 수동 편집된 글', 409, array(
            'expected_hash' => $manual['stored'],
            'actual_hash' => $manual['actual'],
        ));
    }

    $template_id = (int) $req->get_param('template_post_id');
    $template = $template_id > 0 ? get_post($template_id) : null;
    if (!$template || $template->post_status === 'trash') {
        return jhtech_err('template_invalid', '템플릿 글 없음/휴지통', 400);
    }
    if ($post_id !== null && $post_id === $template_id) {
        // 템플릿 원본이 자기 복제본으로 덮이면 전 장비의 디자인 원본이 소실된다.
        return jhtech_err('template_invalid', '대상 글이 템플릿 자신입니다', 400);
    }
    $template_data = (string) get_post_meta($template_id, '_elementor_data', true);
    $tree = json_decode($template_data, true);
    if (!is_array($tree) || count($tree) === 0) {
        return jhtech_err('template_invalid', '템플릿 _elementor_data 없음/파싱 실패', 400);
    }

    // payload 정리 — 전 텍스트 sanitize(허용 태그 0), 미디어 id 실존 검증(무효는 스킵).
    $images = array();
    foreach ((array) $req->get_param('photo_media_ids') as $mid) {
        $mid = (int) $mid;
        $url = wp_get_attachment_url($mid);
        if ($url) {
            $images[] = array('id' => $mid, 'url' => $url);
        }
    }
    $features = array();
    foreach ((array) $req->get_param('features') as $f) {
        $f = jhtech_sanitize_text($f);
        if ($f !== '') {
            $features[] = $f;
        }
    }
    $spec_groups = array();
    foreach ((array) $req->get_param('spec_groups') as $g) {
        if (!is_array($g)) {
            continue;
        }
        $items = array();
        foreach ((array) (isset($g['items']) ? $g['items'] : array()) as $it) {
            if (!is_array($it)) {
                continue;
            }
            $label = jhtech_sanitize_text(isset($it['label']) ? $it['label'] : '');
            $value = jhtech_sanitize_text(isset($it['value']) ? $it['value'] : '');
            if ($label !== '' || $value !== '') {
                $items[] = array('label' => $label, 'value' => $value);
            }
        }
        if (count($items) > 0) {
            $spec_groups[] = array('name' => jhtech_sanitize_text(isset($g['name']) ? $g['name'] : ''), 'items' => $items);
        }
    }
    $youtube_ids = array();
    foreach ((array) $req->get_param('youtube_ids') as $y) {
        $y = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $y);
        if ($y !== '') {
            $youtube_ids[] = $y;
        }
    }

    $applied = jhtech_apply_slots($tree, array(
        'title' => jhtech_sanitize_text($req->get_param('title')),
        'subtitle' => jhtech_sanitize_text($req->get_param('subtitle')),
        'series_name' => jhtech_sanitize_text($req->get_param('series_name')),
        'features' => $features,
        'spec_groups' => $spec_groups,
        'images' => $images,
        'youtube_ids' => $youtube_ids,
        'seed' => $uuid, // 결정적 id — 같은 장비 재복제는 같은 트리(해시 안정)
    ));
    if (count($applied['errors']) > 0) {
        return jhtech_err('template_invalid', implode(' / ', $applied['errors']), 400);
    }

    // 글 생성/갱신 — 신규만 draft, 갱신은 status 불변(post_status 미전달 = WP가 유지).
    // uuid meta는 meta_input으로 insert와 원자적 기록 — 본문 기록 사이에 프로세스가 죽으면
    // 재시도의 meta 조회가 못 찾아 중복 draft가 생긴다(/review 타임아웃-후-쓰기 지적).
    $created = $post_id === null;
    $postarr = array(
        'post_title' => jhtech_sanitize_text($req->get_param('title')),
        'post_type' => 'post',
    );
    if ($created) {
        $postarr['post_status'] = 'draft';
        $postarr['meta_input'] = array(JHTECH_META_UUID => $uuid);
        $result = wp_insert_post(wp_slash($postarr), true);
    } else {
        $postarr['ID'] = $post_id;
        $result = wp_update_post(wp_slash($postarr), true);
    }
    if (is_wp_error($result)) {
        return jhtech_err('write_failed', $result->get_error_message(), 500);
    }
    $post_id = (int) $result;

    // Elementor 메타 기록 — wp_slash 필수(unslash로 인한 JSON 파손 방지, 유니코드 이스케이프 유지).
    $json = wp_json_encode($applied['tree'], JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return jhtech_err('write_failed', '_elementor_data 인코딩 실패', 500);
    }
    update_post_meta($post_id, '_elementor_data', wp_slash($json));
    update_post_meta($post_id, '_elementor_edit_mode', 'builder');
    $tpl_version = (string) get_post_meta($template_id, '_elementor_version', true);
    if ($tpl_version !== '') {
        update_post_meta($post_id, '_elementor_version', $tpl_version);
    }
    $tpl_type = (string) get_post_meta($template_id, '_elementor_template_type', true);
    if ($tpl_type !== '') {
        update_post_meta($post_id, '_elementor_template_type', $tpl_type);
    }
    // 페이지 템플릿(전체 폭 = elementor_header_footer)도 템플릿 글에서 복사 — 미복사 시
    // 기본 본문 컬럼 폭에 갇혀 밴드가 좁게 렌더된다(가로폭·full-bleed 회귀의 원인).
    $tpl_page = (string) get_post_meta($template_id, '_wp_page_template', true);
    if ($tpl_page !== '' && $tpl_page !== 'default') {
        update_post_meta($post_id, '_wp_page_template', $tpl_page);
    } else {
        delete_post_meta($post_id, '_wp_page_template');
    }
    update_post_meta($post_id, JHTECH_META_UUID, $uuid);
    // 해시는 "메타에 실제 저장된 값"의 정규화 해시 — 즉시 재조회(부분 실패·slash 왕복 오차 방지).
    $stored_now = (string) get_post_meta($post_id, '_elementor_data', true);
    update_post_meta($post_id, JHTECH_META_HASH, jhtech_canonical_hash($stored_now));

    // 카테고리·대표 이미지
    $cats = array();
    foreach ((array) $req->get_param('category_ids') as $c) {
        $c = (int) $c;
        if ($c > 0) {
            $cats[] = $c;
        }
    }
    if (count($cats) > 0) {
        wp_set_post_categories($post_id, $cats);
    }
    $featured = (int) $req->get_param('featured_media_id');
    if ($featured > 0 && wp_get_attachment_url($featured)) {
        set_post_thumbnail($post_id, $featured);
    } else {
        delete_post_thumbnail($post_id);
    }

    // 디자인 CSS 재생성 — 반드시 "이 글만". files_manager->clear_cache()는 사이트 전 글의
    // 생성 CSS를 삭제해 공유호스팅에 부하 스파이크 + 방문자 FOUC를 만든다(/review 치명 지적).
    $css_cleared = false;
    if (class_exists('\\Elementor\\Core\\Files\\CSS\\Post')) {
        try {
            \Elementor\Core\Files\CSS\Post::create($post_id)->delete();
            $css_cleared = true;
        } catch (\Throwable $e) {
            $css_cleared = false;
        }
    }
    if (!$css_cleared) {
        delete_post_meta($post_id, '_elementor_css');
    }

    // 알려진 한계: pending/private/future는 draft로 축약된다 — 이 시스템이 만드는 글은
    // draft/publish 둘뿐이고, 그 외 상태는 사람이 WP에서 직접 관리한 경우다(계약 축소 수용).
    $status = get_post_status($post_id);
    return new WP_REST_Response(array(
        'post_id' => $post_id,
        'link' => get_permalink($post_id),
        'status' => $status === 'publish' ? 'publish' : 'draft',
        'created' => $created,
    ), $created ? 201 : 200);
}
