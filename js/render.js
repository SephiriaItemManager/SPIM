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
            renderSlot(slot, i, itemState, buffs); // 인덱스 i 전달
        } else if (buffs.levelMap[i] > 0) {
             slot.innerHTML = `<div class="empty-slot-buff">+${buffs.levelMap[i]}</div>`;
        }
        inventoryGrid.appendChild(slot);
    }
}

// ★★★ 수정됨: 슬롯 인덱스를 받아 토탈 레벨 계산 및 뱃지 표시 수정 ★★★
function renderSlot(slotElement, slotIndex, itemState, buffs) {
    const dbItem = getDBItem(itemState.id);
    if (!dbItem) return;

    slotElement.dataset.itemId = itemState.id;
    let badgeHTML = '';
    const isArtifact = itemState.type === 'artifact';

    // 현재 슬롯이 받고 있는 버프 + 아이템 자체 강화 수치
    const totalLevel = (buffs.levelMap[slotIndex] || 0) + (itemState.upgrade || 0);
    const maxUpgrade = dbItem.maxUpgrade || 0; // undefined면 0으로 표시

    if (isArtifact) {
        // 아티팩트: (총합 레벨) / (최대 강화)
        badgeHTML = `<div class="item-badge badge-artifact">${totalLevel}/${maxUpgrade}</div>`;
    } else {
        // 석판: (자체 강화) / 0  -> 사용자 요청대로 표시
        // 석판은 배치를 위해 존재하는 것이므로 보통 레벨이 의미 없지만, 요청대로 표시
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