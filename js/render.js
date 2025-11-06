import { getOwnedItems, getInventoryState, getCurrentItemType, getGlobalEffectModes, setGlobalEffectModes } from './state.js';
import { getArtifactDB, getSlateDB } from './api.js'; // DB는 API를 통해 가져오거나, main에서 로드 후 전달
import { calculateAllBuffs, isSlotAvailable } from './utils.js';
import { 
    getItemList, getInventoryGrid, getSelectedSlatesList, 
    getSelectedArtifactsList, getGlobalEffectsContainer, 
    getSlotCountLabel, getRarityFilter, getNameSearch, 
    getRealtimeScoreValue 
} from './dom-elements.js';
import { RARITY_WEIGHTS, MAX_POSSIBLE_SCORE } from './constants.js'; // 상수 불러오기

// 1. 아이템 목록 렌더링
export function renderItems() {
    const itemList = getItemList();
    const rarityFilter = getRarityFilter();
    const nameSearch = getNameSearch();
    const ownedItems = getOwnedItems();
    const currentItemType = getCurrentItemType();
    const artifactDB = getArtifactDB(); // DB는 main에서 로드 후 setDB 함수로 주입하는 방식도 고려
    const slateDB = getSlateDB();

    const db = (currentItemType === 'artifacts') ? artifactDB : slateDB;
    const rarityValue = rarityFilter.value;
    const searchValue = nameSearch.value.toLowerCase();
    
    itemList.innerHTML = '';
    db.filter(item => {
        const rarityMatch = rarityValue === 'all' || item.rarity === rarityValue;
        const nameMatch = item.name.toLowerCase().includes(searchValue);
        return rarityMatch && nameMatch;
    }).forEach(item => {
        const count = ownedItems[item.id] || 0;
        const card = document.createElement('div');
        card.className = 'item-card';
        card.dataset.itemId = item.id;
        card.innerHTML = `
            <img src="images/${item.icon}" alt="${item.name}">
            <p class="rarity-${item.rarity}">${item.name}</p>
            <div class="stack-display">${count}</div>
        `;
        itemList.appendChild(card);
    });
}

// 2. 인벤토리 슬롯 업데이트 (초기 생성 및 아이템 이동/제거 후 전체 재렌더링)
// 이 함수는 주로 슬롯 개수 변경, 초기화, 최적화 배치 시 사용
export function updateInventoryGrid(slotCount) {
    const inventoryGrid = getInventoryGrid();
    const slotCountLabel = getSlotCountLabel();
    const inventoryState = getInventoryState();
    const artifactDB = getArtifactDB();
    const slateDB = getSlateDB();

    slotCountLabel.textContent = slotCount;
    inventoryGrid.innerHTML = '';
    
    const allBuffs = calculateAllBuffs(inventoryState, slotCount, slateDB);

    for (let i = 0; i < slotCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        slot.dataset.slotId = i;
        if (inventoryState[i]) {
            renderSlot(slot, inventoryState[i], allBuffs, artifactDB, slateDB);
        } else if (allBuffs.levelMap[i] > 0) { // 빈 칸에 버프 표시
             slot.innerHTML = `<div class="empty-slot-buff">+${allBuffs.levelMap[i]}</div>`;
        }
        inventoryGrid.appendChild(slot);
    }
    updateSelectedItems(); // 인벤토리 변경 시 선택된 아이템 목록도 업데이트
    renderItems(); // 인벤토리 변경 시 보유 아이템 수량 표시를 위해 아이템 목록도 업데이트
}

// 3. 개별 슬롯 UI 렌더링 (뱃지, 회전 포함)
export function renderSlot(slotElement, itemState, buffs, artifactDB, slateDB) {
    // DB를 인자로 받아 유연성 확보
    artifactDB = artifactDB || getArtifactDB();
    slateDB = slateDB || getSlateDB();
    buffs = buffs || calculateAllBuffs(getInventoryState(), getInventoryState().length, slateDB);

    if (!itemState) {
        slotElement.innerHTML = '';
        delete slotElement.dataset.itemId;
        // 빈 칸일 때도 버프가 있으면 표시
        const slotId = parseInt(slotElement.dataset.slotId);
        if (buffs.levelMap[slotId] > 0) {
            slotElement.innerHTML = `<div class="empty-slot-buff">+${buffs.levelMap[slotId]}</div>`;
        }
        return;
    }

    const dbItem = artifactDB.find(d => d.id === itemState.id) || slateDB.find(d => d.id === itemState.id);
    slotElement.dataset.itemId = itemState.id;
    
    let badgeHTML = '';
    const isArtifact = !!dbItem.rarity; // 아티팩트는 rarity 필드가 있음

    if (isArtifact) {
        badgeHTML = `<div class="item-badge badge-artifact">${itemState.upgrade}/${dbItem.maxUpgrade}</div>`;
    } else {
        const slate = slateDB.find(s => s.id === itemState.id);
        let totalBoost = 0;
        // buffcoords가 배열 안에 배열인 경우, itemState.rotation에 해당하는 인덱스를 사용
        const buffcoords_data = slate.buffcoords || [];
        const buffcoords = slate.rotatable ? buffcoords_data[String(itemState.rotation)] : buffcoords_data;
        
        if (buffcoords) {
            buffcoords.forEach(coord => {
                if (coord[2] > 0) totalBoost += coord[2];
            });
        }
        if (totalBoost > 0) badgeHTML = `<div class="item-badge badge-slate">+${totalBoost}</div>`;
    }
    slotElement.innerHTML = `<img src="images/${dbItem.icon}" alt="${dbItem.name}" style="transform: rotate(${itemState.rotation || 0}deg);"> ${badgeHTML}`;
}

// 4. 선택된 아이템 목록 UI 업데이트
export function updateSelectedItems() {
    const selectedSlatesList = getSelectedSlatesList();
    const selectedArtifactsList = getSelectedArtifactsList();
    const globalEffectsContainer = getGlobalEffectsContainer();
    const inventoryState = getInventoryState();
    const globalEffectModes = getGlobalEffectModes();
    const artifactDB = getArtifactDB();
    const slateDB = getSlateDB();

    selectedSlatesList.innerHTML = '';
    selectedArtifactsList.innerHTML = '';
    globalEffectsContainer.innerHTML = '';

    const globalEffectArtifacts = [];
    let hasGlobalEffectsPanel = false;

    inventoryState.forEach((itemState, index) => {
        if (!itemState) return;

        const dbItem = artifactDB.find(d => d.id === itemState.id) || slateDB.find(d => d.id === itemState.id);
        const isArtifact = !!dbItem.rarity;

        if (!isArtifact) {
            const icon = document.createElement('img');
            icon.src = `images/${dbItem.icon}`;
            icon.alt = dbItem.name;
            selectedSlatesList.appendChild(icon);
        } else {
            const card = document.createElement('div');
            card.className = 'selected-item-card';
            card.dataset.inventoryIndex = index;
            card.innerHTML = `
                <img src="images/${dbItem.icon}" alt="${dbItem.name}">
                <div class="item-info">
                    <p class="rarity-${dbItem.rarity}">${dbItem.name}</p>
                    <div class="item-controls-group">
                        <div class="item-controls">
                            <span>강화:</span>
                            <button class="control-btn enchant-btn" data-change="-1">-</button>
                            <span>${itemState.upgrade}</span>
                            <button class="control-btn enchant-btn" data-change="1">+</button>
                        </div>
                        <div class="item-controls">
                            <span>중요도:</span>
                            <button class="control-btn priority-btn" data-change="-1">-</button>
                            <span>${itemState.priority}</span>
                            <button class="control-btn priority-btn" data-change="1">+</button>
                        </div>
                    </div>
                </div>`;
            selectedArtifactsList.appendChild(card);

            // 전역 효과 아티팩트인지 확인
            if (typeof dbItem.condition === 'object' && (dbItem.condition.type === 'global_tag_transform' || dbItem.condition.type === 'global_stat_focus' || dbItem.condition.type === 'global_property_boost')) {
                globalEffectArtifacts.push(dbItem);
                hasGlobalEffectsPanel = true;
            }
        }
    });

    // 전역 효과 UI 생성
    if (hasGlobalEffectsPanel) {
        let panelHTML = '<div class="global-effects-panel"><h3>전역 효과</h3>';
        globalEffectArtifacts.forEach(artifact => {
            const condition = artifact.condition;
            let modesHTML = '';
            // 이전에 선택한 값이 없으면 첫 번째 옵션을 기본값으로 설정 (상태 업데이트)
            if (!globalEffectModes[artifact.id]) {
                const newModes = { ...globalEffectModes, [artifact.id]: condition.modes[0].name };
                setGlobalEffectModes(newModes);
            }
            const isChecked = (globalEffectModes[artifact.id] === condition.modes[0].name); // 수정 필요: 실제 선택된 mode와 비교

            condition.modes.forEach((mode, index) => {
                const isCheckedMode = (getGlobalEffectModes()[artifact.id] === mode.name);
                modesHTML += `
                    <label>
                        <input type="radio" name="${artifact.id}" value="${mode.name}" ${isCheckedMode ? 'checked' : ''}>
                        ${mode.name}
                    </label>
                `;
            });

            panelHTML += `
                <div class="global-effect-card">
                    <p class="rarity-${artifact.rarity}">${artifact.name}</p>
                    <div class="global-effect-modes" data-artifact-id="${artifact.id}">
                        ${modesHTML}
                    </div>
                </div>
            `;
        });
        panelHTML += '</div>';
        globalEffectsContainer.innerHTML = panelHTML;
    }
    
    updateRealtimeScore();
}

// 5. 실시간 점수 계산 및 표시
export function updateRealtimeScore() {
    let currentScore = 0;
    const inventoryState = getInventoryState();
    const artifactDB = getArtifactDB();
    const slateDB = getSlateDB(); // calculateAllBuffs에 필요
    const buffs = calculateAllBuffs(inventoryState, inventoryState.length, slateDB);

    inventoryState.forEach((itemState, index) => {
        if (itemState && itemState.id.startsWith('artifact_')) {
            const dbItem = artifactDB.find(a => a.id === itemState.id);
            if (!dbItem) return;

            let artifactLevel = buffs.levelMap[index] + (itemState.upgrade * 1);
            let isViolated = false;

            if (typeof dbItem.condition === 'object' && dbItem.condition.type) {
                 // 조건 충족 여부 검사
                 // unlockable 조건은 isSlotAvailable에서 처리하기 복잡하므로, 일단 버프가 limitUnlock이면 통과시키는 로직 추가
                 if (buffs.effectMap[index] !== "limitUnlock" || !dbItem.condition.unlockable) {
                    isViolated = !isSlotAvailable(index, dbItem.condition, inventoryState, inventoryState.length);
                 }
            }
            
            if (!isViolated) {
                 const weight = RARITY_WEIGHTS[dbItem.rarity] || 1.0;
                 currentScore += (artifactLevel * weight * itemState.priority);
            }
        }
    });
    
    const percentageScore = Math.min(100, (currentScore / MAX_POSSIBLE_SCORE) * 100);
    const scoreDisplay = getRealtimeScoreValue();
    if(scoreDisplay) scoreDisplay.textContent = `${percentageScore.toFixed(0)} / 100`;
}

// (참고: DB 로딩 함수는 main.js 또는 api.js에서 처리하고, render.js에서는 getter를 통해 접근)
// artifactDB, slateDB를 외부에서 주입받는 방식으로 변경
let _artifactDB = [];
let _slateDB = [];

export function setDB(artifactData, slateData) {
    _artifactDB = artifactData;
    _slateDB = slateData;
}
export function getArtifactDBRender() { return _artifactDB; } // render 전용 getter
export function getSlateDBRender() { return _slateDB; } // render 전용 getter