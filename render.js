// js/render.js
import { getOwnedItems, getInventoryState, getCurrentItemType, getGlobalEffectModes, getArtifactDB, getSlateDB, getDBItem, getSlotCount, getState } from './state.js';
import { calculateAllBuffs, isSlotAvailable } from './utils.js';
import { getItemList, getInventoryGrid, getSelectedSlatesList, getSelectedArtifactsList, getGlobalEffectsContainer, getSlotCountLabel, getRarityFilter, getNameSearch, getRealtimeScoreValue } from './dom-elements.js';
import { RARITY_WEIGHTS, MAX_POSSIBLE_SCORE } from './constants.js';

export function renderAll() {
    renderItems();
    renderInventoryGrid();
    updateSelectedItems();
}

function renderItems() {
    const itemList = getItemList();
    const rarityValue = getRarityFilter().value;
    const searchValue = getNameSearch().value.toLowerCase();
    const ownedItems = getOwnedItems();
    const currentItemType = getCurrentItemType();
    const db = (currentItemType === 'artifacts') ? Object.values(getArtifactDB()) : Object.values(getSlateDB());
    
    itemList.innerHTML = '';
    db.filter(item => {
        const rarityMatch = rarityValue === 'all' || item.rarity === rarityValue;
        const nameMatch = item.name.toLowerCase().includes(searchValue);
        return rarityMatch && nameMatch;
    }).forEach(item => {
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

// ★★★ 이 함수가 수정되었습니다 ★★★
function renderSlot(slotElement, itemState, buffs) {
    buffs = buffs || calculateAllBuffs();
    const dbItem = getDBItem(itemState.id);
    if (!dbItem) return;

    slotElement.dataset.itemId = itemState.id;
    let badgeHTML = '';
    
    // ▼▼▼ 버그 수정: itemState.type으로 아티팩트/석판 구분 ▼▼▼
    const isArtifact = itemState.type === 'artifact';

    if (isArtifact) {
        // 아티팩트: '강화/최대강화' 뱃지 표시
        badgeHTML = `<div class="item-badge badge-artifact">${itemState.upgrade}/${dbItem.maxUpgrade}</div>`;
    } else {
        // 석판: '버프 총합' 뱃지 표시
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
    
    // ▼▼▼ 드래그 기능 추가: draggable="true" ▼▼▼
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
        if (itemState && itemState.type === 'artifact') { // 'type'으로 확인
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