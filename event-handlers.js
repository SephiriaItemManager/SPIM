// js/event-handlers.js
import { 
    updateOwnedItemCount, setCurrentItemType, getCurrentItemType,
    updateInventorySlotCount, placeItemInSlot, removeItemFromSlot,
    rotateItemInSlot, updateArtifactSetting, setGlobalEffectMode, 
    clearState, getOwnedItems, getArtifactDB, getSlateDB, getState, 
    registerStateChangeCallback, getSlotCount, setInventoryState,
    swapInventoryItems // ★★★ 드래그앤드롭용 함수 import
} from './state.js';
import { optimizePlacement } from './api.js';
import { 
    getTypeTabs, getRarityFilter, getNameSearch, 
    getSlotIncreaseBtn, getSlotDecreaseBtn, 
    getItemList, getInventoryGrid, getSelectedArtifactsList, 
    getGlobalEffectsContainer, getClearBtn, getOptimizeBtn
} from './dom-elements.js';

// ★★★ 드래그 앤 드롭 리스너 설정 함수 (새로 추가) ★★★
function setupDragAndDropListeners() {
    const inventoryGrid = getInventoryGrid();
    let dragStartSlotId = null;

    // 1. 드래그 시작 (인벤토리 슬롯의 아이템 이미지)
    inventoryGrid.addEventListener('dragstart', e => {
        const slot = e.target.closest('.inventory-slot');
        // 이미지가 아닌 슬롯 자체에서 시작된 드래그는 무시
        if (e.target.tagName !== 'IMG') {
            e.preventDefault();
            return;
        }
        if (slot && getState().inventory[slot.dataset.slotId]) {
            dragStartSlotId = slot.dataset.slotId;
            e.dataTransfer.setData('text/plain', dragStartSlotId);
            e.dataTransfer.effectAllowed = 'move';
            // 드래그 시작 시 투명도 조절 (선택 사항)
            setTimeout(() => {
                e.target.style.opacity = '0.5';
            }, 0);
        }
    });

    // 2. 드래그 종료 (드롭이 성공하든 취소되든 항상 실행)
    inventoryGrid.addEventListener('dragend', e => {
        if (e.target.tagName === 'IMG') {
            e.target.style.opacity = '1'; // 투명도 복원
        }
        dragStartSlotId = null;
        // 모든 'drag-over' 효과 제거
        inventoryGrid.querySelectorAll('.drag-over').forEach(slot => {
            slot.classList.remove('drag-over');
        });
    });

    // 3. 드롭 대상 위로 지나갈 때
    inventoryGrid.addEventListener('dragover', e => {
        e.preventDefault(); // 필수: 'drop' 이벤트를 허용하기 위함
        const slot = e.target.closest('.inventory-slot');
        if (slot) {
            e.dataTransfer.dropEffect = 'move';
            // 시각적 피드백
            inventoryGrid.querySelectorAll('.drag-over').forEach(s => s.classList.remove('drag-over'));
            slot.classList.add('drag-over');
        }
    });

    // 4. 드롭 대상에서 벗어날 때
    inventoryGrid.addEventListener('dragleave', e => {
        const slot = e.target.closest('.inventory-slot');
        if (slot) {
            slot.classList.remove('drag-over');
        }
    });

    // 5. 드롭 실행
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
}


export function setupAllEventListeners() {
    const rerender = () => registerStateChangeCallback(() => {})() 

    getTypeTabs().addEventListener('click', e => {
        if (e.target.classList.contains('tab-button')) {
            getTypeTabs().querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
            setCurrentItemType(e.target.dataset.type);
        }
    });

    getRarityFilter().addEventListener('change', rerender);
    getNameSearch().addEventListener('input', rerender);

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
    
    // ▼▼▼ 인벤토리 클릭/우클릭 로직 수정 ▼▼▼
    getInventoryGrid().addEventListener('click', e => {
        const slot = e.target.closest('.inventory-slot');
        if (!slot) return;
        const slotId = parseInt(slot.dataset.slotId);

        if (getState().inventory[slotId]) {
            rotateItemInSlot(slotId); // 아이템이 있으면 회전
        } else {
            // 아이템이 없으면, 현재 탭의 아이템 중 보유량이 있는 첫 아이템 배치
            const currentItemType = getCurrentItemType();
            const db = (currentItemType === 'artifacts') ? getArtifactDB() : getSlateDB();
            const ownedItems = getOwnedItems();
            const firstOwnedItemId = Object.keys(db).find(id => (ownedItems[id]?.count || 0) > 0);
            
            if (firstOwnedItemId) {
                placeItemInSlot(slotId, firstOwnedItemId);
            }
        }
    });
    
    getInventoryGrid().addEventListener('contextmenu', e => {
        e.preventDefault();
        const slot = e.target.closest('.inventory-slot');
        if (slot && getState().inventory[slot.dataset.slotId]) {
            removeItemFromSlot(parseInt(slot.dataset.slotId)); // 아이템 제거
        }
    });
    
    // ★★★ 드래그 앤 드롭 리스너 실행 ★★★
    setupDragAndDropListeners();

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