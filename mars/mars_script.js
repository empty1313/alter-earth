// M.A.R.S. v2.7 - Integrated Protocol & Scenario Analysis
document.addEventListener('DOMContentLoaded', () => {
    // --- 글로벌 DB 및 상태 ---
    // [v2.7 수정] gates, rooms, scenarios DB 추가
    let db = { monsters: [], items: [], agents: [], protocols: [], scenarios: [], gates: [], rooms: [] };
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
        logContainer.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> <span class="log-message type-${type.toLowerCase()}">${message}</span>`;
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

    // --- [v2.7 수정] 데이터 로딩 확장 ---
    async function loadData() {
        logSystemMessage("M.A.R.S. v2.7 Initializing...");
        try {
            const files_to_load = {
                monsters: '../database/monster.csv',
                items: '../database/item.csv',
                protocols: '../database/protocols.csv',
                scenarios: '../database/scenarios.csv',
                gates: '../database/gates.csv',
                rooms: '../database/rooms.csv'
            };

            const responses = await Promise.all(Object.values(files_to_load).map(url => fetch(url)));
            logSystemMessage("Fetching data streams... OK");

            let i = 0;
            for (const key in files_to_load) {
                const text = await responses[i].text();
                db[key] = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
                i++;
            }
            
            logSystemMessage(`Database synchronized. ${db.monsters.length} entities, ${db.protocols.length} protocols, ${db.scenarios.length} scenarios loaded.`, 'SUCCESS');
        } catch (error) {
            logSystemMessage(`FATAL: DB CONNECTION FAILED - ${error.message}`, 'CRITICAL');
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

    // --- [v2.7 수정] DB 기반 프로토콜 생성 함수 ---
    const generateProtocolFromDB = (monsterId) => {
        const protocols = db.protocols
            .filter(p => p.MonsterID === monsterId)
            .sort((a, b) => a.Step - b.Step);

        if (protocols.length === 0) {
            return '<p>등록된 특수 프로토콜 없음. 표준 교전 수칙을 따르시오.</p>';
        }

        let html = '<ol class="protocol-list">';
        protocols.forEach(p => {
            let linkedScenarioHtml = '';
            // linked_scenario 필드가 있고, 해당 시나리오가 DB에 존재하면 정보 블록 생성
            if (p.linked_scenario && db.scenarios) {
                const scenario = db.scenarios.find(s => s.id === p.linked_scenario);
                if (scenario) {
                    const gate = db.gates.find(g => g.id === scenario.GID);
                    const room = db.rooms.find(r => r.id === scenario.scope_id && r.GID === scenario.GID);

                    linkedScenarioHtml = `
                        <div class="linked-scenario-block">
                            <div class="block-title"><i class="fas fa-link"></i>연관 기믹 정보</div>
                            <p><strong>발생 위치:</strong> ${gate ? gate.name : scenario.GID} - ${room ? room.name : scenario.scope_id}</p>
                            <p><strong>기믹 ID:</strong> ${scenario.id}</p>
                            <p><strong>기믹 설명:</strong> ${scenario.description}</p>
                        </div>
                    `;
                }
            }

            html += `
                <li class="protocol-step">
                    <div class="protocol-header">
                        <span class="protocol-step-num">STEP ${p.Step}</span>
                        <h4 class="protocol-phase">${p.Phase}</h4>
                    </div>
                    <p class="protocol-desc">${p.desc}</p>
                    ${linkedScenarioHtml}
                </li>
            `;
        });
        html += '</ol>';
        return html;
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
                    <tr><th>주요 서식지</th><td>${monster.habit}</td></tr>
                </table></div>
                <div class="report-section"><h3>II. 전투 분석 (Combat Analysis)</h3><table class="report-table">
                    <tr><th>확인된 약점</th><td><span class="weakness-tag">${monster.weak}</span></td></tr>
                </table></div>
                <div class="report-section"><h3>III. 개체 설명 (Description)</h3><p>${monster.desc}</p></div>
            </div>
            <div id="protocol-content" class="detail-tab-content">
                ${generateProtocolFromDB(monster.ID)}
            </div>
        `;
        
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