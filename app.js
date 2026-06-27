/* ============================================================
 * 逆算カレンダー app.js（目標管理ツール / ライトUI版）
 * - 3タブ構成: 今日 / 記録 / 目標設定
 * - 目標を1つ設定し、ゴール日までの残り日数を確認
 * - 「今日の一歩」は保存するたびに記録へ追加（積み重ね型ログ）
 * - 目標に If-Then ルール（もし〇〇したら、△△する）を1つ持てる
 * - データはすべて localStorage に保存
 * ============================================================ */

const STORAGE_KEY = 'gyakusan-calendar';

/* ---------- 状態 ---------- */
// state = {
//   goal: { name, startDate, goalDate, ifThen:{cond,action} } | null,
//   logs: [ { id, ts, text } ]   // ts: 保存時刻(epoch ms)。新しいものが上。
// }
let state = loadState();

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadState() {
  let data = { goal: null, logs: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) { /* 壊れていたら初期化 */ }

  // 旧形式（days:{tasks,memo}）→ entries へ
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

  // 旧形式（entries: 日付キー上書き型）→ logs（追記型）へ移行
  if (!Array.isArray(data.logs)) {
    data.logs = [];
    if (data.entries && typeof data.entries === 'object') {
      Object.entries(data.entries)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([date, v]) => {
          const text = typeof v === 'string' ? v : (v && v.text) || '';
          if (text && text.trim()) {
            const [y, m, d] = date.split('-').map(Number);
            const ts = new Date(y, m - 1, d, 12, 0, 0).getTime();
            data.logs.push({ id: genId(), ts, text: text.trim() });
          }
        });
    }
  }
  delete data.entries;
  return data;
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

/* ---------- 日付ユーティリティ ---------- */
const pad = (n) => String(n).padStart(2, '0');
function todayStr() { return toDateStr(new Date()); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
function diffDays(aStr, bStr) { return Math.round((parseDate(bStr) - parseDate(aStr)) / 86400000); }
const WD = ['日','月','火','水','木','金','土'];
function formatLong(str) { const d = parseDate(str); return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${WD[d.getDay()]}）`; }
function formatHeader(str) { const d = parseDate(str); return `${d.getMonth()+1}月${d.getDate()}日（${WD[d.getDay()]}）`; }
// ログ用：タイムスタンプ → 「2026/06/27（土） 14:30」
function formatStamp(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}（${WD[d.getDay()]}） ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  if (name === 'records') { recordsShown = PAGE_SIZE; renderRecords(); }
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

  // 入力欄は常に新規記録用（保存のたびに積み重なる）
  $('step-input').value = '';
  $('save-status').textContent = '';
}

// 記録のある日数（達成サマリー用）
function recordedDays() {
  return new Set(state.logs.map(l => toDateStr(new Date(l.ts)))).size;
}

// 達成画面の内容を埋める
function renderCelebrate(remain) {
  $('celebrate-goal').textContent = state.goal.name;
  $('celebrate-title').textContent = remain === 0 ? '🎉 目標日です！' : '🎉 達成おめでとう！';

  const total = Math.max(diffDays(state.goal.startDate, state.goal.goalDate), 1);
  const days = recordedDays();
  let summary = days > 0
    ? `${total}日間で ${days}日ぶんの一歩を記録しました。`
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
  const text = $('step-input').value.trim();
  if (!text) { $('save-status').textContent = '内容を入力してください。'; return; }
  state.logs.push({ id: genId(), ts: Date.now(), text });
  saveState();
  $('step-input').value = '';          // 次の記録のためにクリア
  $('save-status').textContent = '記録に追加しました ✓';
});

$('go-setup').addEventListener('click', () => switchTab('settings'));
$('to-records').addEventListener('click', () => switchTab('records'));
$('to-newgoal').addEventListener('click', () => switchTab('settings'));

/* ============================================================
 * 記録タブ
 * ============================================================ */
const PAGE_SIZE = 20;      // 最初に表示する件数 / 「さらに読み込む」で増える単位
let recordsShown = PAGE_SIZE;

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

  const logs = state.logs
    .filter(l => l.text && l.text.trim())
    .filter(l => !q || l.text.toLowerCase().includes(q))
    .sort((a, b) => b.ts - a.ts); // 新しい順

  const list = $('record-list');
  list.innerHTML = '';
  $('record-empty').classList.toggle('hidden', logs.length !== 0);

  const shown = logs.slice(0, recordsShown);
  shown.forEach(log => {
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
    dEl.textContent = formatStamp(log.ts);
    const menu = document.createElement('button');
    menu.className = 'rec-menu';
    menu.type = 'button';
    menu.textContent = '⋯';
    menu.setAttribute('aria-label', 'この記録を削除');
    menu.addEventListener('click', () => {
      if (confirm('この記録を削除しますか？')) {
        state.logs = state.logs.filter(l => l.id !== log.id);
        saveState();
        renderRecords();
      }
    });
    top.append(dEl, menu);

    const txt = document.createElement('p');
    txt.className = 'rec-text';
    txt.textContent = log.text;

    card.append(top, txt);
    item.append(dot, card);
    list.appendChild(item);
  });

  // 「さらに読み込む」ボタン
  const wrap = $('load-more-wrap');
  wrap.innerHTML = '';
  if (logs.length > recordsShown) {
    const remaining = logs.length - recordsShown;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline load-more';
    btn.textContent = `さらに読み込む（残り${remaining}件）`;
    btn.addEventListener('click', () => {
      recordsShown += PAGE_SIZE;
      renderRecords();
    });
    wrap.appendChild(btn);
  }
}
// 検索が変わったら先頭から表示し直す
$('record-search').addEventListener('input', () => { recordsShown = PAGE_SIZE; renderRecords(); });

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
    state = { goal: null, logs: [] };
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
