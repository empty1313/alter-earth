document.addEventListener('DOMContentLoaded', () => {
    // --- 글로벌 DB 및 상태 ---
    let db = { monsters: [], items: [], agents: [] };
    let state = {
        panes: [], // { id, activeTab, openTabs: [] }
        activePaneId: null,
        focusedEntityId: null, // 현재 포커스된(싱글클릭) 개체 ID
        currentUser: null, // 로그인한 사용자 정보
    };

    // --- DOM 요소 캐싱 ---
    const dom = {
        // Login
        loginOverlay: document.getElementById('login-overlay'),
        loginCodeInput: document.getElementById('login-code-input'),
        loginError: document.getElementById('login-error'),
        appContainer: document.querySelector('.app-container'),
        userInfo: document.getElementById('user-info'),

        // Main App
        navigator: document.getElementById('entity-navigator'),
        navigatorSearch: document.getElementById('navigator-search'),
        workspaceArea: document.getElementById('workspace-area'),
        console: document.getElementById('system-console'),
        consoleInput: document.getElementById('console-input'),
        entityCount: document.getElementById('entity-count'),
        splitViewBtn: document.getElementById('split-view-btn'),
    };

    // --- 시스템 콘솔 로깅 ---
    const logToConsole = (message, type = "INFO") => {
        const timestamp = new Date().toLocaleTimeString('en-GB');
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> <span class="log-message type-${type}">${message}</span>`;
        dom.console.appendChild(entry);
        dom.console.scrollTop = dom.console.scrollHeight;
    };
    
    // --- 로그인 처리 ---
    async function handleLoginAttempt() {
        const code = parseInt(dom.loginCodeInput.value, 10);
        const agent = db.agents.find(a => a.code === code);

        if (agent) {
            dom.loginError.textContent = '';
            dom.loginCodeInput.disabled = true;
            state.currentUser = agent;
            
            // 로그인 오버레이 숨기고 메인 앱 표시
            dom.loginOverlay.classList.add('hidden');
            setTimeout(() => {
                dom.appContainer.style.display = 'flex';
                // 로그인 성공 후 메인 앱 초기화 시작
                initApp(); 
            }, 500); // CSS transition 시간과 맞춤

        } else {
            dom.loginError.textContent = 'ACCESS DENIED: INVALID CODE';
            dom.loginCodeInput.value = '';
        }
    }

    // --- 메인 앱 초기화 (로그인 성공 후 호출) ---
    async function initApp() {
        // 상태 바에 사용자 정보 업데이트
        dom.userInfo.textContent = `USER: ${state.currentUser.name}`;
        
        // 핵심 데이터 로드 및 앱 기능 설정
        await loadData();
        renderNavigator();
        createPane();
        setupEventListeners();
    }
    
    // --- 데이터 로딩 ---
    async function loadData() {
        logToConsole("M.A.R.S. v3.3 initializing...");
        try {
            const [monsterRes, itemRes] = await Promise.all([
                fetch('../database/monster.csv'), fetch('../database/item.csv')
            ]);
            db.monsters = Papa.parse(await monsterRes.text(), { header: true, skipEmptyLines: true }).data;
            db.items = Papa.parse(await itemRes.text(), { header: true, skipEmptyLines: true }).data;
            dom.entityCount.textContent = `${db.monsters.length} ENTITIES LOADED`;
            logToConsole(`Database synchronized. ${db.monsters.length} monster entities loaded.`, "SUCCESS");
        } catch (error) { logToConsole("DATABASE CONNECTION FAILED.", "CRITICAL"); }
    }

    // --- 네비게이터 렌더링 ---
    function renderNavigator() {
        const grouped = db.monsters.reduce((acc, m) => {
            const category = m.category ? m.category.toUpperCase() : 'UNCATEGORIZED';
            const rank = m.rank || 'N/A';
            if (!acc[category]) acc[category] = {};
            if (!acc[category][rank]) acc[category][rank] = [];
            acc[category][rank].push(m);
            return acc;
        }, {});

        let html = '';
        for (const category in grouped) {
            html += `<li><div class="tree-node toggle-node collapsed"><i class="icon fas fa-chevron-down"></i>${category}</div><ul>`;
            for (const rank in grouped[category]) {
                html += `<li><div class="tree-node toggle-node collapsed"><i class="icon fas fa-chevron-down"></i>Rank ${rank}</div><ul>`;
                grouped[category][rank].forEach(monster => {
                    html += `<li><div class="tree-node monster-leaf" data-id="${monster.ID}"><i class="icon fas fa-bug"></i>${monster.name}</div></li>`;
                });
                html += `</ul></li>`;
            }
            html += `</ul></li>`;
        }
        dom.navigator.innerHTML = html;
    }
    
    // --- 포커스 관리 ---
    function setFocus(monsterId) {
        if (state.focusedEntityId) {
            const oldFocus = dom.navigator.querySelector(`.monster-leaf[data-id="${state.focusedEntityId}"]`);
            if (oldFocus) oldFocus.classList.remove('focused');
        }
        
        const newFocus = dom.navigator.querySelector(`.monster-leaf[data-id="${monsterId}"]`);
        if (newFocus) {
            newFocus.classList.add('focused');
            newFocus.scrollIntoView({ block: 'nearest' });
            state.focusedEntityId = monsterId;
        } else {
            state.focusedEntityId = null;
        }
    }

    // --- 창(Pane) 관리 ---
    function createPane() {
        const paneId = `pane-${Date.now()}`;
        const paneData = { id: paneId, activeTab: null, openTabs: [] };
        state.panes.push(paneData);

        const paneEl = document.createElement('div');
        paneEl.className = 'workspace-pane';
        paneEl.id = paneId;
        paneEl.innerHTML = `
            <div class="tab-bar">
                <div class="tab-scroll-area"></div>
                <div class="tab-bar-controls">
                    <button class="close-pane-btn" title="Close Pane"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="tab-content-area">
                <div class="placeholder-center">
                    <i class="fas fa-book-dead"></i>
                    <p>Select an entity to analyze.</p>
                </div>
            </div>`;
        dom.workspaceArea.appendChild(paneEl);
        setActivePane(paneId);
        return paneData;
    }

    function closePane(paneId) {
        if (state.panes.length <= 1) {
            logToConsole("Action Denied: Cannot close the last workspace pane.", "CRITICAL");
            return;
        }
        const paneIndex = state.panes.findIndex(p => p.id === paneId);
        if (paneIndex === -1) return;
        state.panes.splice(paneIndex, 1);
        document.getElementById(paneId).remove();
        logToConsole(`Workspace pane [${paneId}] closed.`, "INFO");
        if (state.activePaneId === paneId) {
            if (state.panes.length > 0) setActivePane(state.panes[0].id);
            else state.activePaneId = null;
        }
    }

    function setActivePane(paneId) {
        state.activePaneId = paneId;
        dom.workspaceArea.querySelectorAll('.workspace-pane').forEach(p => {
            p.classList.toggle('pane-focused', p.id === paneId);
        });
    }

    // --- 탭 관리 ---
    function openTab(monsterId, paneId) {
        const pane = state.panes.find(p => p.id === paneId);
        if (!pane) return;
        if (pane.openTabs.includes(monsterId)) {
            switchTab(monsterId, paneId);
            return;
        }
        const monster = db.monsters.find(m => m.ID === monsterId);
        if (!monster) {
            logToConsole(`Entity with ID ${monsterId} not found.`, "CRITICAL");
            return;
        }
        pane.openTabs.push(monsterId);
        const paneEl = document.getElementById(paneId);
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.id = monsterId;
        tab.innerHTML = `<i class="tab-icon fas fa-book-dead"></i><span>${monster.name}</span><i class="close-tab fas fa-times"></i>`;
        paneEl.querySelector('.tab-scroll-area').appendChild(tab);
        const content = document.createElement('div');
        content.className = 'tab-content';
        content.dataset.id = monsterId;
        content.innerHTML = generateTabContent(monster);
        paneEl.querySelector('.tab-content-area').appendChild(content);
        const placeholder = paneEl.querySelector('.placeholder-center');
        if(placeholder) placeholder.style.display = 'none';
        switchTab(monsterId, paneId);
        logToConsole(`[${paneId}] Opened: ${monster.name} (${monsterId})`);
    }

    function switchTab(monsterId, paneId) {
        const pane = state.panes.find(p => p.id === paneId);
        if (!pane) return;
        pane.activeTab = monsterId;
        const paneEl = document.getElementById(paneId);
        paneEl.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === monsterId));
        paneEl.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.dataset.id === monsterId));
        setActivePane(paneId);
        setFocus(monsterId);
    }
    
    function closeTab(monsterId, paneId) {
        const pane = state.panes.find(p => p.id === paneId);
        if (!pane) return;
        pane.openTabs = pane.openTabs.filter(id => id !== monsterId);
        const paneEl = document.getElementById(paneId);
        paneEl.querySelector(`.tab-scroll-area .tab[data-id="${monsterId}"]`).remove();
        paneEl.querySelector(`.tab-content-area .tab-content[data-id="${monsterId}"]`).remove();
        if (pane.activeTab === monsterId) {
            if (pane.openTabs.length > 0) {
                switchTab(pane.openTabs[pane.openTabs.length - 1], paneId);
            } else {
                pane.activeTab = null;
                const placeholder = paneEl.querySelector('.placeholder-center');
                if(placeholder) placeholder.style.display = 'block';
            }
        }
    }

    // --- 콘텐츠 생성 ---
    function generateTabContent(monster) {
        const sop = generateSOP(monster);
        return `<h1>${monster.name} <span class="text-secondary">[${monster.ID}]</span></h1>
                <p>${monster.desc || 'Description not available.'}</p>
                <hr style="margin: 20px 0; border-color: var(--bg-surface-3);">
                <div class="report-grid">
                    <div class="report-section"><h3>I. 개체 프로파일</h3><table class="report-table">
                        <tr><th>등급</th><td>Rank ${monster.rank}</td></tr>
                        <tr><th>유형</th><td>${monster.category}</td></tr>
                        <tr><th>주요 서식지</th><td>${monster.habit}</td></tr>
                        <tr><th>확인된 약점</th><td>${monster.weak}</td></tr>
                    </table></div>
                    <div class="report-section"><h3>II. 표준 대응 프로토콜 (SOP)</h3>${sop}</div>
                </div>`;
    }

    function generateSOP(monster) {
        const steps = [
            { icon: 'fa-eye', title: '초기 대응', desc: ['최소 50m 안전거리 확보', '주변 환경 및 엄폐물 확인'] },
            { icon: 'fa-crosshairs', title: '교전 수칙', desc: [`'${monster.weak}' 속성 기반 지속 압박`, `Rank ${monster.rank} 표준 진형 유지`] },
        ];
        if (['S', 'A', 'B'].includes(monster.rank)) {
            steps.push({ icon: 'fa-exclamation-triangle', title: '고위험 패턴 대응', desc: ['특수 패턴 전조 식별', '지정된 회피/차단 기동 실시'] });
        }
        steps.push({ icon: 'fa-clipboard-check', title: '사후 처리', desc: ['규정에 따른 샘플 확보', '현장 보존 및 보고'] });
        let sopHtml = '<div class="sop-grid">';
        steps.forEach(step => {
            sopHtml += `<div class="sop-card"><div class="sop-header"><i class="sop-icon fas ${step.icon}"></i><span class="sop-title">${step.title}</span></div><ul class="sop-desc">${step.desc.map(d => `<li>${d}</li>`).join('')}</ul></div>`;
        });
        sopHtml += '</div>';
        return sopHtml;
    }

    // --- 명령어 처리 ---
    function handleCommand(command) {
        const args = command.trim().split(' ');
        const cmd = args[0].toLowerCase();
        const param = args.slice(1).join(' ');
        logToConsole(`<span class="prompt">></span> ${command}`);
        switch(cmd) {
            case 'help':
                logToConsole(`Available Commands:\n  help - 이 도움말을 표시합니다.\n  clear - 콘솔을 지웁니다.\n  find <keyword> - 네비게이터에서 개체를 필터링합니다.\n  open <ID> - 지정된 ID의 개체 탭을 엽니다.`, 'HELP');
                break;
            case 'clear': dom.console.innerHTML = ''; break;
            case 'find':
                dom.navigatorSearch.value = param;
                dom.navigatorSearch.dispatchEvent(new Event('input'));
                logToConsole(`Navigator filtered by "${param}".`);
                const firstResult = dom.navigator.querySelector('.monster-leaf:not([style*="display: none"])');
                if (firstResult) setFocus(firstResult.dataset.id);
                break;
            case 'open':
                if (param && state.activePaneId) openTab(param.toUpperCase(), state.activePaneId);
                else if (!param) logToConsole("Usage: open <Entity_ID>", "CRITICAL");
                else logToConsole("Action Failed: No active pane.", "CRITICAL");
                break;
            default:
                logToConsole(`Unknown command: "${cmd}". Type 'help' for a list of commands.`, "CRITICAL");
        }
    }

    // --- 이벤트 핸들러 ---
    function setupEventListeners() {
        dom.navigator.addEventListener('click', e => {
            const toggleNode = e.target.closest('.toggle-node');
            if (toggleNode) toggleNode.classList.toggle('collapsed');
            const leaf = e.target.closest('.monster-leaf');
            if (leaf) setFocus(leaf.dataset.id);
        });
        dom.navigator.addEventListener('dblclick', e => {
            const leaf = e.target.closest('.monster-leaf');
            if (leaf && state.activePaneId) openTab(leaf.dataset.id, state.activePaneId);
            else if (leaf) logToConsole("Action Failed: No active pane. Click a workspace pane to activate.", "CRITICAL");
        });
        dom.navigatorSearch.addEventListener('input', e => {
            const filterText = e.target.value.toLowerCase();
            dom.navigator.querySelectorAll('.monster-leaf').forEach(leaf => {
                leaf.closest('li').style.display = leaf.textContent.toLowerCase().includes(filterText) ? '' : 'none';
            });
        });
        dom.workspaceArea.addEventListener('click', e => {
            const paneEl = e.target.closest('.workspace-pane');
            if (!paneEl) return;
            setActivePane(paneEl.id);
            const tab = e.target.closest('.tab');
            const closeTabBtn = e.target.closest('.close-tab');
            const closePaneBtn = e.target.closest('.close-pane-btn');
            if (closePaneBtn) closePane(paneEl.id);
            else if (tab) {
                if (closeTabBtn) closeTab(tab.dataset.id, paneEl.id);
                else switchTab(tab.dataset.id, paneEl.id);
            }
        });
        dom.splitViewBtn.addEventListener('click', () => {
            createPane();
            logToConsole("Workspace split.", "SUCCESS");
        });
        dom.consoleInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && dom.consoleInput.value) {
                handleCommand(dom.consoleInput.value);
                dom.consoleInput.value = '';
            }
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Enter' && state.focusedEntityId && state.activePaneId) {
                if (document.activeElement.tagName === 'INPUT') return;
                openTab(state.focusedEntityId, state.activePaneId);
            }
        });
    }

    // --- 초기화 ---
    async function init() {
        // 1. 에이전트 프로필부터 로드
        try {
            const res = await fetch('../database/agents.csv');
            db.agents = Papa.parse(await res.text(), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
        } catch(e) {
            dom.loginError.textContent = "FATAL: CANNOT LOAD AGENT PROFILES";
            return;
        }
        
        // 2. 로그인 이벤트 리스너 설정
        dom.loginCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLoginAttempt();
        });
        dom.loginCodeInput.focus();
    }

    init();
});