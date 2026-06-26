/* ============================================================
 * 逆算カレンダー app.js（目標管理ツール / ライトUI版）
 * - 3タブ構成: 今日 / 記録 / 目標設定
 * - 目標を1つ設定し、ゴール日までの残り日数を確認
 * - その日の「一歩」を日付ごとに記録（同じ日は上書き）
 * - 目標に If-Then ルール（もし〇〇したら、△△する）を1つ持てる
 * - データはすべて localStorage に保存
 * ============================================================ */

const STORAGE_KEY = 'gyakusan-calendar';

/* ---------- 状態 ---------- */
// state = {
//   goal: { name, startDate, goalDate, ifThen:{cond,action} } | null,
//   entries: { "YYYY-MM-DD": { text } }
// }
let state = loadState();

function loadState() {
  let data = { goal: null, entries: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) { /* 壊れていたら初期化 */ }

  // 旧形式（days:{tasks,memo}）→ entries へ移行
  if (data.days && !data.entries) {
    data.entries = {};
    for (const [date, day] of Object.entries(data.days)) {
      const parts = [];
      if (Array.isArray(day.tasks)) day.tasks.forEach(t => parts.push((t.done ? '✓ ' : '') + t.text));
      if (day.memo) parts.push(day.memo);
      if (parts.length) data.entries[date] = { text: parts.join('\n') };
    }
    delete data.days;
  }
  if (!data.entries) data.entries = {};
  // 文字列 or 旧{text,category} → {text} に正規化
  for (const [date, v] of Object.entries(data.entries)) {
    if (typeof v === 'string') data.entries[date] = { text: v };
    else if (v && typeof v === 'object') data.entries[date] = { text: v.text || '' };
  }
  return data;
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

/* ---------- 日付ユーティリティ ---------- */
function todayStr() { return toDateStr(new Date()); }
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
function diffDays(aStr, bStr) { return Math.round((parseDate(bStr) - parseDate(aStr)) / 86400000); }
const WD = ['日','月','火','水','木','金','土'];
function formatLong(str) { const d = parseDate(str); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${WD[d.getDay()]}）`; }
function formatHeader(str) { const d = parseDate(str); return `${d.getMonth()+1}月${d.getDate()}日（${WD[d.getDay()]}）`; }
function formatSlash(str) { const d = parseDate(str); return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}（${WD[d.getDay()]}）`; }

const $ = (id) => document.getElementById(id);

/* ============================================================
 * タブ切り替え
 * ============================================================ */
function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  $('tab-' + name).classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('is-active', b.dataset.tab === name));
  $('header-date').textContent = formatHeader(todayStr());
  if (name === 'today') renderToday();
  if (name === 'records') renderRecords();
  if (name === 'settings') { fillSettings(); updatePreview(); }
}
document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

/* ============================================================
 * 今日タブ
 * ============================================================ */
function renderToday() {
  const hasGoal = !!state.goal;
  $('no-goal').classList.toggle('hidden', hasGoal);
  $('today-body').classList.toggle('hidden', !hasGoal);
  if (!hasGoal) return;

  const today = todayStr();
  const remain = diffDays(today, state.goal.goalDate);
  const reached = remain <= 0; // 当日 or 過ぎた

  // 達成セレブレーション と 通常ヒーローの切り替え
  document.querySelector('.hero').classList.toggle('hidden', reached);
  $('celebrate').classList.toggle('hidden', !reached);

  if (reached) {
    renderCelebrate(remain);
    $('rule-banner').classList.add('hidden');
  } else {
    $('goal-headline').textContent = `${state.goal.name}まで`;
    $('days-number').textContent = remain;
    renderRuleBanner();
  }

  // 今日の記録を反映
  const e = state.entries[today];
  $('step-input').value = e ? e.text : '';
  $('save-status').textContent = '';
}

// 達成画面の内容を埋める
function renderCelebrate(remain) {
  $('celebrate-goal').textContent = state.goal.name;
  $('celebrate-title').textContent = remain === 0 ? '🎉 目標日です！' : '🎉 達成おめでとう！';

  const total = Math.max(diffDays(state.goal.startDate, state.goal.goalDate), 1);
  const recorded = Object.values(state.entries).filter(x => x.text && x.text.trim()).length;
  let summary = recorded > 0
    ? `${total}日間で ${recorded}日ぶんの一歩を記録しました。`
    : `${total}日間、おつかれさまでした。`;
  if (remain < 0) summary += `（目標日から${Math.abs(remain)}日経過）`;
  $('celebrate-summary').textContent = summary;
}

// If-Then ルールのバナー
function renderRuleBanner() {
  const r = state.goal.ifThen;
  const banner = $('rule-banner');
  if (r && r.cond && r.action) {
    banner.innerHTML = '';
    const icon = document.createElement('span');
    icon.className = 'rule-ic'; icon.textContent = '🔁';
    const txt = document.createElement('span');
    txt.className = 'rule-text';
    const b1 = document.createElement('b'); b1.textContent = r.cond;
    const b2 = document.createElement('b'); b2.textContent = r.action;
    txt.append('もし ', b1, '、', b2);
    banner.append(icon, txt);
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

$('save-step').addEventListener('click', () => {
  const today = todayStr();
  const text = $('step-input').value.trim();
  if (text) state.entries[today] = { text };
  else delete state.entries[today];
  saveState();
  $('save-status').textContent = '保存しました ✓';
});

$('go-setup').addEventListener('click', () => switchTab('settings'));
$('to-records').addEventListener('click', () => switchTab('records'));
$('to-newgoal').addEventListener('click', () => switchTab('settings'));

/* ============================================================
 * 記録タブ
 * ============================================================ */
function renderRecords() {
  // 目標バー
  if (state.goal) {
    $('rec-goal-name').textContent = state.goal.name;
    const r = diffDays(todayStr(), state.goal.goalDate);
    $('rec-remain').textContent = r < 0 ? 0 : r;
  } else {
    $('rec-goal-name').textContent = '未設定';
    $('rec-remain').textContent = '--';
  }

  const q = ($('record-search').value || '').trim().toLowerCase();

  const dates = Object.keys(state.entries)
    .filter(d => state.entries[d] && state.entries[d].text && state.entries[d].text.trim())
    .filter(d => !q || state.entries[d].text.toLowerCase().includes(q))
    .sort().reverse();

  const list = $('record-list');
  list.innerHTML = '';
  $('record-empty').classList.toggle('hidden', dates.length !== 0);

  dates.forEach(date => {
    const e = state.entries[date];

    const item = document.createElement('div');
    item.className = 'rec-item';

    const dot = document.createElement('span');
    dot.className = 'rec-dot';

    const card = document.createElement('div');
    card.className = 'rec-card';

    const top = document.createElement('div');
    top.className = 'rec-top';
    const dEl = document.createElement('span');
    dEl.className = 'rec-date';
    dEl.textContent = formatSlash(date);
    const menu = document.createElement('button');
    menu.className = 'rec-menu';
    menu.type = 'button';
    menu.textContent = '⋯';
    menu.setAttribute('aria-label', 'この記録を削除');
    menu.addEventListener('click', () => {
      if (confirm(`${formatSlash(date)} の記録を削除しますか？`)) {
        delete state.entries[date];
        saveState();
        renderRecords();
      }
    });
    top.append(dEl, menu);

    const txt = document.createElement('p');
    txt.className = 'rec-text';
    txt.textContent = e.text;

    card.append(top, txt);
    item.append(dot, card);
    list.appendChild(item);
  });
}
$('record-search').addEventListener('input', renderRecords);

/* ============================================================
 * 目標設定タブ
 * ============================================================ */
function fillSettings() {
  if (state.goal) {
    $('goal-name').value = state.goal.name;
    $('goal-start').value = state.goal.startDate;
    $('goal-end').value = state.goal.goalDate;
    $('rule-if').value = state.goal.ifThen ? (state.goal.ifThen.cond || '') : '';
    $('rule-then').value = state.goal.ifThen ? (state.goal.ifThen.action || '') : '';
  } else {
    $('goal-name').value = '';
    $('goal-start').value = todayStr();
    $('goal-end').value = '';
    $('rule-if').value = '';
    $('rule-then').value = '';
  }
  $('form-error').textContent = '';
}

function updatePreview() {
  const name = $('goal-name').value.trim();
  const start = $('goal-start').value;
  const end = $('goal-end').value;

  $('pv-name').textContent = name || '—';
  $('pv-start').textContent = start ? formatLong(start) : '—';
  $('pv-end').textContent = end ? formatLong(end) : '—';

  if (start && end && diffDays(start, end) > 0) {
    const days = diffDays(start, end);
    $('pv-days').textContent = days;
    const months = Math.round(days / 30.4);
    $('pv-months').textContent = days >= 30 ? `（約${months}か月）` : '';
  } else {
    $('pv-days').textContent = '--';
    $('pv-months').textContent = '';
  }
}
['goal-name', 'goal-start', 'goal-end'].forEach(id => $(id).addEventListener('input', updatePreview));

$('goal-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('goal-name').value.trim();
  const start = $('goal-start').value;
  const end = $('goal-end').value;
  const cond = $('rule-if').value.trim();
  const action = $('rule-then').value.trim();
  const err = $('form-error');

  if (!name) { err.textContent = '目標名を入力してください。'; return; }
  if (!start || !end) { err.textContent = '開始日とゴール日を入力してください。'; return; }
  if (diffDays(start, end) <= 0) { err.textContent = 'ゴール日は開始日より後にしてください。'; return; }

  state.goal = { name, startDate: start, goalDate: end, ifThen: { cond, action } };
  saveState();
  switchTab('today');
});

$('reset-btn').addEventListener('click', () => {
  if (confirm('目標とすべての記録を削除して最初からやり直しますか？')) {
    state = { goal: null, entries: {} };
    saveState();
    fillSettings();
    updatePreview();
    switchTab('today');
  }
});

/* ============================================================
 * 起動
 * ============================================================ */
switchTab(state.goal ? 'today' : 'settings');
