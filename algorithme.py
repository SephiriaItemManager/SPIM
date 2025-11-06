# --- 0. config.py (상수 관리 파일) ---
# 실제 프로젝트에서는 별도 파일로 분리하는 것이 좋습니다.
# 여기서는 편의를 위해 하나의 파일에 포함합니다.

RARITY_WEIGHTS = {
    "Common": 1.0, "UnCommon": 1.2, "Rare": 1.5, "Legendary": 2.5, "Solidarity": 2.0
}
PROPERTY_BOOST_MAJOR = 300
PROPERTY_BOOST_MINOR = 100
COMBO_BONUS_PER_LEVEL = 500

# 시뮬레이티드 어닐링 파라미터
SA_ITERATIONS = 200000  # 반복 횟수 (20만)
SA_INITIAL_TEMP = 2000.0 # 초기 온도
SA_COOLING_RATE = 0.9999 # 냉각 속도

# 페널티 관련 설정
PENALTY_VIOLATION_STRONG = 1000 # 조건 위반 시 강한 페널티 (저온에서 적용)
PENALTY_SLATE_MISPLACED_STRONG = 500 # 석판 조건 불일치 시 강한 페널티 (저온에서 적용)

# '영원의 식' 관련 태그
FIRE_TAGS = {"잉걸불", "태양검"}
ICE_TAGS = {"빙하", "얼음무구"}

# --- END OF config.py ---

import json
import random
import copy
import math
from flask import Flask, request, jsonify
from flask_cors import CORS
# from numba import njit # Numba JIT 컴파일러 임포트 - 복잡한 dict/set 작업에 직접 적용 어려움, 특정 sub-function에 고려

# --- 1. 설정 및 데이터 로딩 ---
app = Flask(__name__)
CORS(app) 

artifact_db = {}
slate_db = {}

try:
    with open('artifacts.json', 'r', encoding='utf-8') as f:
        artifact_db = {item['id']: item for item in json.load(f)}
    with open('slates.json', 'r', encoding='utf-8') as f:
        slate_db = {item['id']: item for item in json.load(f)}
except FileNotFoundError:
    print("오류: artifacts.json 또는 slates.json 파일을 찾을 수 없습니다. JSON 파일을 확인해주세요.")
    # 실제 운영 환경에서는 서버 시작을 중단하거나 적절한 오류 처리를 해야 합니다.
    # 예: exit(1) 또는 raise FileNotFoundError(...)

# --- 2. 핵심 함수: 점수 계산기 ---

def _get_item_data(item_id, item_type):
    """ID와 타입에 따라 artifact 또는 slate 데이터를 반환합니다."""
    if item_type == 'artifact':
        return artifact_db.get(item_id)
    elif item_type == 'slate':
        return slate_db.get(item_id)
    return None

def _get_transformed_tags(artifact_tags, transform_mode, x_pos, board_width):
    """'영원의 식' 모드에 따라 태그를 변환합니다."""
    current_tags = set(artifact_tags)
    
    # '영원의 식'은 인벤토리 왼편/오른편에 따라 다르게 작동
    is_left_side = x_pos < board_width / 2

    if transform_mode == "화염 지배":
        # 사용자의 설정에 따라 '얼음무구'가 '잉걸불'로 변환 (왼편)
        if is_left_side and "얼음무구" in current_tags:
            current_tags.discard("얼음무구")
            current_tags.add("잉걸불")
        # 오른편에서는 반대로 (태양검이 빙하로 변환)
        elif not is_left_side and "태양검" in current_tags:
            current_tags.discard("태양검")
            current_tags.add("빙하")

    elif transform_mode == "냉기 지배":
        # 사용자의 설정에 따라 '태양검'이 '빙하'로 변환 (왼편)
        if is_left_side and "태양검" in current_tags:
            current_tags.discard("태양검")
            current_tags.add("빙하")
        # 오른편에서는 반대로 (얼음무구가 잉걸불로 변환)
        elif not is_left_side and "얼음무구" in current_tags:
            current_tags.discard("얼음무구")
            current_tags.add("잉걸불")
            
    return current_tags

def calculate_score(board, board_width, board_height, global_effects, current_temp):
    """
    주어진 보드 배치에 대한 총 점수를 계산합니다.
    current_temp는 시뮬레이티드 어닐링의 현재 온도를 나타내며, 페널티 강도 조절에 사용됩니다.
    """
    total_score = 0
    
    # --- 사전 계산 단계 ---
    
    # 1. 태그 카운트, 특수 아티팩트 분류, '영원의 식' 태그 변환
    # '하얀 종이' 효과를 위해 초기 태그 카운트를 먼저 세지 않고,
    # temp_tags_map만 생성한 후 '하얀 종이' 효과 적용 후 최종 태그 카운트를 계산합니다.
    
    special_artifacts_data = {'adaptive': [], 'tag_match': []} # 'tag_match'는 하얀 종이
    temp_tags_map = {} # (y, x) -> set(tags)

    transform_mode = global_effects.get('artifact_186') # '영원의 식' 모드

    for y in range(board_height):
        for x in range(board_width):
            cell = board[y][x]
            if not cell or cell['type'] != 'artifact': continue

            artifact = _get_item_data(cell['id'], cell['type'])
            if not artifact: continue

            # '영원의 식' 태그 변환 적용
            original_tags = artifact.get("tags", [])
            transformed_tags = _get_transformed_tags(original_tags, transform_mode, x, board_width)
            temp_tags_map[(y, x)] = transformed_tags
            
            # 특수 아티팩트 분류
            condition = artifact.get('condition', {})
            if isinstance(condition, dict):
                cond_type = condition.get('type')
                if cond_type == 'adaptive_buff':
                    special_artifacts_data['adaptive'].append(artifact)
                elif cond_type == 'adjacent_tag_match': # '하얀 종이'
                    special_artifacts_data['tag_match'].append({'x': x, 'y': y, 'id': cell['id'], 'type': cell['type']})

    # 2. '하얀 종이' 효과 적용 (태그 변경)
    # '하얀 종이'는 태그를 변경하므로, temp_tags_map을 업데이트해야 함
    # 이 단계에서는 아직 tag_counts를 최종적으로 계산하지 않습니다.
    for item_coord in special_artifacts_data['tag_match']:
        x, y = item_coord['x'], item_coord['y']
        
        left_tags = temp_tags_map.get((y, x-1), set()) if x > 0 else set()
        right_tags = temp_tags_map.get((y, x+1), set()) if x < board_width - 1 else set()
        
        common_tags = left_tags.intersection(right_tags)
        
        # '마법서' 태그는 제외
        common_tags.discard("마법서")

        if common_tags:
            # '하얀 종이'의 태그를 공통 태그로 변경 (현재 하얀 종이의 태그는 제거하고 새로운 태그 추가)
            # 하얀 종이 아티팩트 자체의 태그를 '오버라이드'
            temp_tags_map[(y, x)] = common_tags # 여러 공통 태그가 있을 수 있으므로 set 자체를 할당

    # 3. 모든 아티팩트에 대해 최종 태그 카운트 및 '결속' 효과 결정
    tag_counts = {}
    for y in range(board_height):
        for x in range(board_width):
            if (y,x) in temp_tags_map:
                for tag in temp_tags_map[(y,x)]:
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1

    active_global_buffs = {}
    for adapt_artifact in special_artifacts_data['adaptive']:
        options = adapt_artifact.get('condition', {}).get('options', [])
        # tag_counts가 이제 '하얀 종이' 효과가 반영된 최종 태그 카운트임
        best_option = max(options, key=lambda opt: tag_counts.get(opt['tag'], 0), default=None)
        if best_option:
            buff_tag, buff_value = best_option['tag'], best_option['buff']
            active_global_buffs[buff_tag] = active_global_buffs.get(buff_tag, 0) + buff_value
            
    # --- 최종 점수 계산 ---
    
    # 4. 석판 효과 맵 생성
    level_map = [[0 for _ in range(board_width)] for _ in range(board_height)]
    effect_map = [[None for _ in range(board_width)] for _ in range(board_height)]
    
    # 페널티 강도 조절: 온도가 높을수록 (초기) 페널티의 영향이 적고, 온도가 낮아질수록 강해짐.
    # temp가 SA_INITIAL_TEMP일 때 penalty_multiplier는 0에 가까움 (0.01로 최소값 제한)
    # temp가 0에 가까워질 때 penalty_multiplier는 1에 가까움
    penalty_multiplier = max(0.01, 1.0 - (current_temp / SA_INITIAL_TEMP)) 

    for y in range(board_height):
        for x in range(board_width):
            cell = board[y][x]
            if not cell or cell['type'] != 'slate': continue

            slate = _get_item_data(cell['id'], cell['type'])
            if not slate: continue

            rotation = str(cell.get('rotation', 0))
            
            condition = slate.get('condition')
            is_slate_misplaced = False
            if condition == 'bottom_row' and y != board_height - 1: is_slate_misplaced = True
            elif condition == 'top_row' and y != 0: is_slate_misplaced = True
            elif condition == 'horizontal_ends' and not (x == 0 or x == board_width - 1): is_slate_misplaced = True
            
            if is_slate_misplaced:
                # 페널티 점진적 적용: 고온에서는 약하게, 저온에서 PENALTY_SLATE_MISPLACED_STRONG
                total_score -= PENALTY_SLATE_MISPLACED_STRONG * penalty_multiplier
                continue # 석판 효과 적용 없이 다음 셀로

            buffcoords_data = slate.get('buffcoords', [])
            buffcoords = buffcoords_data.get(rotation, []) if slate.get('rotatable') else buffcoords_data
            for buff in buffcoords:
                eff_x, eff_y = x + buff[0], y - buff[1]
                if 0 <= eff_y < board_height and 0 <= eff_x < board_width:
                    if buff[3] != "none": effect_map[eff_y][eff_x] = buff[3]
                    level_map[eff_y][eff_x] += buff[2]

    # 5. 아티팩트 점수 계산
    boost_mode = global_effects.get('artifact_143') # '대립의 천칭' 모드
    
    for y in range(board_height):
        for x in range(board_width):
            cell = board[y][x]
            if not cell or cell['type'] != 'artifact': continue

            artifact_id, artifact = cell['id'], _get_item_data(cell['id'], cell['type'])
            if not artifact: continue

            upgrade_level, user_priority = cell.get('upgrade', 0), cell.get('priority', 1.0)
            
            artifact_level = level_map[y][x] + (upgrade_level * 1)
            
            current_tags = temp_tags_map.get((y, x), set()) # 하얀 종이 등으로 변환된 최종 태그 사용
            for tag in current_tags:
                if tag in active_global_buffs:
                    artifact_level += active_global_buffs[tag]

            is_violated = False
            condition_obj = artifact.get('condition')
            if isinstance(condition_obj, dict):
                condition_type = condition_obj.get('type')
                is_unlockable = condition_obj.get('unlockable', False)
                is_unlocked_by_slate = (effect_map[y][x] == "limitUnlock")

                if not (is_unlocked_by_slate and is_unlockable):
                    # ... (페널티 조건 검사 로직) ...
                    if condition_type == 'top_row' and y != 0: is_violated = True
                    elif condition_type == 'bottom_row' and y != board_height - 1: is_violated = True
                    elif condition_type == 'edge' and not (x == 0 or x == board_width - 1 or y == 0 or y == board_height - 1): is_violated = True
                    elif condition_type == 'inner' and (x == 0 or x == board_width - 1 or y == 0 or y == board_height - 1): is_violated = True
                    elif condition_type == 'adjacent_horizontal_empty':
                        # 옆 칸에 아티팩트가 있는 경우 위반
                        if (x > 0 and board[y][x-1] and board[y][x-1]['type']=='artifact') or \
                           (x < board_width - 1 and board[y][x+1] and board[y][x+1]['type']=='artifact'):
                            is_violated = True
                    elif condition_type == 'requires_grimoire_right':
                        is_violated = True # 일단 위반으로 가정
                        if x < board_width - 1 and board[y][x+1] and board[y][x+1]['type']=='artifact':
                            if "마법서" in temp_tags_map.get((y, x+1), set()):
                                is_violated = False # 마법서가 오른쪽에 있으면 해제
            
            if is_violated: 
                # 페널티 점진적 적용
                artifact_level -= PENALTY_VIOLATION_STRONG * penalty_multiplier

            # 아티팩트 레벨이 0 미만이면 점수에 기여하지 않도록 처리 (완전히 무효화)
            if artifact_level < 0:
                artifact_level = 0

            rarity = artifact.get('rarity', 'Common')
            weight = RARITY_WEIGHTS.get(rarity, 1.0)
            base_score = (artifact_level * weight * user_priority)
            
            # '대립의 천칭' 보너스 적용
            property_boost = 0
            has_fire = any(t in current_tags for t in FIRE_TAGS)
            has_ice = any(t in current_tags for t in ICE_TAGS)
            
            if boost_mode == "불 속성 증폭":
                if has_fire: property_boost += PROPERTY_BOOST_MAJOR
                if has_ice: property_boost += PROPERTY_BOOST_MINOR
            elif boost_mode == "얼음 속성 증폭":
                if has_ice: property_boost += PROPERTY_BOOST_MAJOR
                if has_fire: property_boost += PROPERTY_BOOST_MINOR

            total_score += (base_score + property_boost)

    # 6. 콤보 보너스 점수 추가
    combo_bonus = 0
    for tag, count in tag_counts.items():
        if count >= 2:
            combo_level = count // 2
            combo_bonus += combo_level * COMBO_BONUS_PER_LEVEL
    total_score += combo_bonus
                    
    return total_score

# --- 3. 핵심 함수: 최적 배치 탐색기 ---
def find_optimal_placement(items_with_settings, board_width, board_height, global_effects):
    """
    아이템들을 보드에 최적으로 배치하는 것을 탐색합니다.
    시뮬레이티드 어닐링과 휴리스틱 초기 배치를 사용합니다.
    """
    
    # 보드 높이 동적 계산 (가로 6칸 고정)
    if not items_with_settings:
        return [[None for _ in range(board_width)] for _ in range(board_height)], 0
    
    # items_with_settings의 모든 아이템이 board_width로 채워졌을 때 필요한 최소 높이
    required_height = math.ceil(len(items_with_settings) / board_width)
    board_height = max(board_height, required_height) # API 요청의 height와 비교하여 더 큰 값 사용

    current_board = [[None for _ in range(board_width)] for _ in range(board_height)]
    
    # 휴리스틱 초기 배치
    # _heuristic_initial_placement 함수는 current_board를 직접 수정합니다.
    _heuristic_initial_placement(items_with_settings, current_board, board_width, board_height)

    # placed_items_coords 초기화 및 구성
    placed_items_coords = [] 
    for y in range(board_height):
        for x in range(board_width):
            if current_board[y][x] is not None:
                placed_items_coords.append((y, x))

    current_score = calculate_score(current_board, board_width, board_height, global_effects, SA_INITIAL_TEMP)
    
    best_board = copy.deepcopy(current_board)
    best_score = current_score
    
    temp = SA_INITIAL_TEMP

    for i in range(SA_ITERATIONS):
        temp_board = copy.deepcopy(current_board) # 현재 최적 보드를 복사
        
        # 액션 선택: 스왑(50%), 이동(30%), 회전(20%)
        action_choice = random.random()
        
        # current_board에서 실제 배치된 아이템의 좌표를 다시 얻습니다.
        # 이렇게 함으로써 placed_items_coords의 정확성을 유지합니다.
        current_placed_coords = [(y, x) for y in range(board_height) for x in range(board_width) if current_board[y][x] is not None]

        if current_placed_coords: # 배치된 아이템이 있을 때만 액션 수행
            if action_choice < 0.5 and len(current_placed_coords) >= 2: # 스왑 (50%)
                y1, x1 = random.choice(current_placed_coords)
                y2, x2 = random.choice(current_placed_coords)
                
                while (y1, x1) == (y2, x2): # 같은 위치를 선택했다면 다시 선택
                    y2, x2 = random.choice(current_placed_coords)

                temp_board[y1][x1], temp_board[y2][x2] = temp_board[y2][x2], temp_board[y1][x1]
            
            elif action_choice < 0.8: # 이동 (30%)
                y_item, x_item = random.choice(current_placed_coords) # 이동할 아이템 선택
                
                # 빈 셀 찾기
                empty_cells = [(y, x) for y in range(board_height) for x in range(board_width) if temp_board[y][x] is None]
                
                if empty_cells: # 빈 셀이 있다면 그곳으로 이동
                    y_empty, x_empty = random.choice(empty_cells)
                    temp_board[y_empty][x_empty] = temp_board[y_item][x_item]
                    temp_board[y_item][x_item] = None
                elif len(current_placed_coords) >= 2: # 빈 셀이 없다면 다른 아이템과 스왑 (기존 스왑과 중복 가능)
                    # 자신을 제외한 다른 아이템을 선택
                    other_coords = [(y,x) for y,x in current_placed_coords if (y,x) != (y_item,x_item)]
                    if other_coords:
                        y_other, x_other = random.choice(other_coords)
                        temp_board[y_item][x_item], temp_board[y_other][x_other] = temp_board[y_other][x_other], temp_board[y_item][x_item]
                
            else: # 회전 (20%)
                y, x = random.choice(current_placed_coords)
                cell = temp_board[y][x]
                if cell and cell['type'] == 'slate' and _get_item_data(cell['id'], cell['type']).get('rotatable'):
                    cell['rotation'] = random.choice([0, 90, 180, 270])

        new_score = calculate_score(temp_board, board_width, board_height, global_effects, temp)
        score_diff = new_score - current_score
        
        # 메트로폴리스 기준 (Metropolis Criterion)
        if score_diff > 0 or (temp > 0 and math.exp(score_diff / temp) > random.random()):
            current_board = temp_board # 변경된 보드를 현재 보드로 채택
            current_score = new_score
            
            if current_score > best_score:
                best_score = current_score
                best_board = copy.deepcopy(current_board) # 최고 점수 보드 업데이트
        
        temp *= SA_COOLING_RATE
        
    return best_board, best_score

def _heuristic_initial_placement(items_with_settings, board, board_width, board_height):
    """
    휴리스틱 기반으로 아이템들을 초기 배치합니다.
    - 석판 우선
    - 희귀도 높은 아티팩트 우선
    - 조건부 아티팩트 (상단, 하단 등) 우선
    - 남은 아이템 무작위 배치
    """
    
    # 아이템 분류
    slates = [item for item in items_with_settings if item['type'] == 'slate']
    artifacts = [item for item in items_with_settings if item['type'] == 'artifact']

    # 아티팩트 우선순위 정렬 (희귀도 높은 것, 조건부 있는 것)
    def artifact_sort_key(item_data):
        artifact = _get_item_data(item_data['id'], item_data['type'])
        if not artifact: return 0
        rarity_val = RARITY_WEIGHTS.get(artifact.get('rarity', 'Common'), 1.0)
        condition_type = artifact.get('condition', {}).get('type')
        # 조건이 있는 아티팩트의 우선순위를 높임 (특히 위치 제약이 있는 것)
        condition_val = 10 if condition_type in ['top_row', 'bottom_row', 'edge', 'inner', 'requires_grimoire_right', 'adjacent_tag_match', 'adaptive_buff', 'adjacent_horizontal_empty'] else 0
        return rarity_val * 100 + condition_val # 희귀도와 조건부를 종합하여 우선순위 결정
    
    artifacts.sort(key=artifact_sort_key, reverse=True)

    # 모든 아이템을 한 리스트로 합치되, 석판을 먼저, 그 다음 아티팩트를 배치하도록
    # (석판이 아티팩트 레벨에 영향을 주므로 먼저 배치하는 것이 휴리스틱적으로 유리)
    sorted_items = slates + artifacts
    
    placed_count = 0
    for item_data in sorted_items:
        # 보드 높이와 너비를 벗어나지 않도록
        if placed_count >= board_width * board_height:
            break 

        y = placed_count // board_width
        x = placed_count % board_width
        
        if y < board_height: # 현재 계산된 보드 높이 내에 있을 때만 배치
            item_data_copy = copy.deepcopy(item_data)
            
            # 석판은 초기에도 무작위 회전 가능성을 줌 (다양한 초기 상태 탐색)
            if item_data_copy['type'] == 'slate' and _get_item_data(item_data_copy['id'], item_data_copy['type']).get('rotatable'):
                item_data_copy['rotation'] = random.choice([0, 90, 180, 270])
            else:
                item_data_copy['rotation'] = 0 # 아티팩트는 기본 0 (회전 불가능)
                
            board[y][x] = item_data_copy
            placed_count += 1
        
    # 남은 빈칸은 None으로 채워져 있음 (board 초기화 시점에서 이미 None으로 채워져 있음)

# --- 4. API 엔드포인트 ---
@app.route('/optimize', methods=['POST'])
def optimize_placement_api():
    data = request.get_json()
    items_with_settings = data.get('items')
    board_width = data.get('width')
    board_height = data.get('height')
    global_effects = data.get('global_effects', {}) # 전역 효과 데이터 받기
    
    # 4a. 에러 핸들링 강화 - 요청 데이터 유효성 검사
    if not isinstance(items_with_settings, list):
        return jsonify({"error": "items는 리스트여야 합니다."}), 400
    if not isinstance(board_width, int) or board_width <= 0:
        return jsonify({"error": "width는 양의 정수여야 합니다."}), 400
    if not isinstance(board_height, int) or board_height <= 0:
        return jsonify({"error": "height는 양의 정수여야 합니다."}), 400

    if board_width != 6: # 5a. 가로 길이는 6칸 고정
        return jsonify({"error": "board_width는 6으로 고정되어야 합니다."}), 400

    # 각 아이템 데이터 유효성 검사
    processed_items = []
    for i, item in enumerate(items_with_settings):
        item_id = item.get('id')
        item_type = item.get('type')

        if not item_id or not isinstance(item_id, str):
            return jsonify({"error": f"items[{i}]: 'id'가 누락되었거나 유효하지 않습니다. (type: {item_type}, id: {item_id})", "item_index": i}), 400
        if item_type not in ['artifact', 'slate']:
            return jsonify({"error": f"items[{i}]: 'type'이 'artifact' 또는 'slate'여야 합니다. (type: {item_type}, id: {item_id})", "item_index": i}), 400
        
        # ID 존재 여부 검사
        if item_type == 'artifact' and item_id not in artifact_db:
            return jsonify({"error": f"items[{i}]: 알 수 없는 아티팩트 ID '{item_id}' (type: {item_type}).", "item_index": i}), 400
        if item_type == 'slate' and item_id not in slate_db:
            return jsonify({"error": f"items[{i}]: 알 수 없는 석판 ID '{item_id}' (type: {item_type}).", "item_index": i}), 400
        
        # upgrade, priority, rotation 기본값 설정 (만약 요청에 없다면)
        item_data_copy = copy.deepcopy(item)
        item_data_copy['upgrade'] = item.get('upgrade', 0)
        item_data_copy['priority'] = item.get('priority', 1.0)
        # rotation은 find_optimal_placement 내부에서 초기화되므로 여기서 강제할 필요 없음 (휴리스틱 배치에서 처리)
        processed_items.append(item_data_copy)

    # 4b. global_effects 데이터 유효성 검사 (예시)
    if not isinstance(global_effects, dict):
        return jsonify({"error": "global_effects는 객체여야 합니다."}), 400
    
    # '영원의 식' 모드 검사
    if 'artifact_186' in global_effects:
        mode = global_effects['artifact_186']
        if mode not in ["화염 지배", "냉기 지배"]:
            return jsonify({"error": "global_effects.artifact_186의 값은 '화염 지배' 또는 '냉기 지배'여야 합니다."}), 400
    # '대립의 천칭' 모드 검사
    if 'artifact_143' in global_effects:
        mode = global_effects['artifact_143']
        if mode not in ["불 속성 증폭", "얼음 속성 증폭"]:
            return jsonify({"error": "global_effects.artifact_143의 값은 '불 속성 증폭' 또는 '얼음 속성 증폭'여야 합니다."}), 400

    # 4c. Numba 적용은 calculate_score의 내부 루프에만 직접적으로 적용될 때 가장 효과적입니다.
    # 복잡한 Python 객체(dict, set)를 다루는 calculate_score 함수 전체에는 @njit을 직접 적용하기 어렵습니다.
    # 대신, calculate_score 내에서 숫자 계산이 많은 부분만 별도 함수로 분리하고 거기에 @njit을 적용할 수 있습니다.
    # 현재 코드 구조에서는 calculate_score가 여러 파이썬 dict/set 조작을 포함하므로 @njit 적용 시 제약이 있을 수 있습니다.
    # 필요시 calculate_score의 특정 서브-함수에만 @njit을 시도해 볼 수 있습니다.
    
    optimal_board, best_score = find_optimal_placement(processed_items, board_width, board_height, global_effects)

    # 최종 응답을 위한 보드 데이터 정리
    final_board_for_response = []
    for row in optimal_board:
        new_row = []
        for cell in row:
            if cell:
                # rotation 필드가 없는 경우 기본값 0 추가
                if 'rotation' not in cell:
                    cell['rotation'] = 0
                new_row.append(cell)
            else:
                new_row.append(None)
        final_board_for_response.append(new_row)

    return jsonify({
        "board": final_board_for_response,
        "score": round(best_score, 2) # 점수를 소수점 둘째 자리까지 반올림
    })

# --- 5. 서버 실행 ---
if __name__ == '__main__':
    app.run(debug=True, port=5000)