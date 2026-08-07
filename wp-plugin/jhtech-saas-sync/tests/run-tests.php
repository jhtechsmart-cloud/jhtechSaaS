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
check('사양 그룹명 ■ 접두', strpos($texts, '■ 시스템') !== false);
check('사양 라벨:값 표기', strpos($texts, '커팅 크기 : 350mm') !== false);
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
check('그룹 3개 전부 렌더', strpos($t8, '■ A그룹') !== false && strpos($t8, '■ B그룹') !== false && strpos($t8, '■ C그룹') !== false);
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

echo "8b) 사양 다중 컬럼 — 다른 컬럼의 템플릿 icon-list도 제거, 삽입 위치는 첫 발견 자리\n";
$multi = load_fixture('synthetic-template.json');
// 사양 섹션(sec0004)을 2컬럼 구조로 변형: 컬럼마다 icon-list 1개
$multi[3]['elements'] = array(
    array('id' => 'colA', 'elType' => 'column', 'settings' => array(), 'elements' => array(
        array('id' => 'widX1', 'elType' => 'widget', 'widgetType' => 'text-editor',
            'settings' => array('editor' => '<p>사양 안내</p>'), 'elements' => array()),
        $multi[3]['elements'][0]['elements'][0], // 원래 첫 icon-list(JC 350)
    )),
    array('id' => 'colB', 'elType' => 'column', 'settings' => array(), 'elements' => array(
        $multi[3]['elements'][0]['elements'][1], // 원래 둘째 icon-list(JC 600)
    )),
);
$rM = jhtech_apply_slots($multi, base_payload(array('spec_groups' => array(
    array('name' => '단일그룹', 'items' => array(array('label' => 'k', 'value' => 'v'))),
))));
$tM = collect_texts($rM['tree']);
check('다른 컬럼(JC 600) 잔존 제거', strpos($tM, 'JC 600') === false);
check('첫 컬럼(JC 350) 잔존 제거', strpos($tM, 'JC 350') === false);
check('신규 그룹 렌더', strpos($tM, '■ 단일그룹') !== false && strpos($tM, 'k : v') !== false);
check('비-icon-list 형제(사양 안내) 보존', strpos($tM, '사양 안내') !== false);

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
