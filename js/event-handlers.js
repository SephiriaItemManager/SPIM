// js/event-handlers.js
import { 
    updateOwnedItemCount, setCurrentItemType, getCurrentItemType,
    updateInventorySlotCount, placeItemInSlot, removeItemFromSlot,
    rotateItemInSlot, updateArtifactSetting, setGlobalEffectMode, 
    clearState, getOwnedItems, getArtifactDB, getSlateDB, getState, 
    registerStateChangeCallback, getSlotCount, setInventoryState,
    swapInventoryItems
} from './state.js';
import { optimizePlacement } from './api.js';
import { 
    getTypeTabs, getRarityFilter, getNameSearch, getTagFilter, // getTagFilter 확인
    getSlotIncreaseBtn, getSlotDecreaseBtn, 
    getItemList, getInventoryGrid, getSelectedArtifactsList, 
    getGlobalEffectsContainer, getClearBtn, getOptimizeBtn
} from './dom-elements.js';
import { renderItems, renderAll } from './render.js'; 

export function setupAllEventListeners() {
    const rerender = () => registerStateChangeCallback(() => {})() 

    getTypeTabs().addEventListener('click', e => {
        if (e.target.classList.contains('tab-button')) {
            getTypeTabs().querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            setCurrentItemType(e.target.dataset.type);
            
            // 탭 전환 시 필터 초기화 및 전체 다시 그리기 (태그 목록 갱신 포함)
            getRarityFilter().value = 'all';
            getTagFilter().value = 'all';
            getNameSearch().value = '';
            renderAll(); 
        }
    });

    getRarityFilter().addEventListener('change', renderItems);
    
    // ★★★ 태그 필터 이벤트 리스너 추가 ★★★
    getTagFilter().addEventListener('change', renderItems);
    
    getNameSearch().addEventListener('input', renderItems);

    getSlotIncreaseBtn().addEventListener('click', () => updateInventorySlotCount(getSlotCount() + 1));
    getSlotDecreaseBtn().addEventListener('click', () => updateInventorySlotCount(getSlotCount() - 1));

    getItemList().addEventListener('click', e => {
        const card = e.target.closest('.item-card');
        if (!card) return;
        updateOwnedItemCount(card.dataset.itemId, 1);
    });

    getItemList().addEventListener('contextmenu', e => {
        e.preventDefault();
        const card = e.target.closest('.item-card');
        if (!card) return;
        updateOwnedItemCount(card.dataset.itemId, -1);
    });
    
    // 드래그 앤 드롭 관련
    const inventoryGrid = getInventoryGrid();
    let dragStartSlotId = null;

    inventoryGrid.addEventListener('dragstart', e => {
        const slot = e.target.closest('.inventory-slot');
        if (!slot || e.target.tagName !== 'IMG') return;
        dragStartSlotId = slot.dataset.slotId;
        e.dataTransfer.setData('text/plain', dragStartSlotId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => e.target.style.opacity = '0.5', 0);
    });

    inventoryGrid.addEventListener('dragend', e => {
        if (e.target.tagName === 'IMG') e.target.style.opacity = '1';
        dragStartSlotId = null;
        inventoryGrid.querySelectorAll('.drag-over').forEach(s => s.classList.remove('drag-over'));
    });

    inventoryGrid.addEventListener('dragover', e => {
        e.preventDefault();
        const slot = e.target.closest('.inventory-slot');
        if (slot) {
            e.dataTransfer.dropEffect = 'move';
            inventoryGrid.querySelectorAll('.drag-over').forEach(s => s.classList.remove('drag-over'));
            slot.classList.add('drag-over');
        }
    });

    inventoryGrid.addEventListener('drop', e => {
        e.preventDefault();
        const dropSlot = e.target.closest('.inventory-slot');
        if (dropSlot && dragStartSlotId !== null) {
            const dropSlotId = dropSlot.dataset.slotId;
            if (dragStartSlotId !== dropSlotId) {
                swapInventoryItems(parseInt(dragStartSlotId), parseInt(dropSlotId));
            }
        }
    });

    inventoryGrid.addEventListener('click', e => {
        const slot = e.target.closest('.inventory-slot');
        if (!slot) return;
        const slotId = parseInt(slot.dataset.slotId);

        if (getState().inventory[slotId]) {
            rotateItemInSlot(slotId);
        } else {
            const currentItemType = getCurrentItemType();
            const db = (currentItemType === 'artifacts') ? getArtifactDB() : getSlateDB();
            const ownedItems = getOwnedItems();
            const firstOwnedItemId = Object.keys(db).find(id => (ownedItems[id]?.count || 0) > 0);
            
            if (firstOwnedItemId) {
                placeItemInSlot(slotId, firstOwnedItemId);
            }
        }
    });
    
    inventoryGrid.addEventListener('contextmenu', e => {
        e.preventDefault();
        const slot = e.target.closest('.inventory-slot');
        if (slot && getState().inventory[slot.dataset.slotId]) {
            removeItemFromSlot(parseInt(slot.dataset.slotId));
        }
    });
    
    getSelectedArtifactsList().addEventListener('click', e => {
        const target = e.target;
        if (!target.classList.contains('control-btn')) return;
        const card = target.closest('.selected-item-card');
        const itemId = card.dataset.itemId; 
        const change = parseInt(target.dataset.change);

        if (target.classList.contains('enchant-btn')) {
            updateArtifactSetting(itemId, 'upgrade', change);
        } else if (target.classList.contains('priority-btn')) {
            updateArtifactSetting(itemId, 'priority', change);
        }
    });

    getGlobalEffectsContainer().addEventListener('change', e => {
        if (e.target.type === 'radio') {
            const artifactId = e.target.closest('.global-effect-modes').dataset.artifactId;
            setGlobalEffectMode(artifactId, e.target.value);
        }
    });
    
    getClearBtn().addEventListener('click', () => {
        clearState();
    });

    getOptimizeBtn().addEventListener('click', async () => {
        const result = await optimizePlacement(); 
        if (result) {
            setInventoryState(result.board);
        }
    });
}
