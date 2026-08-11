<?php
/**
 * #262 슬롯 엔진 픽스처 테스트 — WP 의존 0, plain PHP CLI.
 * 실행: php tests/run-tests.php  (CI: docker run --rm -v "$PWD":/app php:8.2-cli php /app/tests/run-tests.php)
 * 픽스처: synthetic-template.json(합성) + template-4605.json(실제 export, 존재 시 자동 포함).
 */

require __DIR__ . '/../includes/slot-engine.php';

$pass = 0;
$fail = 0;
function check($name, $cond)
{
    global $pass, $fail;
    if ($cond) {
        $pass++;
        echo "  ok  $name\n";
    } else {
        $fail++;
        echo "  FAIL $name\n";
    }
}

function load_fixture($file)
{
    $tree = json_decode(file_get_contents(__DIR__ . '/fixtures/' . $file), true);
    if (!is_array($tree)) {
        fwrite(STDERR, "픽스처 파싱 실패: $file\n");
        exit(1);
    }
    return $tree;
}

function collect_texts(array $tree)
{
    $out = array();
    jhtech_walk($tree, function (&$el) use (&$out) {
        if (isset($el['settings']['editor'])) {
            $out[] = $el['settings']['editor'];
        }
        if (isset($el['settings']['title'])) {
            $out[] = $el['settings']['title'];
        }
        if (isset($el['settings']['icon_list'])) {
            foreach ($el['settings']['icon_list'] as $it) {
                $out[] = isset($it['text']) ? $it['text'] : '';
            }
        }
        return true;
    });
    return implode("\n", $out);
}

function collect_ids(array $tree)
{
    $ids = array();
    jhtech_walk($tree, function (&$el) use (&$ids) {
        if (isset($el['id'])) {
            $ids[] = $el['id'];
        }
        return true;
    });
    return $ids;
}

function base_payload($over = array())
{
    return array_merge(array(
        'title' => '멀티컷 A3 Max 5',
        'subtitle' => '소량 다품종 최적',
        'series_name' => 'MULTICUT SERIES',
        'features' => array('특징 하나', '특징 둘', '특징 셋'),
        'spec_groups' => array(
            array('name' => '시스템', 'items' => array(
                array('label' => '커팅 크기', 'value' => '350mm'),
                array('label' => '속도', 'value' => '1600mm/s'),
            )),
        ),
        'images' => array(array('id' => 501, 'url' => 'https://x/a.png')),
        'youtube_ids' => array('abc123XYZ_-'),
        'seed' => '11111111-1111-4111-8111-111111111111',
    ), $over);
}

$tpl = load_fixture('synthetic-template.json');

echo "1) 전 슬롯 치환\n";
$r = jhtech_apply_slots($tpl, base_payload());
check('에러 없음', count($r['errors']) === 0);
$texts = collect_texts($r['tree']);
check('제목 치환', strpos($texts, '멀티컷 A3 Max 5') !== false);
check('제목 래핑 태그 유지(h2.big)', strpos(json_encode($r['tree'], JSON_UNESCAPED_UNICODE), '<h2 class=') !== false);
check('부제 치환', strpos($texts, '소량 다품종 최적') !== false);
check('시리즈명 치환(heading title)', strpos($texts, 'MULTICUT SERIES') !== false);
check('특징 3건', substr_count($texts, '특징 ') === 3);
check('사양 그룹 제목 위젯(텍스트 접두 없음 — 아이콘이 ■ 역할)', strpos($texts, '시스템') !== false && strpos($texts, '■ 시스템') === false);
check('사양 라벨:값 표기', strpos($texts, '커팅 크기 : 350mm') !== false);
$jSpec = json_encode($r['tree'], JSON_UNESCAPED_UNICODE);
check('사양 항목 의미 아이콘(커팅 크기→print)', strpos($jSpec, 'fas fa-print') !== false);
check('사양 항목 의미 아이콘(속도→stopwatch)', strpos($jSpec, 'fas fa-stopwatch') !== false);
check('템플릿 텍스트 잔존 없음', strpos($texts, '자동 급지') === false && strpos($texts, 'JC 350') === false);

echo "2) 이미지·비디오 인덱스 슬롯\n";
$json = json_encode($r['tree'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
check('이미지1 교체', strpos($json, 'https://x/a.png') !== false && strpos($json, '"id":501') !== false);
check('이미지2 섹션(jh-if-image-02) 제거', strpos($json, 'img2.jpg') === false);
check('비디오 치환', strpos($json, 'watch?v=abc123XYZ_-') !== false);

echo "3) 빈 슬롯 섹션 제거(jh-if-*)\n";
$r2 = jhtech_apply_slots($tpl, base_payload(array(
    'subtitle' => '', 'series_name' => '', 'features' => array(), 'spec_groups' => array(),
    'images' => array(), 'youtube_ids' => array(),
)));
$json2 = json_encode($r2['tree'], JSON_UNESCAPED_UNICODE);
check('부제 위젯 제거', strpos($json2, 'jh-slot-subtitle') === false);
check('시리즈 위젯 제거', strpos($json2, 'jh-slot-series') === false);
check('특징 위젯 제거', strpos($json2, 'jh-slot-features') === false);
check('사양 섹션 제거', strpos($json2, 'jh-slot-specs') === false);
check('이미지·비디오 섹션 전부 제거', strpos($json2, 'jh-slot-image') === false && strpos($json2, 'jh-slot-video') === false);
check('제목은 유지', strpos(collect_texts($r2['tree']), '멀티컷 A3 Max 5') !== false);

echo "4) 재복제 = 슬롯 복원 (사진 0장 → 다시 1장)\n";
$r3 = jhtech_apply_slots($tpl, base_payload()); // 항상 템플릿 원본에서 재복제
check('제거됐던 이미지 섹션이 복원된다', strpos(json_encode($r3['tree'], JSON_UNESCAPED_SLASHES), 'https://x/a.png') !== false);

echo "5) 필수 슬롯·template_invalid\n";
$r4 = jhtech_apply_slots($tpl, base_payload(array('title' => '')));
check('빈 제목 = 에러', count($r4['errors']) > 0);
$noTitle = load_fixture('synthetic-template.json');
$noTitle[0]['elements'][0]['elements'][0]['settings']['css_classes'] = '';
$r5 = jhtech_apply_slots($noTitle, base_payload());
check('jh-slot-title 마커 없음 = 에러', count($r5['errors']) > 0);

echo "6) 특수문자 이스케이프(stored XSS 차단)\n";
$r6 = jhtech_apply_slots($tpl, base_payload(array(
    'title' => '19" 커터 & <script>alert(1)</script>',
    'features' => array("백슬래시\\경로 'quote'"),
)));
$t6 = collect_texts($r6['tree']);
check('스크립트 태그 무력화', strpos($t6, '<script>') === false && strpos($t6, '&lt;script&gt;') !== false);
check('따옴표 이스케이프', strpos($t6, '19&quot;') !== false);
check('백슬래시 보존', strpos($t6, '백슬래시\\경로') !== false);
$j6 = json_encode($r6['tree']);
check('JSON round-trip 무손상', is_array(json_decode($j6, true)));

echo "7) id 고유화 — 템플릿과 충돌 0, seed 결정적\n";
$idsA = collect_ids($r['tree']);
$idsTpl = collect_ids($tpl);
check('템플릿 id와 전부 다름', count(array_intersect($idsA, $idsTpl)) === 0);
check('id 중복 없음', count($idsA) === count(array_unique($idsA)));
$rSame = jhtech_apply_slots($tpl, base_payload());
check('같은 seed = 같은 id(해시 안정)', collect_ids($rSame['tree']) === $idsA);
$rDiff = jhtech_apply_slots($tpl, base_payload(array('seed' => '22222222-2222-4222-8222-222222222222')));
check('다른 seed = 다른 id', collect_ids($rDiff['tree']) !== $idsA);

echo "8) 사양 그룹 복수 — 그룹 수만큼 icon-list 생성\n";
$r8 = jhtech_apply_slots($tpl, base_payload(array('spec_groups' => array(
    array('name' => 'A그룹', 'items' => array(array('label' => 'x', 'value' => '1'))),
    array('name' => 'B그룹', 'items' => array(array('label' => 'y', 'value' => '2'))),
    array('name' => 'C그룹', 'items' => array(array('label' => 'z', 'value' => '3'))),
))));
$t8 = collect_texts($r8['tree']);
check('그룹 3개 전부 렌더', strpos($t8, 'A그룹') !== false && strpos($t8, 'B그룹') !== false && strpos($t8, 'C그룹') !== false);
check('템플릿의 2번째 그룹(JC 600) 잔존 없음', strpos($t8, 'JC 600') === false);

echo "6b) 중첩 래퍼 체인 보존 — <p class><span style>의 span(색 지정)이 살아남는다\n";
$nested = load_fixture('synthetic-template.json');
$nested[0]['elements'][0]['elements'][0]['settings']['editor'] =
    '<p class="product_title entry-title" style="text-align: center;"><span style="color: #ffffff;">자동 급지 커팅기</span></p>';
$rN = jhtech_apply_slots($nested, base_payload(array('title' => '멀티컷 A3 Max 5')));
$jN = json_encode($rN['tree'], JSON_UNESCAPED_UNICODE);
check('span 래퍼(색 지정) 보존', strpos($jN, 'color: #ffffff') !== false);
check('p 클래스·정렬 보존', strpos($jN, 'product_title entry-title') !== false);
check('최심부 텍스트만 교체', strpos($jN, '멀티컷 A3 Max 5') !== false && strpos($jN, '자동 급지 커팅기') === false);

echo "8b) 사양 다중 컬럼 레거시 — 컬럼마다 '항목 리스트'(복수 항목) → 2-프로토 오인 없이 레거시 모드\n";
$multi = load_fixture('synthetic-template.json');
$mkList = function ($id, $texts) {
    $items = array();
    foreach ($texts as $i => $t) {
        $items[] = array('_id' => 'm' . $id . $i, 'text' => $t, 'selected_icon' => array('value' => 'fas fa-cog'));
    }
    return array('id' => $id, 'elType' => 'widget', 'widgetType' => 'icon-list',
        'settings' => array('icon_list' => $items), 'elements' => array());
};
// 사양 섹션(sec0004)을 2컬럼 구조로 변형: 컬럼마다 복수 항목 icon-list 1개(구 수제 관행)
$multi[3]['elements'] = array(
    array('id' => 'colA', 'elType' => 'column', 'settings' => array(), 'elements' => array(
        array('id' => 'widX1', 'elType' => 'widget', 'widgetType' => 'text-editor',
            'settings' => array('editor' => '<p>사양 안내</p>'), 'elements' => array()),
        $mkList('widA', array('■ JC 350 제품 사양', '속도 : 1600')),
    )),
    array('id' => 'colB', 'elType' => 'column', 'settings' => array(), 'elements' => array(
        $mkList('widB', array('■ JC 600 제품 사양', '속도 : 1600')),
    )),
);
$rM = jhtech_apply_slots($multi, base_payload(array('spec_groups' => array(
    array('name' => '단일그룹', 'items' => array(array('label' => 'k', 'value' => 'v'))),
))));
$tM = collect_texts($rM['tree']);
check('다른 컬럼(JC 600) 잔존 제거', strpos($tM, 'JC 600') === false);
check('첫 컬럼(JC 350) 잔존 제거', strpos($tM, 'JC 350') === false);
check('레거시 모드 렌더(첫 리스트가 복수 항목 = 2-프로토 오인 금지)', strpos($tM, '■ 단일그룹') !== false && strpos($tM, 'k : v') !== false);
check('비-icon-list 형제(사양 안내) 보존', strpos($tM, '사양 안내') !== false);

echo "8d) 레거시 단일 프로토(icon-list 1개) — '■ ' 텍스트 접두 유지\n";
$legacy = load_fixture('synthetic-template.json');
array_splice($legacy[3]['elements'][0]['elements'], 1, 1); // 둘째 icon-list 제거
$rL = jhtech_apply_slots($legacy, base_payload());
$tL = collect_texts($rL['tree']);
check('레거시 그룹명 ■ 접두 유지', strpos($tL, '■ 시스템') !== false);

echo "8e) 2-프로토 — 그룹당 [제목 위젯 + 항목 위젯] 쌍 생성, 항목 위젯은 둘째 프로토 스타일\n";
$rP = jhtech_apply_slots($tpl, base_payload());
$specSection = null;
foreach ($rP['tree'] as $sec) {
    if (strpos(json_encode($sec), 'jh-slot-specs') !== false) { $specSection = $sec; }
}
$pLists = jhtech_collect_widgets($specSection, 'icon-list', 10);
check('그룹 1개 = icon-list 2개(제목+항목)', count($pLists) === 2);
check('제목 위젯은 1항목', count($pLists[0]['settings']['icon_list']) === 1);
check('항목 위젯은 그룹 항목 수', count($pLists[1]['settings']['icon_list']) === 2);

echo "8i) jh-first-red — 첫 글자만 빨강 span, 나머지는 이스케이프 유지\n";
$rTpl = load_fixture('synthetic-template.json');
$rTpl[0]['elements'][0]['elements'][] = array('id' => 'red0001', 'elType' => 'widget',
    'widgetType' => 'text-editor', 'settings' => array(
        'css_classes' => 'jh-slot-model jh-if-model jh-first-red',
        'editor' => '<p class="big_model">TPL</p>'), 'elements' => array());
$rRed = jhtech_apply_slots($rTpl, base_payload(array('model' => 'XTRA 3300S')));
$jRed = json_encode($rRed['tree'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
check('첫 글자 span 빨강 + 나머지 평문', strpos($jRed, '<span style=\"color: #ff0000;\">X</span>TRA 3300S') !== false
    || strpos($jRed, '<span style="color: #ff0000;">X</span>TRA 3300S') !== false);
check('래핑 클래스 유지', strpos($jRed, 'big_model') !== false);
$rRedX = jhtech_apply_slots($rTpl, base_payload(array('model' => '<b>주입</b>')));
$jRedX = json_encode($rRedX['tree'], JSON_UNESCAPED_UNICODE);
check('첫 글자 분리 후에도 XSS 이스케이프', strpos($jRedX, '<b>') === false);

echo "8h) 모델명 슬롯(jh-slot-model) — 다중 위치 전부 치환, 빈 값이면 jh-if-model 제거\n";
$mTpl = load_fixture('synthetic-template.json');
$mkModelWidget = function ($id) {
    return array('id' => $id, 'elType' => 'widget', 'widgetType' => 'text-editor',
        'settings' => array('css_classes' => 'jh-slot-model jh-if-model',
            'editor' => '<p class="model_text">TPL-MODEL</p>'), 'elements' => array());
};
$mTpl[0]['elements'][0]['elements'][] = $mkModelWidget('mdl0001');
$mTpl[3]['elements'][0]['elements'][] = $mkModelWidget('mdl0002');
$rMd = jhtech_apply_slots($mTpl, base_payload(array('model' => 'JC350Max')));
$jMd = json_encode($rMd['tree'], JSON_UNESCAPED_UNICODE);
check('모델명 두 자리 전부 치환', substr_count($jMd, 'JC350Max') === 2 && strpos($jMd, 'TPL-MODEL') === false);
check('래핑 클래스 보존', strpos($jMd, 'model_text') !== false);
$rMd0 = jhtech_apply_slots($mTpl, base_payload(array('model' => '')));
$jMd0 = json_encode($rMd0['tree'], JSON_UNESCAPED_UNICODE);
check('빈 모델명 = 위젯 제거', strpos($jMd0, 'jh-slot-model') === false);

echo "8g) flat 모드(jh-specs-flat) — 템플릿 헤더 유지 + 전 그룹 항목 평탄화 단일 리스트\n";
$flatTpl = load_fixture('synthetic-template.json');
$flatTpl[3]['settings']['css_classes'] .= ' jh-specs-flat';
$rF = jhtech_apply_slots($flatTpl, base_payload(array('spec_groups' => array(
    array('name' => 'A그룹', 'items' => array(array('label' => '커팅 크기', 'value' => '350mm'))),
    array('name' => 'B그룹', 'items' => array(array('label' => '속도', 'value' => '1600mm/s'))),
))));
$specF = null;
foreach ($rF['tree'] as $sec) {
    if (strpos(json_encode($sec), 'jh-slot-specs') !== false) { $specF = $sec; }
}
$fLists = jhtech_collect_widgets($specF, 'icon-list', 10);
check('flat = icon-list 2개(헤더+통합 리스트)뿐', count($fLists) === 2);
check('헤더 텍스트 = 템플릿 원문 유지', strpos(json_encode($fLists[0], JSON_UNESCAPED_UNICODE), 'JC 350 제품 사양') !== false);
$tF = collect_texts($rF['tree']);
check('그룹명 미표기·항목 전부 평탄화', strpos($tF, 'A그룹') === false && strpos($tF, 'B그룹') === false
    && strpos($tF, '커팅 크기 : 350mm') !== false && strpos($tF, '속도 : 1600mm/s') !== false);
check('통합 리스트 항목 수 = 2', count($fLists[1]['settings']['icon_list']) === 2);

echo "8f) 연속 스페이서 섹션 접기 — 제거된 밴드 자리 빈 공백 스택 방지\n";
$sp = load_fixture('synthetic-template.json');
$mkSpacer = function ($id) {
    return array('id' => $id, 'elType' => 'section', 'settings' => array(), 'elements' => array(
        array('id' => $id . 'c', 'elType' => 'column', 'settings' => array(), 'elements' => array(
            array('id' => $id . 'w', 'elType' => 'widget', 'widgetType' => 'spacer',
                'settings' => array(), 'elements' => array()),
        )),
    ));
};
// [본문] [스페이서] [비디오(jh-if-video-01)] [스페이서] [사양] 구조 — 비디오 제거 시 스페이서 1개만 남아야
$spTree = array($sp[0], $mkSpacer('spA'), $sp[4], $mkSpacer('spB'), $sp[3]);
$rS = jhtech_apply_slots($spTree, base_payload(array('youtube_ids' => array())));
$spacerCount = 0;
foreach ($rS['tree'] as $sec) {
    if (jhtech_is_spacer_only($sec)) { $spacerCount++; }
}
check('비디오 밴드 제거 후 연속 스페이서 1개로 접힘', $spacerCount === 1);
$rS2 = jhtech_apply_slots($spTree, base_payload());
$spacerCount2 = 0;
foreach ($rS2['tree'] as $sec) {
    if (jhtech_is_spacer_only($sec)) { $spacerCount2++; }
}
check('비디오 있으면 스페이서 2개 그대로(간격 보존)', $spacerCount2 === 2);

echo "8c) 사진이 슬롯보다 많으면 초과분 무시\n";
$rX = jhtech_apply_slots($tpl, base_payload(array('images' => array(
    array('id' => 501, 'url' => 'https://x/a.png'),
    array('id' => 502, 'url' => 'https://x/b.png'),
    array('id' => 503, 'url' => 'https://x/c.png'), // 슬롯은 2개(image-01·02)
))));
$jX = json_encode($rX['tree'], JSON_UNESCAPED_SLASHES);
check('슬롯 2개 채움', strpos($jX, 'https://x/a.png') !== false && strpos($jX, 'https://x/b.png') !== false);
check('초과분(3번째)은 미사용', strpos($jX, 'https://x/c.png') === false);

// 실제 export 픽스처가 있으면 스모크 추가(마커 부여 후 재export한 파일).
if (file_exists(__DIR__ . '/fixtures/template-4605.json')) {
    echo "9) 실제 4605 export 스모크\n";
    $real = load_fixture('template-4605.json');
    $r9 = jhtech_apply_slots($real, base_payload());
    check('실제 템플릿 치환 에러 없음', count($r9['errors']) === 0);
    check('실제 템플릿 제목 치환', strpos(collect_texts($r9['tree']), '멀티컷 A3 Max 5') !== false);
} else {
    echo "9) 실제 4605 export 스킵(픽스처 없음 — 슬롯 마킹 후 추가)\n";
}

echo "\n결과: $pass ok / $fail fail\n";
exit($fail > 0 ? 1 : 0);
