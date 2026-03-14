// Prompt Toggle Manager
// Mounts inside Chat Completion preset panel

const extensionName   = 'prompt-toggle-manager';
const GLOBAL_DUMMY_ID = 100001;
const TG_KEY          = extensionName;

let getRequestHeaders, openai_setting_names, openai_settings,
    extension_settings, saveSettingsDebounced, oai_settings,
    eventSource, event_types, setupChatCompletionPromptManager;

async function initImports() {
    const scriptPath   = import.meta.url;
    const isThirdParty = scriptPath.includes('/third-party/');
    const base  = isThirdParty ? '../../../../' : '../../../';
    const base2 = isThirdParty ? '../../../'    : '../../';

    const sm = await import(base + 'script.js');
    getRequestHeaders     = sm.getRequestHeaders;
    saveSettingsDebounced = sm.saveSettingsDebounced;
    eventSource           = sm.eventSource;
    event_types           = sm.event_types;

    const om = await import(base2 + 'openai.js');
    openai_setting_names              = om.openai_setting_names;
    openai_settings                   = om.openai_settings;
    oai_settings                      = om.oai_settings;
    setupChatCompletionPromptManager  = om.setupChatCompletionPromptManager;

    const em = await import(base2 + 'extensions.js');
    extension_settings = em.extension_settings;
}

// ══════════════════════════════════════════
// A. Toggle Group Data
// ══════════════════════════════════════════

function getTGStore() {
    if (!extension_settings[TG_KEY]) extension_settings[TG_KEY] = { presets: {} };
    return extension_settings[TG_KEY];
}
function getGroupsForPreset(presetName) {
    const s = getTGStore();
    if (!s.presets[presetName]) s.presets[presetName] = [];
    return s.presets[presetName];
}
function saveGroups(presetName, groups) {
    getTGStore().presets[presetName] = groups;
    saveSettingsDebounced();
}
function getCurrentPreset() {
    return oai_settings?.preset_settings_openai || '';
}

// ══════════════════════════════════════════
// B. Apply group ON/OFF → actually update prompt_order + re-render ST
// ══════════════════════════════════════════

function applyGroup(presetName, gi) {
    const groups = getGroupsForPreset(presetName);
    const g      = groups[gi];
    if (!g) return;

    const preset = openai_settings[openai_setting_names[presetName]];
    if (!preset) return;

    // Update every prompt_order entry (global + per-character)
    if (preset.prompt_order) {
        for (const orderEntry of preset.prompt_order) {
            if (!orderEntry.order) continue;
            for (const t of g.toggles) {
                const item = orderEntry.order.find(e => e.identifier === t.target);
                if (item) item.enabled = (t.behavior === 'invert') ? !g.isOn : g.isOn;
            }
        }
    }

    // Tell ST to re-render the prompt manager
    try {
        const pm = setupChatCompletionPromptManager(oai_settings);
        pm.render();
        pm.saveServiceSettings();
    } catch (_) {}
}

// ══════════════════════════════════════════
// C. Toggle Group UI
// ══════════════════════════════════════════

function renderTGGroups() {
    const area = document.getElementById('ptm-tg-area');
    if (!area) return;
    const pn = getCurrentPreset();
    if (!pn) { area.innerHTML = '<div class="ptm-ph">프리셋이 선택되지 않았습니다</div>'; return; }
    const groups = getGroupsForPreset(pn);
    if (!groups.length) { area.innerHTML = '<div class="ptm-ph">그룹이 없습니다</div>'; return; }
    area.innerHTML = groups.map((g, gi) => buildGroupCard(g, gi, pn)).join('');
    wireGroupCards(area);
}

function buildGroupCard(g, gi, pn) {
    const preset     = openai_settings[openai_setting_names[pn]];
    const allPrompts = preset?.prompts || [];

    const rows = g.toggles.map((t, ti) => {
        const name = allPrompts.find(p => p.identifier === t.target)?.name || t.target;
        return `
        <div class="ptm-trow">
            <span class="ptm-tname">${name}</span>
            <select class="ptm-bsel" data-gi="${gi}" data-ti="${ti}">
                <option value="direct" ${t.behavior==='direct'?'selected':''}>동일</option>
                <option value="invert" ${t.behavior==='invert'?'selected':''}>반전</option>
            </select>
            <button class="ptm-ibtn ptm-danger ptm-del-toggle" data-gi="${gi}" data-ti="${ti}">삭제</button>
        </div>`;
    }).join('');

    return `
    <div class="ptm-card">
        <div class="ptm-card-head">
            <button class="ptm-onoff ${g.isOn?'ptm-on':'ptm-off'}" data-gi="${gi}">${g.isOn?'On':'Off'}</button>
            <span class="ptm-gname">${g.name}</span>
            <div class="ptm-gbtns">
                <button class="ptm-ibtn ptm-copy-grp" data-gi="${gi}">복사</button>
                <button class="ptm-ibtn ptm-move-grp" data-gi="${gi}">이동</button>
                <button class="ptm-ibtn ptm-ren-grp" data-gi="${gi}">이름 변경</button>
                <button class="ptm-ibtn ptm-danger ptm-del-grp" data-gi="${gi}">삭제</button>
            </div>
        </div>
        <div class="ptm-tlist">
            ${rows || '<div class="ptm-ph" style="padding:6px;font-size:11px">토글 없음</div>'}
        </div>
        <button class="ptm-sm ptm-sm-full ptm-add-toggle" data-gi="${gi}">+ 토글 추가</button>
    </div>`;
}

function wireGroupCards(area) {
    // On/Off
    area.querySelectorAll('.ptm-onoff').forEach(btn => btn.addEventListener('click', () => {
        const gi = +btn.dataset.gi, pn = getCurrentPreset();
        const groups = getGroupsForPreset(pn);
        groups[gi].isOn = !groups[gi].isOn;
        applyGroup(pn, gi);
        saveGroups(pn, groups);
        renderTGGroups();
    }));
    // Rename
    area.querySelectorAll('.ptm-ren-grp').forEach(btn => btn.addEventListener('click', () => {
        const gi = +btn.dataset.gi, pn = getCurrentPreset();
        const groups = getGroupsForPreset(pn);
        const n = prompt('그룹 이름 변경:', groups[gi].name);
        if (!n?.trim()) return;
        groups[gi].name = n.trim();
        saveGroups(pn, groups); renderTGGroups();
    }));
    // Delete group
    area.querySelectorAll('.ptm-del-grp').forEach(btn => btn.addEventListener('click', () => {
        const gi = +btn.dataset.gi, pn = getCurrentPreset();
        const groups = getGroupsForPreset(pn);
        if (!confirm(`"${groups[gi].name}" 삭제?`)) return;
        groups.splice(gi, 1);
        saveGroups(pn, groups); renderTGGroups();
    }));
    // Copy/Move group to another preset
    area.querySelectorAll('.ptm-copy-grp').forEach(btn => btn.addEventListener('click', () => showPresetPicker(+btn.dataset.gi, false)));
    area.querySelectorAll('.ptm-move-grp').forEach(btn => btn.addEventListener('click', () => showPresetPicker(+btn.dataset.gi, true)));
    // Behavior
    area.querySelectorAll('.ptm-bsel').forEach(sel => sel.addEventListener('change', () => {
        const gi = +sel.dataset.gi, ti = +sel.dataset.ti, pn = getCurrentPreset();
        const groups = getGroupsForPreset(pn);
        groups[gi].toggles[ti].behavior = sel.value;
        saveGroups(pn, groups);
    }));
    // Delete toggle
    area.querySelectorAll('.ptm-del-toggle').forEach(btn => btn.addEventListener('click', () => {
        const gi = +btn.dataset.gi, ti = +btn.dataset.ti, pn = getCurrentPreset();
        const groups = getGroupsForPreset(pn);
        groups[gi].toggles.splice(ti, 1);
        saveGroups(pn, groups); renderTGGroups();
    }));
    // Add toggle
    area.querySelectorAll('.ptm-add-toggle').forEach(btn => btn.addEventListener('click', () => showAddToggleModal(+btn.dataset.gi)));
}

// ── Preset picker (copy/move group) ──────────────────────────────
function showPresetPicker(gi, isMove) {
    const srcPn  = getCurrentPreset();
    const groups = getGroupsForPreset(srcPn);
    const g      = groups[gi];
    const others = Object.keys(openai_setting_names).filter(n => openai_settings[openai_setting_names[n]] && n !== srcPn);
    if (!others.length) { toastr.warning('다른 프리셋이 없습니다'); return; }

    const modal = buildModal(
        `"${g.name}" ${isMove?'이동':'복사'} — 대상 프리셋`,
        `<div class="ptm-mlist">
            ${others.map(n => `<div class="ptm-mitem ptm-preset-pick" data-preset="${n}">${n}</div>`).join('')}
        </div>`
    );

    modal.querySelectorAll('.ptm-preset-pick').forEach(item => {
        item.addEventListener('click', () => {
            const dst = item.dataset.preset;
            const dg  = getGroupsForPreset(dst);
            let name  = g.name, c = 1;
            while (dg.some(x => x.name === name)) name = `${g.name} (${c++})`;
            dg.push({ name, isOn: false, toggles: JSON.parse(JSON.stringify(g.toggles)) });
            saveGroups(dst, dg);
            if (isMove) { groups.splice(gi, 1); saveGroups(srcPn, groups); renderTGGroups(); }
            toastr.success(`"${name}"을(를) "${dst}"에 ${isMove?'이동':'복사'}했습니다`);
            modal.remove();
        });
    });
}

// ── Add toggle modal ──────────────────────────────────────────────
function showAddToggleModal(gi) {
    const pn     = getCurrentPreset();
    const preset = openai_settings[openai_setting_names[pn]];
    if (!preset) return;
    const groups  = getGroupsForPreset(pn);
    const exists  = new Set(groups[gi].toggles.map(t => t.target));
    const prompts = preset.prompts || [];

    const modal = buildModal(
        `토글 추가 — ${groups[gi].name}`,
        `<div style="padding:8px 12px">
            <input type="text" id="ptm-msearch" class="ptm-tinput" placeholder="검색...">
        </div>
        <div class="ptm-mlist" id="ptm-mlist">
            ${prompts.map(p => {
                const ex = exists.has(p.identifier);
                return `<label class="ptm-mitem ${ex?'ptm-mitem-ex':''}">
                    <input type="checkbox" data-id="${p.identifier}" ${ex?'disabled checked':''}>
                    <span>${p.name||p.identifier}</span>
                    ${ex?'<span class="ptm-badge">추가됨</span>':''}
                </label>`;
            }).join('')}
        </div>
        <div class="ptm-mfoot">
            <button class="ptm-btn ptm-btn-copy" id="ptm-mconfirm">선택 항목 추가</button>
        </div>`
    );

    modal.querySelector('#ptm-msearch').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        modal.querySelectorAll('#ptm-mlist .ptm-mitem').forEach(el => {
            el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });
    modal.querySelector('#ptm-mconfirm').addEventListener('click', () => {
        const sel = [...modal.querySelectorAll('#ptm-mlist input:checked:not(:disabled)')].map(c => c.dataset.id);
        if (!sel.length) { toastr.warning('추가할 항목을 선택하세요'); return; }
        const groups = getGroupsForPreset(getCurrentPreset());
        sel.forEach(id => groups[gi].toggles.push({ target: id, behavior: 'direct' }));
        saveGroups(getCurrentPreset(), groups);
        renderTGGroups();
        modal.remove();
        toastr.success(`${sel.length}개 추가됨`);
    });
}

// ── Generic modal builder — appended to #ptm-tg-drawer to avoid z-index traps ──
function buildModal(title, bodyHTML) {
    // Remove any existing modal
    document.getElementById('ptm-modal')?.remove();

    const wrap = document.createElement('div');
    wrap.id = 'ptm-modal';
    wrap.innerHTML = `
        <div class="ptm-mbox">
            <div class="ptm-mhead">
                <span>${title}</span>
                <button class="ptm-ibtn" id="ptm-mclose">닫기</button>
            </div>
            ${bodyHTML}
        </div>`;

    // Append INSIDE the TG drawer so it inherits the same stacking context
    const drawer = document.getElementById('ptm-tg-drawer') || document.body;
    drawer.appendChild(wrap);

    wrap.querySelector('#ptm-mclose').addEventListener('click', () => wrap.remove());
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    return wrap;
}

// ══════════════════════════════════════════
// D. Mover helpers
// ══════════════════════════════════════════

let sourcePresetName      = '';
let targetPresetName      = '';
let sourceOrderedPrompts  = [];
let targetOrderedPrompts  = [];
let selectedSourceIndices = new Set();
let insertPosition        = -1;

function getPromptOrder(preset) {
    if (!preset?.prompt_order) return [];
    const e = preset.prompt_order.find(o => String(o.character_id) === String(GLOBAL_DUMMY_ID));
    return e?.order || [];
}
function getOrderedPrompts(preset) {
    const order   = getPromptOrder(preset);
    const prompts = preset?.prompts || [];
    return order.map(e => {
        const def = prompts.find(p => p.identifier === e.identifier);
        return { identifier: e.identifier, enabled: e.enabled,
                 prompt: def || { identifier: e.identifier, name: e.identifier } };
    });
}
async function savePreset(name, preset) {
    const r = await fetch('/api/presets/save', {
        method:'POST', headers: getRequestHeaders(),
        body: JSON.stringify({ apiId:'openai', name, preset }),
    });
    if (!r.ok) throw new Error('프리셋 저장 실패');
    return r.json();
}
function getPresetOptions() {
    if (!openai_settings || !openai_setting_names) return '<option value="">-- 프리셋 없음 --</option>';
    return '<option value="">-- 선택 --</option>'
        + Object.keys(openai_setting_names)
            .filter(n => openai_settings[openai_setting_names[n]])
            .map(n => `<option value="${n}">${n}</option>`).join('');
}

// ══════════════════════════════════════════
// E. Build two drawers
// ══════════════════════════════════════════

function buildMoverDrawer() {
    const presets = getPresetOptions();
    const el = document.createElement('div');
    el.id = 'ptm-mover-drawer';
    el.innerHTML = `
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Prompt Multi-Mover</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="ptm-block">
                <label class="ptm-label">① 출발 프리셋</label>
                <select id="ptm-src" class="ptm-sel">${presets}</select>
            </div>
            <div class="ptm-block">
                <div class="ptm-lrow">
                    <label class="ptm-label">② 이동할 항목</label>
                    <div>
                        <button class="ptm-sm" id="ptm-all">전체</button>
                        <button class="ptm-sm" id="ptm-none">해제</button>
                        <button class="ptm-sm" id="ptm-range">연속</button>
                    </div>
                </div>
                <div id="ptm-src-list" class="ptm-list"><div class="ptm-ph">출발 프리셋을 선택하세요</div></div>
            </div>
            <div class="ptm-block">
                <label class="ptm-label">③ 도착 프리셋</label>
                <select id="ptm-dst" class="ptm-sel">${presets}</select>
            </div>
            <div class="ptm-block">
                <label class="ptm-label">④ 삽입 위치 (+ 클릭)</label>
                <div id="ptm-dst-list" class="ptm-list"><div class="ptm-ph">도착 프리셋을 선택하세요</div></div>
            </div>
            <div class="ptm-block ptm-gblock">
                <label class="ptm-grow">
                    <input type="checkbox" id="ptm-make-group">
                    <span>복사/이동 후 토글 그룹으로 묶기</span>
                </label>
                <div id="ptm-gname-row" class="ptm-hidden">
                    <input type="text" id="ptm-gname" class="ptm-tinput" placeholder="그룹 이름 입력..." style="margin-top:6px">
                </div>
            </div>
            <div id="ptm-info" class="ptm-info">항목과 위치를 선택하면 버튼이 활성화됩니다</div>
            <div class="ptm-brow">
                <button id="ptm-copy" class="ptm-btn ptm-btn-copy" disabled>복사</button>
                <button id="ptm-move" class="ptm-btn ptm-btn-move" disabled>이동</button>
            </div>
        </div>
    </div>`;
    return el;
}

function buildTGDrawer() {
    const el = document.createElement('div');
    el.id = 'ptm-tg-drawer';
    el.style.position = 'relative'; // modal anchor
    el.innerHTML = `
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>토글 그룹 관리</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div id="ptm-tg-area"><div class="ptm-ph">로딩 중...</div></div>
            <button class="ptm-sm ptm-sm-full" id="ptm-add-group">+ 그룹 추가</button>
        </div>
    </div>`;
    return el;
}

// ══════════════════════════════════════════
// F. Render mover
// ══════════════════════════════════════════

function renderSrcList() {
    const el = document.getElementById('ptm-src-list');
    if (!el) return;
    if (!sourceOrderedPrompts.length) { el.innerHTML = '<div class="ptm-ph">프롬프트 없음</div>'; return; }
    el.innerHTML = sourceOrderedPrompts.map((e, i) => {
        const name = e.prompt.name || e.identifier || 'Unnamed';
        const chk  = selectedSourceIndices.has(i);
        return `<label class="ptm-item ${!e.enabled?'ptm-off':''} ${chk?'ptm-chked':''}">
            <input type="checkbox" class="ptm-chk" data-i="${i}" ${chk?'checked':''}>
            <span class="ptm-num">#${i+1}</span>
            <span class="ptm-name">${e.prompt.marker?'[고정] ':''}${name}</span>
        </label>`;
    }).join('');
    el.querySelectorAll('.ptm-chk').forEach(cb => cb.addEventListener('change', ev => {
        const i = +ev.target.dataset.i;
        if (ev.target.checked) { selectedSourceIndices.add(i); ev.target.closest('.ptm-item').classList.add('ptm-chked'); }
        else { selectedSourceIndices.delete(i); ev.target.closest('.ptm-item').classList.remove('ptm-chked'); }
        updateButtons();
    }));
}

function renderDstList() {
    const el = document.getElementById('ptm-dst-list');
    if (!el) return;
    const slot = (i) => `<div class="ptm-slot ${insertPosition===i?'ptm-slot-on':''}" data-slot="${i}">+</div>`;
    if (!targetOrderedPrompts.length) { el.innerHTML = slot(0); el.querySelector('.ptm-slot').addEventListener('click', () => selectSlot(0)); return; }
    el.innerHTML = slot(0) + targetOrderedPrompts.map((e, i) => {
        const name = e.prompt.name || e.identifier || 'Unnamed';
        return `<div class="ptm-ditem ${!e.enabled?'ptm-off':''}">
            <span class="ptm-num">#${i+1}</span>
            <span class="ptm-name">${e.prompt.marker?'[고정] ':''}${name}</span>
        </div>${slot(i+1)}`;
    }).join('');
    el.querySelectorAll('.ptm-slot').forEach(s => s.addEventListener('click', () => selectSlot(+s.dataset.slot)));
}

function selectSlot(s) { insertPosition = s; renderDstList(); updateButtons(); }

function updateButtons() {
    const n = selectedSourceIndices.size;
    const ok = sourcePresetName && targetPresetName && n > 0 && insertPosition >= 0;
    document.getElementById('ptm-copy').disabled = !ok;
    document.getElementById('ptm-move').disabled = !(ok && sourcePresetName !== targetPresetName);
    const info = document.getElementById('ptm-info'); if (!info) return;
    if (!sourcePresetName)      info.textContent = '출발 프리셋을 선택하세요';
    else if (!n)                info.textContent = '이동할 항목을 체크하세요';
    else if (!targetPresetName) info.textContent = `${n}개 선택됨 · 도착 프리셋을 선택하세요`;
    else if (insertPosition<0)  info.textContent = `${n}개 선택됨 · 삽입 위치(+)를 클릭하세요`;
    else                        info.textContent = `${n}개 선택 · 복사 또는 이동 클릭`;
}

// ══════════════════════════════════════════
// G. Perform copy/move
// ══════════════════════════════════════════

async function performOperation(isMove) {
    const n = selectedSourceIndices.size;
    if (!sourcePresetName || !targetPresetName || !n || insertPosition < 0) return;
    const makeGroup = document.getElementById('ptm-make-group')?.checked;
    const groupName = document.getElementById('ptm-gname')?.value.trim();
    if (makeGroup && !groupName) { toastr.warning('그룹 이름을 입력해주세요'); document.getElementById('ptm-gname')?.focus(); return; }

    const srcIdx   = openai_setting_names[sourcePresetName];
    const dstIdx   = openai_setting_names[targetPresetName];
    const selected = [...selectedSourceIndices].sort((a,b)=>a-b).map(i=>sourceOrderedPrompts[i]).filter(Boolean);

    const tp = JSON.parse(JSON.stringify(openai_settings[dstIdx]));
    tp.prompts      = tp.prompts      || [];
    tp.prompt_order = tp.prompt_order || [];

    const existingIds = new Set(tp.prompts.map(p => p.identifier));
    const newIds      = [];

    selected.forEach((entry, offset) => {
        const pd = JSON.parse(JSON.stringify(entry.prompt));
        let id   = pd.identifier;
        if (existingIds.has(id)) {
            let c = 1; const base = id.replace(/_\d+$/, '');
            while (existingIds.has(`${base}_${c}`)) c++;
            id = `${base}_${c}`; pd.identifier = id;
            pd.name = `${pd.name || entry.identifier} (${c})`;
        }
        existingIds.add(id); newIds.push(id);
        tp.prompts.push(pd);
        const go = tp.prompt_order.find(o => String(o.character_id) === String(GLOBAL_DUMMY_ID));
        if (go?.order) go.order.splice(insertPosition + offset, 0, { identifier: id, enabled: true });
        else tp.prompt_order.push({ character_id: GLOBAL_DUMMY_ID, order: [{ identifier: id, enabled: true }] });
        for (const oe of tp.prompt_order)
            if (String(oe.character_id) !== String(GLOBAL_DUMMY_ID) && oe.order)
                oe.order.push({ identifier: id, enabled: true });
    });

    try {
        await savePreset(targetPresetName, tp);
        openai_settings[dstIdx] = tp;

        if (isMove && sourcePresetName !== targetPresetName) {
            const sp  = JSON.parse(JSON.stringify(openai_settings[srcIdx]));
            const rem = new Set(selected.map(e => e.identifier));
            sp.prompts = sp.prompts.filter(p => !rem.has(p.identifier));
            if (sp.prompt_order) for (const o of sp.prompt_order) if (o.order) o.order = o.order.filter(e => !rem.has(e.identifier));
            await savePreset(sourcePresetName, sp);
            openai_settings[srcIdx] = sp;
        }

        if (makeGroup && groupName) {
            const gs = getGroupsForPreset(targetPresetName);
            let fn = groupName, c = 1;
            while (gs.some(g => g.name === fn)) fn = `${groupName} (${c++})`;
            gs.push({ name: fn, isOn: false, toggles: newIds.map(id => ({ target: id, behavior: 'direct' })) });
            saveGroups(targetPresetName, gs);
            toastr.success(`${n}개 ${isMove?'이동':'복사'} 완료 + 그룹 "${fn}" 생성!`);
        } else {
            toastr.success(`${n}개 ${isMove?'이동':'복사'} 완료`);
        }

        sourceOrderedPrompts = getOrderedPrompts(openai_settings[srcIdx]);
        targetOrderedPrompts = getOrderedPrompts(openai_settings[dstIdx]);
        selectedSourceIndices.clear(); insertPosition = -1;
        const cb = document.getElementById('ptm-make-group'); if (cb) cb.checked = false;
        document.getElementById('ptm-gname-row')?.classList.add('ptm-hidden');
        const gi = document.getElementById('ptm-gname'); if (gi) gi.value = '';
        renderSrcList(); renderDstList(); updateButtons();
    } catch (err) { console.error('[PTM]', err); toastr.error('실패: ' + err.message); }
}

// ══════════════════════════════════════════
// H. Wire events
// ══════════════════════════════════════════

function wireMover() {
    document.getElementById('ptm-src')?.addEventListener('change', e => {
        sourcePresetName = e.target.value; selectedSourceIndices.clear();
        sourceOrderedPrompts = sourcePresetName ? getOrderedPrompts(openai_settings[openai_setting_names[sourcePresetName]]) : [];
        renderSrcList(); updateButtons();
    });
    document.getElementById('ptm-dst')?.addEventListener('change', e => {
        targetPresetName = e.target.value; insertPosition = -1;
        targetOrderedPrompts = targetPresetName ? getOrderedPrompts(openai_settings[openai_setting_names[targetPresetName]]) : [];
        renderDstList(); updateButtons();
    });
    document.getElementById('ptm-all')?.addEventListener('click', () => {
        document.querySelectorAll('#ptm-src-list .ptm-chk').forEach(cb => {
            cb.checked = true; selectedSourceIndices.add(+cb.dataset.i); cb.closest('.ptm-item').classList.add('ptm-chked');
        }); updateButtons();
    });
    document.getElementById('ptm-none')?.addEventListener('click', () => {
        document.querySelectorAll('#ptm-src-list .ptm-chk').forEach(cb => {
            cb.checked = false; cb.closest('.ptm-item').classList.remove('ptm-chked');
        }); selectedSourceIndices.clear(); updateButtons();
    });
    document.getElementById('ptm-range')?.addEventListener('click', () => {
        if (selectedSourceIndices.size < 2) { toastr.warning('시작과 끝 항목 2개를 선택하세요'); return; }
        const s = [...selectedSourceIndices].sort((a,b)=>a-b), mn = s[0], mx = s[s.length-1];
        for (let i = mn; i <= mx; i++) selectedSourceIndices.add(i);
        document.querySelectorAll('#ptm-src-list .ptm-chk').forEach(cb => {
            const i = +cb.dataset.i;
            if (i >= mn && i <= mx) { cb.checked = true; cb.closest('.ptm-item').classList.add('ptm-chked'); }
        }); updateButtons();
    });
    document.getElementById('ptm-make-group')?.addEventListener('change', e => {
        document.getElementById('ptm-gname-row')?.classList[e.target.checked?'remove':'add']('ptm-hidden');
        if (e.target.checked) document.getElementById('ptm-gname')?.focus();
    });
    document.getElementById('ptm-copy')?.addEventListener('click', () => performOperation(false));
    document.getElementById('ptm-move')?.addEventListener('click', () => performOperation(true));
}

function wireTG() {
    document.getElementById('ptm-add-group')?.addEventListener('click', () => {
        const pn = getCurrentPreset();
        if (!pn) { toastr.warning('프리셋을 먼저 선택하세요'); return; }
        const name = prompt('새 그룹 이름:');
        if (!name?.trim()) return;
        const gs = getGroupsForPreset(pn);
        if (gs.some(g => g.name === name.trim())) { toastr.warning('같은 이름이 이미 있습니다'); return; }
        gs.push({ name: name.trim(), isOn: false, toggles: [] });
        saveGroups(pn, gs); renderTGGroups();
    });
}

// ══════════════════════════════════════════
// I. Mount & Init
// ══════════════════════════════════════════

function mount() {
    if (document.getElementById('ptm-mover-drawer')) return true;
    const target = document.querySelector('.range-block.m-b-1');
    if (!target) return false;
    const tg    = buildTGDrawer();
    const mover = buildMoverDrawer();
    target.before(tg);
    tg.before(mover);
    wireMover(); wireTG(); renderTGGroups();
    return true;
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);
    try {
        await initImports();
        let c = 0;
        const t = setInterval(() => { if (mount() || ++c > 50) clearInterval(t); }, 200);
        eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => renderTGGroups());
        console.log(`[${extensionName}] Loaded`);
    } catch (err) { console.error(`[${extensionName}] Failed:`, err); }
});
