document.addEventListener('DOMContentLoaded', () => {
    // --- 글로벌 DB 및 상태 ---
    let db = { monsters: [], items: [], agents: [] };
    let state = {
        activeMonsterId: null,
        queryFilters: { search: '', rank: 'all', category: 'all' },
        currentUser: null,
    };
    const dom = {
        // Login elements
        loginOverlay: document.getElementById('login-overlay'),
        loginCodeInput: document.getElementById('login-code-input'),
        loginError: document.getElementById('login-error'),
        appContainer: document.getElementById('app-container'),
        userInfo: document.getElementById('user-info'),
        
        // App elements
        querySearch: document.getElementById('query-search'),
        queryRank: document.getElementById('query-rank'),
        queryCategory: document.getElementById('query-category'),
        executeQueryBtn: document.getElementById('execute-query-btn'),
        resultsList: document.getElementById('results-list'),
        resultsCount: document.getElementById('results-count'),
        detailPanel: document.getElementById('detail-panel'),
        systemLogContent: document.getElementById('system-log-content'),
    };

    // --- 시스템 로그 ---
    const logSystemMessage = (message, type = 'INFO') => {
        const timestamp = new Date().toLocaleTimeString('en-GB');
        const logContainer = document.createElement('div');
        logContainer.className = 'log-entry';
        logContainer.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> <span class="log-message type-${type}">${message}</span>`;
        dom.systemLogContent.prepend(logContainer);
    };

    // --- 로그인 처리 ---
    async function handleLoginAttempt() {
        const code = parseInt(dom.loginCodeInput.value, 10);
        const agent = db.agents.find(a => a.code === code);

        if (agent) {
            dom.loginError.textContent = '';
            dom.loginCodeInput.disabled = true;
            state.currentUser = agent;
            
            dom.loginOverlay.classList.add('hidden');
            setTimeout(() => {
                dom.appContainer.style.display = 'flex';
                initializeApp();
            }, 500);

        } else {
            dom.loginError.textContent = 'ACCESS DENIED: INVALID CODE';
            dom.loginCodeInput.value = '';
        }
    }

    // --- 메인 앱 초기화 (로그인 성공 후) ---
    async function initializeApp() {
        dom.userInfo.textContent = `USER: ${state.currentUser.name}`;
        logSystemMessage(`User '${state.currentUser.name}' authenticated. Access granted.`, 'SUCCESS');
        
        dom.executeQueryBtn.addEventListener('click', () => {
            state.queryFilters.search = dom.querySearch.value;
            state.queryFilters.rank = dom.queryRank.value;
            state.queryFilters.category = dom.queryCategory.value;
            handleExecuteQuery();
        });
        
        await loadData();
        const initialMonsters = getFilteredMonsters();
        renderResultsList(initialMonsters);
    }

    // --- 데이터 로딩 (몬스터, 아이템) ---
    async function loadData() {
        logSystemMessage("M.A.R.S. v2.6 Initializing...");
        try {
            const [monsterRes, itemRes] = await Promise.all([
                fetch('../database/monster.csv'), fetch('../database/item.csv')
            ]);
            logSystemMessage("Fetching data streams... OK");

            db.monsters = Papa.parse(await monsterRes.text(), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
            db.items = Papa.parse(await itemRes.text(), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
            
            logSystemMessage(`Database synchronized. ${db.monsters.length} monster entities loaded.`, 'SUCCESS');
        } catch (error) {
            logSystemMessage("FATAL: DB CONNECTION FAILED", 'CRITICAL');
        }
    }

    // --- 쿼리 및 필터링 ---
    const getFilteredMonsters = () => {
        const { search, rank, category } = state.queryFilters;
        const searchTerm = search.toLowerCase();
        return db.monsters.filter(m => {
            const name = m.name || '';
            const id = m.ID || '';
            const habit = m.habit || '';
            const cat = m.category || '';
            const matchesSearch = searchTerm === '' || name.toLowerCase().includes(searchTerm) || id.toLowerCase().includes(searchTerm) || habit.toLowerCase().includes(searchTerm);
            const matchesRank = rank === 'all' || m.rank === rank;
            const matchesCategory = category === 'all' || cat.toLowerCase() === category;
            return matchesSearch && matchesRank && matchesCategory;
        });
    };

    // --- 렌더링 함수 ---
    const renderResultsList = (monsters) => {
        dom.resultsList.innerHTML = '';
        dom.resultsCount.textContent = `${monsters.length} Found`;
        if (monsters.length === 0) {
            dom.resultsList.innerHTML = '<div class="placeholder">No results found.</div>';
            return;
        }
        monsters.forEach(m => {
            const item = document.createElement('div');
            item.className = 'result-item';
            item.dataset.id = m.ID;
            if (m.ID === state.activeMonsterId) item.classList.add('active');
            item.innerHTML = `<span class="result-name">${m.name}</span><span class="result-id">${m.ID}</span>`;
            item.addEventListener('click', () => handleResultItemClick(m.ID));
            dom.resultsList.appendChild(item);
        });
    };

    const generateSOP = (monster) => {
        let sopHtml = '<ol class="protocol-list">';
        sopHtml += `<li class="protocol-step"><h4>단계 1: 교전 수칙 (Engagement Protocol)</h4><p>개체 조우 시 최소 50m 이상의 안전거리를 확보. 원거리에서 개체의 현재 상태(부상, 분노 등)를 파악하고, 주변 환경에 이용 가능한 엄폐물이 있는지 확인하시오.</p></li>`;
        let combatDesc = `개체의 위험 등급(Rank ${monster.rank})을 고려하여, 검증된 기본 진형으로 교전을 시작하시오.`;
        if (monster.weak) { combatDesc += ` 해당 개체는 <strong>${monster.weak}</strong> 속성에 구조적 취약점이 보고되었으므로, 관련 속성 공격을 통해 전황을 유리하게 이끌 수 있습니다.`; }
        sopHtml += `<li class="protocol-step"><h4>단계 2: 전투 수행 (Combat Procedure)</h4><p>${combatDesc}</p>`;
        if (['S', 'A', 'B'].includes(monster.rank)) { sopHtml += `<div class="if-condition"><p><span class="condition-tag">IF:</span> 개체가 특수 패턴(예: 광역기 시전, 강화 등)의 전조를 보일 경우,</p><p><span class="condition-tag">THEN:</span> 즉시 지정된 '차단' 또는 '회피' 기동을 수행하고, 서포터는 파티원의 상태를 최우선으로 확인하시오.</p></div>`; }
        sopHtml += `</li>`;
        sopHtml += `<li class="protocol-step"><h4>단계 3: 작전 종료 후 절차 (Post-Action Procedure)</h4><p>개체 무력화 확인 후, 사체 훼손을 최소화하여 지정된 샘플(마정석, 특수 부위 등)을 확보하고 즉시 협회 연구소로 이송할 것. 2차 위협 가능성에 대비하여 주변 경계를 유지하시오.</p></li>`;
        sopHtml += '</ol>';
        return sopHtml;
    };

    const renderDetailPanel = (monsterId) => {
        const monster = db.monsters.find(m => m.ID === monsterId);
        if (!monster) { dom.detailPanel.innerHTML = '<div class="placeholder-center">Error: Entity not found.</div>'; return; }

        dom.detailPanel.innerHTML = `
            <div class="detail-header">
                <div class="report-header-main">
                    <h2>${monster.name}</h2>
                    <span class="report-id">${monster.ID}</span>
                </div>
            </div>
            <div class="detail-tab-header">
                <button class="detail-tab-btn active" data-tab="profile">상세 프로필</button>
                <button class="detail-tab-btn" data-tab="protocol">대응 프로토콜</button>
            </div>
            <div id="profile-content" class="detail-tab-content active">
                <div class="report-section"><h3>I. 기본 정보 (Basic Information)</h3><table class="report-table">
                    <tr><th>위험 등급</th><td><span class="rank-tag rank-${monster.rank.toLowerCase()}">Rank ${monster.rank}</span></td></tr>
                    <tr><th>개체 유형</th><td>${monster.category}</td></tr>
                    <tr><th>주요 서식지</th><td>${monster.habit} (특정 게이트 내 환경)</td></tr>
                </table></div>
                <div class="report-section"><h3>II. 전투 분석 (Combat Analysis)</h3><table class="report-table">
                    <tr><th>확인된 약점</th><td><span class="weakness-tag">${monster.weak}</span></td></tr>
                </table></div>
                <div class="report-section"><h3>III. 개체 설명 (Description)</h3><p>${monster.desc}</p></div>
            </div>
            <div id="protocol-content" class="detail-tab-content">${generateSOP(monster)}</div>`;
        
        dom.detailPanel.querySelectorAll('.detail-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                dom.detailPanel.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                dom.detailPanel.querySelectorAll('.detail-tab-content').forEach(c => c.classList.remove('active'));
                dom.detailPanel.querySelector(`#${tab}-content`).classList.add('active');
            });
        });
        logSystemMessage(`Accessing entity [${monsterId}].`, 'INFO');
    };

    // --- 이벤트 핸들러 ---
    const handleExecuteQuery = () => {
        if (dom.executeQueryBtn.classList.contains('loading')) return;
        const btn = dom.executeQueryBtn;
        btn.disabled = true; btn.classList.add('loading'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> EXECUTING...';
        const queryDesc = `rank=${state.queryFilters.rank}, category=${state.queryFilters.category}, term='${state.queryFilters.search || 'none'}'`;
        logSystemMessage(`Query executed: { ${queryDesc} }`, 'QUERY');
        setTimeout(() => {
            const monsters = getFilteredMonsters();
            renderResultsList(monsters);
            logSystemMessage(`${monsters.length} entities returned.`, 'SUCCESS');
            btn.disabled = false; btn.classList.remove('loading'); btn.innerHTML = '<i class="fas fa-play"></i> EXECUTE QUERY';
        }, 300);
    };

    const handleResultItemClick = (monsterId) => {
        if (state.activeMonsterId === monsterId) return;
        state.activeMonsterId = monsterId;
        renderResultsList(getFilteredMonsters());
        renderDetailPanel(monsterId);
    };

    // --- 초기화 로직 ---
    async function init() {
        try {
            const res = await fetch('../database/agents.csv');
            if (!res.ok) throw new Error(`Failed to fetch agents.csv: ${res.statusText}`);
            db.agents = Papa.parse(await res.text(), { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
        } catch(e) {
            console.error("Agent profile loading failed:", e);
            dom.loginError.textContent = "FATAL: CANNOT LOAD AGENT PROFILES";
            return;
        }
        
        dom.loginCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLoginAttempt();
        });
        dom.loginCodeInput.focus();
    }

    init();
});