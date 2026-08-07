<?php
/**
 * #262 슬롯 치환 순수 엔진 — WP 의존 0 (CLI 픽스처 테스트 대상).
 *
 * 슬롯 마커(템플릿 글의 Elementor "CSS 클래스" 필드에 1회 부여):
 *   jh-slot-title / jh-slot-subtitle / jh-slot-series  … 텍스트 위젯(text-editor·heading)
 *   jh-slot-features                                   … 특장점 icon-list 위젯
 *   jh-slot-specs                                      … 사양 컨테이너(내부 첫 icon-list = 그룹 템플릿)
 *   jh-slot-image-01, -02, …                           … 이미지 위젯(명시 인덱스 — DOM 순서 비의존)
 *   jh-slot-video-01, -02, …                           … 유튜브 비디오 위젯
 *   jh-if-image-03 / jh-if-video-02 / jh-if-subtitle / jh-if-series / jh-if-features / jh-if-specs
 *     … 해당 데이터가 비면 통째로 제거되는 컨테이너(제거 단위는 마커 달린 요소로 한정)
 *
 * 계약: 입력 텍스트는 호출측(플러그인)이 sanitize 완료본을 넘긴다. 엔진은 HTML 컨텍스트
 * 삽입 시 htmlspecialchars를 추가로 강제한다(이중 방어 — stored XSS 차단).
 */

/** 요소의 CSS 클래스 목록. */
function jhtech_el_classes($el)
{
    $raw = isset($el['settings']['css_classes']) ? (string) $el['settings']['css_classes'] : '';
    return preg_split('/\s+/', trim($raw), -1, PREG_SPLIT_NO_EMPTY);
}

function jhtech_el_has_class($el, $class)
{
    return in_array($class, jhtech_el_classes($el), true);
}

/** 트리 전체를 깊이우선 순회하며 $fn(&$el)을 적용. $fn이 false를 반환하면 그 요소를 제거. */
function jhtech_walk(array &$elements, callable $fn)
{
    $kept = array();
    foreach ($elements as $el) {
        $keep = $fn($el);
        if ($keep === false) {
            continue;
        }
        if (isset($el['elements']) && is_array($el['elements'])) {
            jhtech_walk($el['elements'], $fn);
        }
        $kept[] = $el;
    }
    $elements = $kept;
}

/** 마커 클래스를 가진 첫 요소 참조 탐색(없으면 null). */
function jhtech_find_marked(array &$elements, $class)
{
    foreach ($elements as $i => &$el) {
        if (jhtech_el_has_class($el, $class)) {
            return array(&$elements[$i]);
        }
        if (isset($el['elements']) && is_array($el['elements'])) {
            $found = jhtech_find_marked($el['elements'], $class);
            if ($found !== null) {
                return $found;
            }
        }
    }
    unset($el);
    return null;
}

/**
 * 텍스트 위젯 치환 — text-editor는 settings.editor(원본 래핑 태그 "체인" 유지), heading은 settings.title.
 * ⚠️ 단일 태그만 보존하면 <p class="테마클래스"><span style="color:#fff">…</span></p> 구조에서
 * span(실제 색 지정)이 소실돼 테마 클래스 색이 이긴다(라이브 스모크 실측 — 시리즈명 배경색 매몰).
 * 중첩 래퍼를 최대 3겹까지 벗겨 내려가며 태그·속성을 전부 보존하고 최심부 텍스트만 교체한다.
 */
function jhtech_set_text(array &$el, $text)
{
    $safe = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    $widget = isset($el['widgetType']) ? $el['widgetType'] : '';
    if ($widget === 'heading') {
        $el['settings']['title'] = $safe;
        return;
    }
    $orig = isset($el['settings']['editor']) ? (string) $el['settings']['editor'] : '';
    $prefix = '';
    $suffix = '';
    $inner = $orig;
    for ($depth = 0; $depth < 3; $depth++) {
        if (!preg_match('/^\s*<([a-z][a-z0-9]*)([^>]*)>(.*)<\/\1>\s*$/is', $inner, $m)) {
            break;
        }
        $prefix .= '<' . $m[1] . $m[2] . '>';
        $suffix = '</' . $m[1] . '>' . $suffix;
        $inner = $m[3];
    }
    $el['settings']['editor'] = $prefix !== ''
        ? $prefix . $safe . $suffix
        : '<p>' . $safe . '</p>';
}

/** icon-list 항목 재구성 — 첫 항목을 스타일 템플릿으로 복제. */
function jhtech_set_icon_list(array &$el, array $texts)
{
    $items = isset($el['settings']['icon_list']) && is_array($el['settings']['icon_list'])
        ? $el['settings']['icon_list'] : array();
    $proto = count($items) > 0 ? $items[0] : array('text' => '');
    $out = array();
    foreach ($texts as $i => $t) {
        $item = $proto;
        $item['text'] = htmlspecialchars($t, ENT_QUOTES, 'UTF-8');
        $item['_id'] = substr(md5('jhli' . $i . $t), 0, 7);
        $out[] = $item;
    }
    $el['settings']['icon_list'] = $out;
}

/** 복제 트리의 모든 _id 재발급 — 템플릿과의 id 충돌 방지. $seed로 결정적 생성(테스트 재현성). */
function jhtech_uniquify_ids(array &$elements, $seed)
{
    $n = 0;
    jhtech_walk($elements, function (&$el) use (&$n, $seed) {
        if (isset($el['id'])) {
            $el['id'] = substr(md5($seed . ':' . $n), 0, 7);
        }
        $n++;
        return true;
    });
}

/**
 * 사양 섹션 재구성: jh-slot-specs 컨테이너 "전체"에서 icon-list 위젯을 전부 걷어내고,
 * 첫 icon-list가 있던 자리(같은 부모·같은 인덱스)에 그룹 수만큼 복제해 삽입한다.
 * ⚠️ 다중 컬럼 템플릿(컬럼마다 icon-list 1개) 대응 — 첫 위젯의 형제만 치우면 다른
 * 컬럼의 템플릿 잔존 텍스트가 살아남는다(/review 지적). 그룹명은 첫 항목(■ 접두),
 * 이후 항목은 "라벨 : 값" — 템플릿(자동 급지 커팅기)의 표기 관행과 동일.
 */
function jhtech_set_specs(array &$container, array $specGroups)
{
    $found = jhtech_find_first_widget($container, 'icon-list');
    if ($found === null) {
        return false; // 그룹 템플릿 위젯 없음 — 호출측이 template_invalid 처리
    }
    $proto = $found[0]; // 값 복사(위젯 원형)
    $newList = array();
    foreach ($specGroups as $gi => $group) {
        $w = $proto;
        $texts = array();
        if (isset($group['name']) && $group['name'] !== '') {
            $texts[] = '■ ' . $group['name'];
        }
        foreach ($group['items'] as $item) {
            $texts[] = $item['label'] . ' : ' . $item['value'];
        }
        jhtech_set_icon_list($w, $texts);
        if (isset($w['id'])) {
            $w['id'] = substr(md5('jhspec' . $gi), 0, 7);
        }
        $newList[] = $w;
    }
    // 컨테이너 전체에서 icon-list를 제거하되, "전역 첫 번째" 위치에 생성분을 통째로 삽입.
    $inserted = false;
    jhtech_specs_rebuild($container, $newList, $inserted);
    return true;
}

/** 컨테이너 하위 elements를 재귀 재구성 — icon-list 전부 제거, 첫 발견 위치에 $newList 삽입. */
function jhtech_specs_rebuild(array &$node, array $newList, &$inserted)
{
    if (!isset($node['elements']) || !is_array($node['elements'])) {
        return;
    }
    $rebuilt = array();
    foreach ($node['elements'] as $el) {
        $isIconList = isset($el['widgetType']) && $el['widgetType'] === 'icon-list';
        if ($isIconList) {
            if (!$inserted) {
                foreach ($newList as $w) {
                    $rebuilt[] = $w;
                }
                $inserted = true;
            }
            continue; // 템플릿 잔존 그룹 제거(다른 컬럼 포함)
        }
        jhtech_specs_rebuild($el, $newList, $inserted);
        $rebuilt[] = $el;
    }
    $node['elements'] = $rebuilt;
}

/** 컨테이너 내부에서 특정 widgetType의 첫 위젯을 [위젯 값, &부모 elements 배열]로 반환. */
function jhtech_find_first_widget(array &$container, $widgetType)
{
    if (!isset($container['elements']) || !is_array($container['elements'])) {
        return null;
    }
    foreach ($container['elements'] as $i => &$el) {
        if (isset($el['widgetType']) && $el['widgetType'] === $widgetType) {
            return array($container['elements'][$i], &$container['elements']);
        }
        $found = jhtech_find_first_widget($el, $widgetType);
        if ($found !== null) {
            return $found;
        }
    }
    unset($el);
    return null;
}

/**
 * 메인: 템플릿 트리 + payload → 치환 완료 트리.
 * 반환: array('tree' => …, 'errors' => string[]) — errors 비어있지 않으면 template_invalid.
 *
 * $payload 키: title(필수), subtitle, series_name, features[], spec_groups[],
 *              images[ [id, url], … ](1-기반 인덱스 순), youtube_ids[], seed
 */
function jhtech_apply_slots(array $tree, array $payload)
{
    $errors = array();

    // 필수 슬롯: 제목
    $titleRef = jhtech_find_marked($tree, 'jh-slot-title');
    if ($titleRef === null) {
        $errors[] = 'jh-slot-title 마커 없음';
    } elseif (!isset($payload['title']) || $payload['title'] === '') {
        $errors[] = 'title 비어 있음';
    } else {
        jhtech_set_text($titleRef[0], $payload['title']);
    }

    // 선택 텍스트 슬롯
    foreach (array('subtitle' => 'jh-slot-subtitle', 'series_name' => 'jh-slot-series') as $key => $marker) {
        $val = isset($payload[$key]) ? (string) $payload[$key] : '';
        $ref = jhtech_find_marked($tree, $marker);
        if ($ref !== null && $val !== '') {
            jhtech_set_text($ref[0], $val);
        }
    }

    // 특장점
    $features = isset($payload['features']) && is_array($payload['features']) ? $payload['features'] : array();
    $featRef = jhtech_find_marked($tree, 'jh-slot-features');
    if ($featRef !== null && count($features) > 0) {
        jhtech_set_icon_list($featRef[0], $features);
    }

    // 사양
    $specGroups = isset($payload['spec_groups']) && is_array($payload['spec_groups']) ? $payload['spec_groups'] : array();
    $specRef = jhtech_find_marked($tree, 'jh-slot-specs');
    if ($specRef !== null && count($specGroups) > 0) {
        if (!jhtech_set_specs($specRef[0], $specGroups)) {
            $errors[] = 'jh-slot-specs 컨테이너에 icon-list 그룹 템플릿 없음';
        }
    }

    // 이미지(명시 인덱스, 1-기반) — images[0] = jh-slot-image-01
    $images = isset($payload['images']) && is_array($payload['images']) ? $payload['images'] : array();
    for ($i = 1; $i <= 99; $i++) {
        $marker = sprintf('jh-slot-image-%02d', $i);
        $ref = jhtech_find_marked($tree, $marker);
        if ($ref === null) {
            if ($i > count($images)) {
                break; // 더 큰 인덱스 마커도 없다고 가정(연속 번호 규약)
            }
            continue;
        }
        if (isset($images[$i - 1])) {
            $ref[0]['settings']['image'] = array(
                'id' => (int) $images[$i - 1]['id'],
                'url' => (string) $images[$i - 1]['url'],
            );
        }
    }

    // 비디오(명시 인덱스)
    $videos = isset($payload['youtube_ids']) && is_array($payload['youtube_ids']) ? $payload['youtube_ids'] : array();
    for ($i = 1; $i <= 99; $i++) {
        $marker = sprintf('jh-slot-video-%02d', $i);
        $ref = jhtech_find_marked($tree, $marker);
        if ($ref === null) {
            if ($i > count($videos)) {
                break;
            }
            continue;
        }
        if (isset($videos[$i - 1])) {
            $id = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $videos[$i - 1]);
            $ref[0]['settings']['youtube_url'] = 'https://www.youtube.com/watch?v=' . $id;
        }
    }

    // 빈 슬롯 컨테이너 제거 — jh-if-* 마커 단위로만 제거(흔적 없는 섹션 정리)
    $hasData = array(
        'subtitle' => isset($payload['subtitle']) && $payload['subtitle'] !== '',
        'series' => isset($payload['series_name']) && $payload['series_name'] !== '',
        'features' => count($features) > 0,
        'specs' => count($specGroups) > 0,
    );
    jhtech_walk($tree, function (&$el) use ($hasData, $images, $videos) {
        foreach (jhtech_el_classes($el) as $cls) {
            if (preg_match('/^jh-if-image-(\d{2})$/', $cls, $m)) {
                if (!isset($images[((int) $m[1]) - 1])) {
                    return false;
                }
            } elseif (preg_match('/^jh-if-video-(\d{2})$/', $cls, $m)) {
                if (!isset($videos[((int) $m[1]) - 1])) {
                    return false;
                }
            } elseif (preg_match('/^jh-if-(subtitle|series|features|specs)$/', $cls, $m)) {
                if (!$hasData[$m[1]]) {
                    return false;
                }
            }
        }
        return true;
    });

    // 위젯 id 전면 재발급(템플릿·기존 글과 충돌 방지). seed로 결정적 — 같은 입력 = 같은 트리(해시 안정).
    $seed = isset($payload['seed']) ? (string) $payload['seed'] : 'jhtech';
    jhtech_uniquify_ids($tree, $seed);

    return array('tree' => $tree, 'errors' => $errors);
}
