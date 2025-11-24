// js/render.js
import { getOwnedItems, getInventoryState, getCurrentItemType, getGlobalEffectModes, getArtifactDB, getSlateDB, getDBItem, getSlotCount, getState } from './state.js';
import { calculateAllBuffs, isSlotAvailable } from './utils.js';
import { getItemList, getInventoryGrid, getSelectedSlatesList, getSelectedArtifactsList, getGlobalEffectsContainer, getSlotCountLabel, getRarityFilter, getNameSearch, getRealtimeScoreValue, getTagFilter } from './dom-elements.js'; // getTagFilter 확인
import { RARITY_WEIGHTS, MAX_POSSIBLE_SCORE } from './constants.js';

export function renderAll() {
    // 태그 옵션 업데이트 (혹시 dom-elements에 getTagFilter가 없다면 이 줄은 주석 처리하세요)
    // updateTagOptions(); 
    renderItems();
    renderInventoryGrid();
    updateSelectedItems();
}

// ★★★ 수정됨: export 키워드 추가 ★★★
export function renderItems() {
    const itemList = getItemList();
    const rarityValue = getRarityFilter().value;
    const searchValue = getNameSearch().value.toLowerCase();
    
    // 태그 필터가 있다면 가져오고, 없다면 'all'로 처리
    const tagFilterEl = document.getElementById('tag-filter'); 
    const tagValue = tagFilterEl ? tagFilterEl.value : 'all';

    const ownedItems = getOwnedItems();
    const currentItemType = getCurrentItemType();
    const db = (currentItemType === 'artifacts') ? Object.values(getArtifactDB()) : Object.values(getSlateDB());
    
    itemList.innerHTML = '';
    
    const filteredItems = db.filter(item => {
        // 1. 희귀도 필터
        const rarityMatch = rarityValue === 'all' || item.rarity === rarityValue;
        
        // 2. 이름 검색 필터
        const nameMatch = item.name.toLowerCase().includes(searchValue);
        
        // 3. 태그 필터 (태그가 있을 때만)
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
            renderSlot(slot, itemState, buffs);
        } else if (buffs.levelMap[i] > 0) {
             slot.innerHTML = `<div class="empty-slot-buff">+${buffs.levelMap[i]}</div>`;
        }
        inventoryGrid.appendChild(slot);
    }
}

function renderSlot(slotElement, itemState, buffs) {
    buffs = buffs || calculateAllBuffs();
    const dbItem = getDBItem(itemState.id);
    if (!dbItem) return;

    slotElement.dataset.itemId = itemState.id;
    let badgeHTML = '';
    const isArtifact = itemState.type === 'artifact';

    if (isArtifact) {
        badgeHTML = `<div class="item-badge badge-artifact">${itemState.upgrade}/${dbItem.maxUpgrade}</div>`;
    } else {
        const slate = dbItem;
        let totalBoost = 0;
        const buffcoords_data = slate.buffcoords || {};
        const buffcoords = slate.rotatable ? buffcoords_data[String(itemState.rotation)] : buffcoords_data; 
        if (buffcoords) {
            buffcoords.forEach(coord => {
                if (coord[2] > 0) totalBoost += coord[2];
            });
        }
        if (totalBoost > 0) badgeHTML = `<div class="item-badge badge-slate">+${totalBoost}</div>`;
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
