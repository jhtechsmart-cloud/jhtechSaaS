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
    // jh-first-red 마커: 첫 글자만 빨강(#ff0000) — 수제 페이지의 브랜드 관행("XTRA"의 X).
    // text-editor 전용(heading title은 평문 유지).
    $firstRed = jhtech_el_has_class($el, 'jh-first-red');
    $widget = isset($el['widgetType']) ? $el['widgetType'] : '';
    if ($firstRed && $widget !== 'heading' && mb_strlen($text, 'UTF-8') > 0) {
        $first = mb_substr($text, 0, 1, 'UTF-8');
        $rest = mb_substr($text, 1, null, 'UTF-8');
        $safe = '<span style="color: #ff0000;">' . htmlspecialchars($first, ENT_QUOTES, 'UTF-8') . '</span>'
            . htmlspecialchars($rest, ENT_QUOTES, 'UTF-8');
    }
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

/** icon-list 항목 재구성 — 첫 항목을 스타일 템플릿으로 복제. entries = [['text'=>…, 'icon'=>null|'fas fa-…'], …] */
function jhtech_build_icon_list(array &$el, array $entries)
{
    $items = isset($el['settings']['icon_list']) && is_array($el['settings']['icon_list'])
        ? $el['settings']['icon_list'] : array();
    $proto = count($items) > 0 ? $items[0] : array('text' => '');
    $out = array();
    foreach ($entries as $i => $e) {
        $item = $proto;
        $item['text'] = htmlspecialchars($e['text'], ENT_QUOTES, 'UTF-8');
        if (isset($e['icon']) && $e['icon'] !== null && $e['icon'] !== '') {
            $item['selected_icon'] = array('value' => $e['icon'], 'library' => 'fa-solid');
        }
        $item['_id'] = substr(md5('jhli' . $i . $e['text']), 0, 7);
        $out[] = $item;
    }
    $el['settings']['icon_list'] = $out;
}

/** 텍스트만 넘기는 호출(특장점 등) — 아이콘은 프로토 항목 것을 유지. */
function jhtech_set_icon_list(array &$el, array $texts)
{
    $entries = array();
    foreach ($texts as $t) {
        $entries[] = array('text' => $t, 'icon' => null);
    }
    jhtech_build_icon_list($el, $entries);
}

/**
 * 사양 라벨 → 의미 아이콘(원본 수제 페이지의 어휘: cog=구동, stopwatch=속도, cogs=정밀,
 * print=소재·커팅, arrows-alt=크기·무게, plug=전원, user-cog=데이터·인터페이스).
 * 미매칭 = null → 항목 프로토의 기본 아이콘 유지. 순서 중요('커팅 속도'는 속도가 먼저).
 */
function jhtech_spec_icon($label)
{
    $rules = array(
        array('/속도/u', 'fas fa-stopwatch'),
        array('/정밀|압력/u', 'fas fa-cogs'),
        array('/폭|소재|두께|공급|급지|용지|적재|커팅/u', 'fas fa-print'),
        array('/크기|무게|치수|캐비넷/u', 'fas fa-arrows-alt'),
        array('/전원|전기|전압/u', 'fas fa-plug'),
        array('/데이터|인터페이스|소프트웨어|연결|전송|제어판|터치|스크린|USB|WIFI|와이파이|QR|카메라|마크/iu', 'fas fa-user-cog'),
        array('/모터|구동|헤드|시스템/u', 'fas fa-cog'),
    );
    foreach ($rules as $r) {
        if (preg_match($r[0], $label)) {
            return $r[1];
        }
    }
    return null;
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
 * 컬럼의 템플릿 잔존 텍스트가 살아남는다(/review 지적).
 *
 * 원본 수제 페이지의 사양은 2단 구조: [그룹 제목 icon-list(굵게·■아이콘 1항목)] +
 * [항목 icon-list(작은 폰트·구분선·항목별 의미 아이콘)]. 컨테이너에 icon-list가 2개
 * 이상이면 첫째=제목 프로토·둘째=항목 프로토로 그룹마다 한 쌍씩 생성한다(스타일 충실).
 * 1개뿐인 레거시 템플릿은 기존 방식(단일 리스트 + '■ ' 텍스트 접두) 유지.
 */
function jhtech_set_specs(array &$container, array $specGroups)
{
    $protos = jhtech_collect_widgets($container, 'icon-list', 2);
    if (count($protos) === 0) {
        return false; // 그룹 템플릿 위젯 없음 — 호출측이 template_invalid 처리
    }
    $headerProto = $protos[0];
    // 2-프로토는 "첫 리스트 = 1항목 제목 위젯"일 때만 — 다중 컬럼 레거시(컬럼마다 항목
    // 리스트 1개)를 헤더/항목 쌍으로 오인하지 않는다(어드버서리얼 F3). 실제 4605 템플릿의
    // 제목 리스트는 1항목("JC 350 제품 사양")이라 이 검증을 통과한다.
    $headerItems = isset($headerProto['settings']['icon_list']) && is_array($headerProto['settings']['icon_list'])
        ? count($headerProto['settings']['icon_list']) : 0;
    $itemProto = (count($protos) >= 2 && $headerItems === 1) ? $protos[1] : null;

    // flat 모드(jh-specs-flat) — 프린터 템플릿(수제 '플로라 XTRA 3300S') 관행:
    // 그룹별 제목을 만들지 않고 [템플릿 헤더 그대로(예: '제품 사양') + 전 그룹 항목 평탄화
    // 단일 리스트(구분선으로만 구별)]로 재구성. 그룹명은 표기하지 않는다.
    if ($itemProto !== null && jhtech_el_has_class($container, 'jh-specs-flat')) {
        $entries = array();
        foreach ($specGroups as $group) {
            if (!isset($group['items']) || !is_array($group['items'])) {
                continue;
            }
            foreach ($group['items'] as $item) {
                $entries[] = array(
                    'text' => $item['label'] . ' : ' . $item['value'],
                    'icon' => jhtech_spec_icon($item['label']),
                );
            }
        }
        if (count($entries) === 0) {
            return true; // 항목 0 = jh-if-specs가 섹션째 제거하므로 재구성 불필요
        }
        $h = $headerProto; // 헤더 텍스트는 템플릿 원문 유지
        if (isset($h['id'])) {
            $h['id'] = substr(md5('jhspech-flat'), 0, 7);
        }
        $w = $itemProto;
        jhtech_build_icon_list($w, $entries);
        if (isset($w['id'])) {
            $w['id'] = substr(md5('jhspec-flat'), 0, 7);
        }
        $inserted = false;
        jhtech_specs_rebuild($container, array($h, $w), $inserted);
        return true;
    }

    $newList = array();
    foreach ($specGroups as $gi => $group) {
        // 항목 없는 그룹은 빈 위젯을 만들지 않는다(플러그인 핸들러도 거르지만 엔진 계약으로 방어).
        if (!isset($group['items']) || !is_array($group['items']) || count($group['items']) === 0) {
            continue;
        }
        $name = isset($group['name']) ? (string) $group['name'] : '';
        if ($itemProto !== null) {
            // 2-프로토: 그룹 제목 위젯(아이콘이 ■ 역할 — 텍스트 접두 없음) + 항목 위젯
            if ($name !== '') {
                $h = $headerProto;
                jhtech_build_icon_list($h, array(array('text' => $name, 'icon' => null)));
                if (isset($h['id'])) {
                    $h['id'] = substr(md5('jhspech' . $gi), 0, 7);
                }
                $newList[] = $h;
            }
            $w = $itemProto;
            $entries = array();
            foreach ($group['items'] as $item) {
                $entries[] = array(
                    'text' => $item['label'] . ' : ' . $item['value'],
                    'icon' => jhtech_spec_icon($item['label']),
                );
            }
            jhtech_build_icon_list($w, $entries);
            if (isset($w['id'])) {
                $w['id'] = substr(md5('jhspec' . $gi), 0, 7);
            }
            $newList[] = $w;
        } else {
            // 레거시 단일 프로토
            $w = $headerProto;
            $texts = array();
            if ($name !== '') {
                $texts[] = '■ ' . $name;
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
    }
    // 컨테이너 전체에서 icon-list를 제거하되, "전역 첫 번째" 위치에 생성분을 통째로 삽입.
    $inserted = false;
    jhtech_specs_rebuild($container, $newList, $inserted);
    return true;
}

/** 컨테이너 내부에서 특정 widgetType 위젯을 문서 순서로 최대 $limit개 수집(값 복사). */
function jhtech_collect_widgets(array $container, $widgetType, $limit)
{
    $out = array();
    if (!isset($container['elements']) || !is_array($container['elements'])) {
        return $out;
    }
    foreach ($container['elements'] as $el) {
        if (count($out) >= $limit) {
            break;
        }
        if (isset($el['widgetType']) && $el['widgetType'] === $widgetType) {
            $out[] = $el;
            continue;
        }
        foreach (jhtech_collect_widgets($el, $widgetType, $limit - count($out)) as $w) {
            $out[] = $w;
        }
    }
    return $out;
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

/**
 * "스페이서 전용" 섹션 판정 — 위젯이 1개 이상 있고 전부 spacer일 때만 true.
 * divider(가로 구분선)·배경만 있는 빈 섹션은 화면에 보이는 요소라 접기 대상이 아니다
 * (어드버서리얼 리뷰 F1 — divider 밴드 무단 삭제 방지).
 */
function jhtech_is_spacer_only(array $el)
{
    $counts = array('spacer' => 0, 'other' => 0);
    jhtech_count_widgets($el, $counts);
    return $counts['spacer'] > 0 && $counts['other'] === 0;
}

function jhtech_count_widgets(array $el, array &$counts)
{
    if (isset($el['widgetType'])) {
        if ($el['widgetType'] === 'spacer') {
            $counts['spacer']++;
        } else {
            $counts['other']++;
        }
    }
    if (isset($el['elements']) && is_array($el['elements'])) {
        foreach ($el['elements'] as $c) {
            if (is_array($c)) {
                jhtech_count_widgets($c, $counts);
            }
        }
    }
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

    // 모델명 — 템플릿에 여러 자리(제목 아래·사양 이미지 아래)가 있을 수 있어 "전부" 치환.
    // (다른 텍스트 슬롯은 첫 매칭만 — 모델명만 다중 배치 관행이라 전체 채움)
    $model = isset($payload['model']) ? (string) $payload['model'] : '';
    if ($model !== '') {
        jhtech_walk($tree, function (&$el) use ($model) {
            if (jhtech_el_has_class($el, 'jh-slot-model')) {
                jhtech_set_text($el, $model);
            }
            return true;
        });
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
        'model' => $model !== '',
    );
    $removedAny = false;
    jhtech_walk($tree, function (&$el) use ($hasData, $images, $videos, &$removedAny) {
        foreach (jhtech_el_classes($el) as $cls) {
            if (preg_match('/^jh-if-image-(\d{2})$/', $cls, $m)) {
                if (!isset($images[((int) $m[1]) - 1])) {
                    $removedAny = true;
                    return false;
                }
            } elseif (preg_match('/^jh-if-video-(\d{2})$/', $cls, $m)) {
                if (!isset($videos[((int) $m[1]) - 1])) {
                    $removedAny = true;
                    return false;
                }
            } elseif (preg_match('/^jh-if-(subtitle|series|features|specs|model)$/', $cls, $m)) {
                if (!$hasData[$m[1]]) {
                    $removedAny = true;
                    return false;
                }
            }
        }
        return true;
    });

    // 밴드 제거로 "스페이서 전용" 최상위 섹션이 연속되면 1개만 남긴다 — 원본은 밴드 사이
    // 간격 1개가 규칙인데, 사이 밴드가 제거되면 스페이서가 겹쳐 큰 빈 공백이 생긴다.
    // jh-if 제거가 실제로 일어난 sync에서만 접는다 — 제거 없는 트리는 템플릿이 의도한
    // 간격이므로 건드리지 않는다(어드버서리얼 F2). divider·빈 섹션은 제외(F1).
    if ($removedAny) {
        $collapsed = array();
        $prevSpacerOnly = false;
        foreach ($tree as $sec) {
            $spacerOnly = jhtech_is_spacer_only($sec);
            if ($spacerOnly && $prevSpacerOnly) {
                continue;
            }
            $collapsed[] = $sec;
            $prevSpacerOnly = $spacerOnly;
        }
        $tree = $collapsed;
    }

    // 위젯 id 전면 재발급(템플릿·기존 글과 충돌 방지). seed로 결정적 — 같은 입력 = 같은 트리(해시 안정).
    $seed = isset($payload['seed']) ? (string) $payload['seed'] : 'jhtech';
    jhtech_uniquify_ids($tree, $seed);

    return array('tree' => $tree, 'errors' => $errors);
}
