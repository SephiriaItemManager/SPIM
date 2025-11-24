// js/render.js
import { getOwnedItems, getInventoryState, getCurrentItemType, getGlobalEffectModes, getArtifactDB, getSlateDB, getDBItem, getSlotCount, getState } from './state.js';
import { calculateAllBuffs, isSlotAvailable } from './utils.js';
import { getItemList, getInventoryGrid, getSelectedSlatesList, getSelectedArtifactsList, getGlobalEffectsContainer, getSlotCountLabel, getRarityFilter, getNameSearch, getRealtimeScoreValue, getTagFilter } from './dom-elements.js';
import { RARITY_WEIGHTS, MAX_POSSIBLE_SCORE } from './constants.js';

export function renderAll() {
    updateTagOptions(); // ★★★ 태그 목록 갱신 추가 ★★★
    renderItems();
    renderInventoryGrid();
    updateSelectedItems();
}

// ★★★ 태그 옵션 생성 함수 (새로 추가됨) ★★★
function updateTagOptions() {
    const currentItemType = getCurrentItemType();
    const db = (currentItemType === 'artifacts') ? Object.values(getArtifactDB()) : Object.values(getSlateDB());
    const tagFilter = getTagFilter();
    
    if (!tagFilter) return;

    const currentSelection = tagFilter.value;
    const allTags = new Set();

    // 현재 DB에 있는 모든 태그 수집
    db.forEach(item => {
        if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach(tag => allTags.add(tag));
        }
    });

    // 옵션 초기화 및 재생성
    tagFilter.innerHTML = '<option value="all">모든 태그</option>';
    
    Array.from(allTags).sort().forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagFilter.appendChild(option);
    });

    // 선택값 유지
    if (Array.from(allTags).includes(currentSelection)) {
        tagFilter.value = currentSelection;
    } else {
        tagFilter.value = 'all';
    }
}

export function renderItems() {
    const itemList = getItemList();
    const rarityValue = getRarityFilter().value;
    const searchValue = getNameSearch().value.toLowerCase();
    
    // ★★★ 태그 필터 값 가져오기 ★★★
    const tagFilter = getTagFilter();
    const tagValue = tagFilter ? tagFilter.value : 'all';

    const ownedItems = getOwnedItems();
    const currentItemType = getCurrentItemType();
    const db = (currentItemType === 'artifacts') ? Object.values(getArtifactDB()) : Object.values(getSlateDB());
    
    itemList.innerHTML = '';
    
    const filteredItems = db.filter(item => {
        // 1. 희귀도 필터
        const rarityMatch = rarityValue === 'all' || item.rarity === rarityValue;
        
        // 2. 이름 검색 필터
        const nameMatch = item.name.toLowerCase().includes(searchValue);
        
        // 3. 태그 필터
        let tagMatch = true;
        if (tagValue !== 'all') {
            tagMatch = item.tags && item.tags.includes(tagValue);
        }

        return rarityMatch && nameMatch && tagMatch;
    });

    filteredItems.forEach(item => {
        const count = ownedItems[item.id]?.count || 0;
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

export function renderInventoryGrid() {
    const inventoryGrid = getInventoryGrid();
    const slotCount = getSlotCount();
    const inventoryState = getInventoryState();
    const buffs = calculateAllBuffs();

    getSlotCountLabel().textContent = slotCount;
    inventoryGrid.innerHTML = '';
    
    for (let i = 0; i < slotCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        slot.dataset.slotId = i;
        const itemState = inventoryState[i];
        
        if (itemState) {
            renderSlot(slot, i, itemState, buffs);
        } else if (buffs.levelMap[i] > 0) {
             slot.innerHTML = `<div class="empty-slot-buff">+${buffs.levelMap[i]}</div>`;
        }
        inventoryGrid.appendChild(slot);
    }
}

function renderSlot(slotElement, slotIndex, itemState, buffs) {
    const dbItem = getDBItem(itemState.id);
    if (!dbItem) return;

    slotElement.dataset.itemId = itemState.id;
    let badgeHTML = '';
    const isArtifact = itemState.type === 'artifact';

    const totalLevel = (buffs.levelMap[slotIndex] || 0) + (itemState.upgrade || 0);
    const maxUpgrade = dbItem.maxUpgrade || 0;

    if (isArtifact) {
        badgeHTML = `<div class="item-badge badge-artifact">${totalLevel}/${maxUpgrade}</div>`;
    } else {
        badgeHTML = `<div class="item-badge badge-slate">${itemState.upgrade || 0}/${maxUpgrade}</div>`;
    }
    
    slotElement.innerHTML = `<img src="images/${dbItem.icon}" alt="${dbItem.name}" style="transform: rotate(${itemState.rotation || 0}deg);" draggable="true"> ${badgeHTML}`;
}

function updateSelectedItems() {
    const selectedSlatesList = getSelectedSlatesList();
    const selectedArtifactsList = getSelectedArtifactsList();
    const globalEffectsContainer = getGlobalEffectsContainer();
    const ownedItems = getOwnedItems();
    const globalEffectModes = getGlobalEffectModes();

    selectedSlatesList.innerHTML = '';
    selectedArtifactsList.innerHTML = '';
    globalEffectsContainer.innerHTML = '';
    const globalEffectArtifacts = [];
    let hasGlobalEffectsPanel = false;

    Object.keys(ownedItems).forEach(itemId => {
        const itemState = ownedItems[itemId];
        const dbItem = itemState.item;
        const isArtifact = !!dbItem.rarity;

        if (!isArtifact) {
            for (let i = 0; i < itemState.count; i++) {
                const icon = document.createElement('img');
                icon.src = `images/${dbItem.icon}`;
                icon.alt = dbItem.name;
                selectedSlatesList.appendChild(icon);
            }
        } else {
            const card = document.createElement('div');
            card.className = 'selected-item-card';
            card.dataset.itemId = dbItem.id;
            card.innerHTML = `
                <img src="images/${dbItem.icon}" alt="${dbItem.name}">
                <div class="item-info">
                    <p class="rarity-${dbItem.rarity}">${dbItem.name} (x${itemState.count})</p>
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

            if (typeof dbItem.condition === 'object' && dbItem.condition && (dbItem.condition.type === 'global_tag_transform' || dbItem.condition.type === 'global_stat_focus' || dbItem.condition.type === 'global_property_boost')) {
                globalEffectArtifacts.push(dbItem);
                hasGlobalEffectsPanel = true;
            }
        }
    });

    if (hasGlobalEffectsPanel) {
        let panelHTML = '<div class="global-effects-panel"><h3>전역 효과</h3>';
        globalEffectArtifacts.forEach(artifact => {
            const condition = artifact.condition;
            let modesHTML = '';
            condition.modes.forEach(mode => {
                const isChecked = (globalEffectModes[artifact.id] === mode.name);
                modesHTML += `
                    <label>
                        <input type="radio" name="${artifact.id}" value="${mode.name}" ${isChecked ? 'checked' : ''}>
                        ${mode.name}
                    </label>`;
            });
            panelHTML += `
                <div class="global-effect-card">
                    <p class="rarity-${artifact.rarity}">${artifact.name}</p>
                    <div class="global-effect-modes" data-artifact-id="${artifact.id}">
                        ${modesHTML}
                    </div>
                </div>`;
        });
        panelHTML += '</div>';
        globalEffectsContainer.innerHTML = panelHTML;
    }
    
    updateRealtimeScore();
}

function updateRealtimeScore() {
    let currentScore = 0;
    const { inventory: inventoryState, slotCount } = getState();
    const buffs = calculateAllBuffs();

    inventoryState.forEach((itemState, index) => {
        if (itemState && itemState.type === 'artifact') {
            const dbItem = getDBItem(itemState.id);
            if (!dbItem) return;

            let artifactLevel = buffs.levelMap[index] + (itemState.upgrade * 1);
            let isViolated = false;

            if (typeof dbItem.condition === 'object' && dbItem.condition && dbItem.condition.type) {
                 if (buffs.effectMap[index] !== "limitUnlock" || !dbItem.condition.unlockable) {
                    isViolated = !isSlotAvailable(index, dbItem.condition, inventoryState, slotCount);
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
