// optimizer.worker.js (Genetic Algorithm)

// --- 유전 알고리즘 설정 ---
const POPULATION_SIZE = 50;   // 한 세대의 개체 수 (배치도 개수)
const MUTATION_RATE = 0.05;   // 돌연변이 확률 (아이템 위치를 바꿀 확률)
const TOURNAMENT_SIZE = 5;  // 부모 선택 시 경쟁시킬 개체 수

// 전역 변수 (워커 내부에서 공유)
let allItemsToPlace = [];
let totalActiveSlots = 0;
let maxSlots = 0;

// --- 핵심 유틸리티 함수 ---

// 슬롯 조건 확인 함수 (기존과 동일)
function isSlotAvailable(slotIndex, condition, currentGrid) {
    const row = Math.floor(slotIndex / 6);
    const col = slotIndex % 6;
    const totalRows = Math.ceil(totalActiveSlots / 6);
    const totalCols = 6;
    switch (condition) {
        case "최상단": return row === 0;
        case "최하단": return (slotIndex + 6) >= totalActiveSlots;
        case "가장자리": return row === 0 || row === totalRows - 1 || col === 0 || col === totalCols - 1;
        case "안쪽": return row > 0 && row < totalRows - 1 && col > 0 && col < totalCols - 1;
        case "양쪽칸이 공백":
            const isLeftInBounds = col > 0;
            const isRightInBounds = col < totalCols - 1;
            const isLeftEmpty = !isLeftInBounds || currentGrid[slotIndex - 1] === null;
            const isRightEmpty = !isRightInBounds || currentGrid[slotIndex + 1] === null;
            return isLeftEmpty && isRightEmpty;
        default: return true;
    }
}

// 점수 계산 함수 (기존과 거의 동일)
function calculateScore(grid) {
    let score = 0;
    const slotBuffs = new Array(maxSlots).fill(0);

    // 1. 석판 효과 계산
    for (let i = 0; i < grid.length; i++) {
        const item = grid[i];
        if (item && item.id.startsWith('slate_')) {
            const baseRow = Math.floor(i / 6);
            const baseCol = i % 6;
            const rotation = item.rotation || 0;

            (item.buffcoords || []).forEach(buff => {
                let dX = buff.x || 0;
                let dY = buff.y || 0;
                if (rotation === 90) { [dX, dY] = [-dY, dX]; }
                else if (rotation === 180) { [dX, dY] = [-dX, -dY]; }
                else if (rotation === 270) { [dX, dY] = [dY, -dX]; }

                const targetCol = baseCol + dX;
                const targetRow = baseRow + dY;
                const targetIndex = targetRow * 6 + targetCol;

                if (targetIndex >= 0 && targetIndex < totalActiveSlots && targetCol >= 0 && targetCol < 6) {
                    let valueSource = buff.value !== undefined ? buff.value : buff.v;
                    if (valueSource === "limitUnlock") slotBuffs[targetIndex] += 1;
                    else slotBuffs[targetIndex] += (parseInt(valueSource) || 0);
                }
            });
        }
    }

    // 2. 아티팩트 점수 합산
    for (let i = 0; i < grid.length; i++) {
        const item = grid[i];
        if (item && item.id.startsWith('aritifact_')) {
            const buff = slotBuffs[i] || 0;
            const currentLevel = (item.level || 0) + buff;
            score += Math.min(currentLevel, item.maxUpgrade);
        }
    }
    return score;
}


// --- 유전 알고리즘 핵심 함수 ---

// 1. 개체(배치도) 생성 함수
function createGenome() {
    const genome = new Array(maxSlots).fill(null);
    const items = [...allItemsToPlace].sort(() => 0.5 - Math.random()); // 아이템 무작위로 섞기
    let placedCount = 0;

    for (const item of items) {
        const condition = (item.condition && item.condition.length > 0) ? item.condition[0] : '';
        // 배치 가능한 빈 슬롯 찾기
        const availableSlots = [];
        for (let i = 0; i < totalActiveSlots; i++) {
            if (genome[i] === null) {
                availableSlots.push(i);
            }
        }
        
        // 무작위로 섞어서 탐색
        availableSlots.sort(() => 0.5 - Math.random());

        for (const slotIndex of availableSlots) {
            if (isSlotAvailable(slotIndex, condition, genome)) {
                genome[slotIndex] = item;
                placedCount++;
                break; // 배치 성공 시 다음 아이템으로
            }
        }
    }
    
    // 만약 모든 아이템을 배치하지 못했다면 유효하지 않은 개체
    if (placedCount < allItemsToPlace.length) {
        return null; 
    }

    return {
        grid: genome,
        fitness: calculateScore(genome)
    };
}

// 2. 초기 세대 생성
function createInitialPopulation() {
    const population = [];
    while (population.length < POPULATION_SIZE) {
        const genome = createGenome();
        // 유효한(모든 아이템이 배치된) 개체만 추가
        if (genome) {
            population.push(genome);
        }
    }
    return population;
}

// 3. 부모 선택 (토너먼트 방식)
function selection(population) {
    let tournament = [];
    for (let i = 0; i < TOURNAMENT_SIZE; i++) {
        const randomIndex = Math.floor(Math.random() * population.length);
        tournament.push(population[randomIndex]);
    }
    // 토너먼트에서 가장 점수가 높은 개체를 부모로 선택
    return tournament.reduce((best, current) => (current.fitness > best.fitness) ? current : best, tournament[0]);
}

// 4. 교배 (Crossover)
function crossover(parent1, parent2) {
    const childGrid = new Array(maxSlots).fill(null);
    const parent1Items = parent1.grid.filter(item => item !== null);

    // 절반은 parent1의 위치를 그대로 계승
    for (let i = 0; i < parent1Items.length / 2; i++) {
        const item = parent1Items[i];
        const index = parent1.grid.indexOf(item);
        childGrid[index] = item;
    }

    // 나머지 절반은 parent2의 아이템을 빈 자리에 배치
    for (const item of parent2.grid) {
        if (item && !childGrid.includes(item)) {
            // 빈 슬롯 중 조건에 맞는 곳에 배치
            for (let i = 0; i < totalActiveSlots; i++) {
                if (childGrid[i] === null) {
                    const condition = (item.condition && item.condition.length > 0) ? item.condition[0] : '';
                    if (isSlotAvailable(i, condition, childGrid)) {
                        childGrid[i] = item;
                        break;
                    }
                }
            }
        }
    }
    
    // 혹시라도 배치가 완벽하게 되지 않았을 경우를 대비하여 검증
    const childItemCount = childGrid.filter(Boolean).length;
    if (childItemCount < allItemsToPlace.length) {
        // 배치가 실패하면 더 나은 부모를 그대로 반환
        return parent1.fitness > parent2.fitness ? { ...parent1 } : { ...parent2 };
    }

    return {
        grid: childGrid,
        fitness: calculateScore(childGrid)
    };
}


// 5. 돌연변이 (Mutation)
function mutation(genome) {
    if (Math.random() > MUTATION_RATE) {
        return genome;
    }

    const newGrid = [...genome.grid];
    const itemIndices = [];
    for(let i=0; i<newGrid.length; i++) {
        if (newGrid[i]) itemIndices.push(i);
    }
    
    if (itemIndices.length < 2) return genome;

    // 무작위로 두 아이템의 위치를 교환
    const [idx1, idx2] = [
        itemIndices[Math.floor(Math.random() * itemIndices.length)],
        itemIndices[Math.floor(Math.random() * itemIndices.length)]
    ];

    const item1 = newGrid[idx1];
    const item2 = newGrid[idx2];
    const cond1 = (item1.condition && item1.condition.length > 0) ? item1.condition[0] : '';
    const cond2 = (item2.condition && item2.condition.length > 0) ? item2.condition[0] : '';

    // 교환 후에도 두 아이템 모두 배치 조건을 만족하는 경우에만 교환
    if (isSlotAvailable(idx1, cond2, newGrid) && isSlotAvailable(idx2, cond1, newGrid)) {
        [newGrid[idx1], newGrid[idx2]] = [newGrid[idx2], newGrid[idx1]];
    }

    return {
        grid: newGrid,
        fitness: calculateScore(newGrid)
    };
}

// --- 메인 워커 로직 ---
self.onmessage = function(e) {
    const { allItemsToPlace: items, totalActiveSlots: slots, maxSlots: max, timeout } = e.data;
    
    // 전역 변수 초기화
    allItemsToPlace = items;
    totalActiveSlots = slots;
    maxSlots = max;
    
    let population = createInitialPopulation();
    let bestGenome = population.reduce((best, current) => (current.fitness > best.fitness) ? current : best, population[0]);
    
    const startTime = Date.now();

    // 시간 제한까지 계속해서 세대 교체
    while (Date.now() - startTime < timeout) {
        const newPopulation = [];
        for (let i = 0; i < POPULATION_SIZE; i++) {
            const parent1 = selection(population);
            const parent2 = selection(population);
            let child = crossover(parent1, parent2);
            child = mutation(child);
            newPopulation.push(child);
        }
        population = newPopulation;

        // 현재 세대에서 최고 점수 개체 찾기
        const currentBest = population.reduce((best, current) => (current.fitness > best.fitness) ? current : best, population[0]);
        if (currentBest.fitness > bestGenome.fitness) {
            bestGenome = currentBest;
        }
    }
    
    self.postMessage({
        bestGrid: bestGenome.grid,
        maxScore: bestGenome.fitness,
        timeout: true // 유전 알고리즘은 항상 타임아웃 기반으로 동작
    });
};