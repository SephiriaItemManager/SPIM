// js/event-handlers.js
import { 
    updateOwnedItemCount, setCurrentItemType, getCurrentItemType,
    updateInventorySlotCount,
    updateArtifactSetting, setGlobalEffectMode, 
    clearState, getOwnedItems, getArtifactDB, getSlateDB, getState, 
    registerStateChangeCallback, getSlotCount, setInventoryState
} from './state.js';
import { optimizePlacement } from './api.js';
import { 
    getTypeTabs, getRarityFilter, getNameSearch, 
    getSlotIncreaseBtn, getSlotDecreaseBtn, 
    getItemList, getInventoryGrid, getSelectedArtifactsList, 
    getGlobalEffectsContainer, getClearBtn, getOptimizeBtn
} from './dom-elements.js';

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
    
    // ★★★ 인벤토리 클릭/우클릭 이벤트 제거 (이제 인벤토리는 출력 전용) ★★★
    getInventoryGrid().addEventListener('click', e => {
        // 비활성화 (클릭해도 아무 일도 일어나지 않음)
    });
    getInventoryGrid().addEventListener('contextmenu', e => {
        e.preventDefault();
        // 비활성화
    });
    
    // ★★★ 우측 사이드바 조절 로직 수정 ★★★
    getSelectedArtifactsList().addEventListener('click', e => {
        const target = e.target;
        if (!target.classList.contains('control-btn')) return;

        const card = target.closest('.selected-item-card');
        const itemId = card.dataset.itemId; // ★★★ inventoryIndex 대신 itemId 사용 ★★★
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

    // ★★★ 최적 배치 버튼 로직 수정 ★★★
    getOptimizeBtn().addEventListener('click', async () => {
        const result = await optimizePlacement(); // api.js가 ownedItems를 읽도록 수정됨
        if (result) {
            setInventoryState(result.board);
        }
    });
}