import json
import random
import copy
import math
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- 1. 설정 및 데이터 로딩 ---
app = Flask(__name__)
CORS(app) 

RARITY_WEIGHTS = {
    "Common": 1.0, "UnCommon": 1.2, "Rare": 1.5, "Legendary": 2.5, "Solidarity": 2.0
}
# '대립의 천칭' 보너스 점수 (3:1 비율)
PROPERTY_BOOST_MAJOR = 300
PROPERTY_BOOST_MINOR = 100
# 콤보 보너스 점수
COMBO_BONUS_PER_LEVEL = 500
# 페널티 점수
PENALTY_VIOLATION = 1000 
PENALTY_SLATE_MISPLACED = 500

# '영원의 식' 관련 태그
FIRE_TAGS = {"잉걸불", "태양검"}
ICE_TAGS = {"빙하", "얼음무구"}

try:
    with open('artifacts.json', 'r', encoding='utf-8') as f:
        artifact_db = {item['id']: item for item in json.load(f)}
    with open('slates.json', 'r', encoding='utf-8') as f:
        slate_db = {item['id']: item for item in json.load(f)}
except FileNotFoundError:
    print("오류: artifacts.json 또는 slates.json 파일을 찾을 수 없습니다.")
    artifact_db, slate_db = {}, {}

# --- 2. 핵심 함수: 점수 계산기 ---
def calculate_score(board, board_width, board_height, global_effects):
    total_score = 0
    
    # --- 사전 계산 단계 ---
    tag_counts = {}
    special_artifacts = {'adaptive': [], 'tag_match': []}
    
    # '영원의 식' 모드 확인
    transform_mode = global_effects.get('artifact_203') # '영원의 식' ID
    
    # 1. 태그 변환 및 기본 카운트
    temp_tags_map = {} # (y, x) -> set(tags)
    for y in range(board_height):
        for x in range(board_width):
            cell = board[y][x]
            if cell and cell['type'] == 'artifact':
                artifact = artifact_db.get(cell['id'])
                if not artifact: continue
                
                original_tags = set(artifact.get("tags", []))
                
                # '영원의 식' 태그 변환 적용
                if transform_mode == "화염" and "얼음무구" in original_tags:
                    original_tags.add("잉걸불")
                elif transform_mode == "얼음" and "태양검" in original_tags:
                    original_tags.add("빙하")
                    
                temp_tags_map[(y, x)] = original_tags
                
                for tag in original_tags:
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
                
                # 특수 아티팩트 분류
                condition = artifact.get('condition', {})
                if isinstance(condition, dict): # ★★★ 버그 수정: condition이 dict일 때만 type 확인
                    cond_type = condition.get('type')
                    if cond_type == 'adaptive_buff':
                        special_artifacts['adaptive'].append(artifact)
                    elif cond_type == 'adjacent_tag_match':
                        special_artifacts['tag_match'].append({'x': x, 'y': y})

    # 2. '하얀 종이' 효과 적용
    for item in special_artifacts['tag_match']:
        x, y = item['x'], item['y']
        left_tags = temp_tags_map.get((y, x-1), set())
        right_tags = temp_tags_map.get((y, x+1), set())
        
        common_tags = left_tags.intersection(right_tags)
        for tag in common_tags:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1 # 콤보 카운트 +1

    # 3. '결속' 아티팩트 효과 결정
    active_global_buffs = {}
    for adapt_artifact in special_artifacts['adaptive']:
        options = adapt_artifact.get('condition', {}).get('options', [])
        best_option = max(options, key=lambda opt: tag_counts.get(opt['tag'], 0), default=None)
        if best_option:
            buff_tag, buff_value = best_option['tag'], best_option['buff']
            active_global_buffs[buff_tag] = active_global_buffs.get(buff_tag, 0) + buff_value
            
    # --- 최종 점수 계산 ---
    
    # 4. 석판 효과 맵 생성
    level_map = [[0 for _ in range(board_width)] for _ in range(board_height)]
    effect_map = [[None for _ in range(board_width)] for _ in range(board_height)]
    for y in range(board_height):
        for x in range(board_width):
            cell = board[y][x]
            if cell and cell['type'] == 'slate':
                slate = slate_db.get(cell['id'])
                if not slate: continue
                
                rotation = str(cell.get('rotation', 0))
                
                condition = slate.get('condition')
                if condition == 'bottom_row' and y != board_height - 1: total_score -= PENALTY_SLATE_MISPLACED; continue
                elif condition == 'top_row' and y != 0: total_score -= PENALTY_SLATE_MISPLACED; continue
                elif condition == 'horizontal_ends' and not (x == 0 or x == board_width - 1): total_score -= PENALTY_SLATE_MISPLACED; continue
                
                buffcoords_data = slate.get('buffcoords', [])
                buffcoords = buffcoords_data.get(rotation, []) if slate.get('rotatable') else buffcoords_data
                for buff in buffcoords:
                    eff_x, eff_y = x + buff[0], y - buff[1]
                    if 0 <= eff_y < board_height and 0 <= eff_x < board_width:
                        if buff[3] != "none": effect_map[eff_y][eff_x] = buff[3]
                        level_map[eff_y][eff_x] += buff[2]

    # 5. 아티팩트 점수 계산
    boost_mode = global_effects.get('artifact_142') # '대립의 천칭' ID
    
    for y in range(board_height):
        for x in range(board_width):
            cell = board[y][x]
            if cell and cell['type'] == 'artifact':
                artifact = artifact_db.get(cell['id'])
                if not artifact: continue
                
                upgrade_level, user_priority = cell.get('upgrade', 0), cell.get('priority', 1.0)
                
                artifact_level = level_map[y][x] + (upgrade_level * 1)
                
                current_tags = temp_tags_map.get((y, x), set())
                for tag in current_tags:
                    if tag in active_global_buffs:
                        artifact_level += active_global_buffs[tag]

                is_violated = False
                condition_obj = artifact.get('condition') # ★★★ 버그 수정
                
                if isinstance(condition_obj, dict): # ★★★ 버그 수정: dict일 때만 검사
                    condition_type = condition_obj.get('type')
                    is_unlockable = condition_obj.get('unlockable', False)
                    is_unlocked_by_slate = (effect_map[y][x] == "limitUnlock")

                    if not (is_unlocked_by_slate and is_unlockable):
                        if condition_type == 'top_row' and y != 0: is_violated = True
                        elif condition_type == 'bottom_row' and y != board_height - 1: is_violated = True
                        elif condition_type == 'edge' and not (x == 0 or x == board_width - 1 or y == 0 or y == board_height - 1): is_violated = True
                        elif condition_type == 'inner' and (x == 0 or x == board_width - 1 or y == 0 or y == board_height - 1): is_violated = True
                        elif condition_type == 'adjacent_horizontal_empty':
                            if (x > 0 and board[y][x-1] and board[y][x-1]['type']=='artifact') or \
                               (x < board_width - 1 and board[y][x+1] and board[y][x+1]['type']=='artifact'):
                                is_violated = True
                        elif condition_type == 'requires_grimoire_right':
                            is_violated = True
                            if x < board_width - 1 and board[y][x+1] and board[y][x+1]['type']=='artifact':
                                if "마법서" in temp_tags_map.get((y, x+1), set()):
                                    is_violated = False
                
                if is_violated: artifact_level -= PENALTY_VIOLATION

                if artifact_level >= 0:
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
def find_optimal_placement(items_with_settings, board_width, board_height, global_effects, iterations=150000):
    current_board = [[None for _ in range(board_width)] for _ in range(board_height)]
    empty_cells = [(y, x) for y in range(board_height) for x in range(board_width)]
    random.shuffle(empty_cells)
    
    placed_items_coords = []
    
    # 아이템 개수가 슬롯보다 많으면 자르기
    items_to_place = items_with_settings[:len(empty_cells)]
    
    for i, item_data in enumerate(items_to_place):
        y, x = empty_cells[i]
        item_data['rotation'] = 0
        current_board[y][x] = item_data
        placed_items_coords.append((y,x))

    current_score = calculate_score(current_board, board_width, board_height, global_effects)
    
    best_board = copy.deepcopy(current_board)
    best_score = current_score
    
    initial_temp = 1000.0
    cooling_rate = 0.9998
    temp = initial_temp

    for i in range(iterations):
        if temp <= 0.1:
            break
            
        temp_board = copy.deepcopy(current_board)
        action = random.choice([0, 0, 0, 1]) # 스왑 75%, 회전 25%
        
        # 현재 배치된 아이템 좌표 다시 찾기 (이동으로 인해 바뀔 수 있음)
        current_placed_coords = [(y, x) for y in range(board_height) for x in range(board_width) if temp_board[y][x] is not None]
        
        if not current_placed_coords:
            continue

        if action == 0 and len(current_placed_coords) >= 2: # 스왑
            y1, x1 = random.choice(current_placed_coords)
            
            # 다른 아이템 또는 빈 칸과 스왑
            all_cells = [(y, x) for y in range(board_height) for x in range(board_width)]
            y2, x2 = random.choice(all_cells)
            
            # 같은 위치면 다시 선택 (무한 루프 방지)
            if (y1, x1) == (y2, x2) and len(all_cells) > 1:
                while (y1, x1) == (y2, x2):
                    y2, x2 = random.choice(all_cells)

            temp_board[y1][x1], temp_board[y2][x2] = temp_board[y2][x2], temp_board[y1][x1]
            
        elif action == 1: # 회전
            y, x = random.choice(current_placed_coords)
            cell = temp_board[y][x]
            if cell and cell['type'] == 'slate':
                slate = slate_db.get(cell['id'])
                if slate and slate.get('rotatable'):
                    cell['rotation'] = random.choice([0, 90, 180, 270])

        new_score = calculate_score(temp_board, board_width, board_height, global_effects)
        score_diff = new_score - current_score
        
        if score_diff > 0 or math.exp(score_diff / temp) > random.random():
            current_board = temp_board
            current_score = new_score
            
            if current_score > best_score:
                best_score = current_score
                best_board = copy.deepcopy(current_board)
        
        temp *= cooling_rate
            
    return best_board, best_score

# --- 4. API 엔드포인트 ---
@app.route('/optimize', methods=['POST'])
def optimize_placement_api():
    data = request.get_json()
    items_with_settings = data.get('items')
    board_width = data.get('width')
    board_height = data.get('height')
    global_effects = data.get('global_effects', {})
    
    if not all([items_with_settings is not None, board_width, board_height]):
        return jsonify({"error": "필요한 데이터가 누락되었습니다."}), 400

    optimal_board, best_score = find_optimal_placement(items_with_settings, board_width, board_height, global_effects)

    return jsonify({
        "board": optimal_board,
        "score": best_score
    })

# --- 5. 서버 실행 ---
if __name__ == '__main__':
    app.run(debug=True, port=5000)