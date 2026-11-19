// Leonida Ledger — GTA 6 trophy tracker.
// Loads the trophy list and roadmap from data/, keeps progress in localStorage,
// and renders the checklist, the roadmap, the missable view and the spoiler mask.
// Everything runs offline: the only fetches are the two JSON files under app/.

const EARNED_KEY = 'leonida-ledger-earned-v1';
const SPOILER_KEY = 'leonida-ledger-spoiler-v1';
const DEMO_EARNED_IDS = [2, 3, 4, 8, 15, 17, 28, 35, 42, 52];
const DEMO2_EARNED_IDS = [15, 17, 28, 35, 42, 52];

const params = new URLSearchParams(location.search);
const listEl = document.getElementById('trophyList');
const missableListEl = document.getElementById('missableList');
const phaseListEl = document.getElementById('phaseList');

const state = {
  trophies: [],
  roadmap: null,
  earned: new Set(),
  spoiler: false,
  kind: 'all',
  grade: 'all',
  status: 'all',
  query: '',
  openId: null,
  view: 'tracker',
};

function loadEarned() {
  try {
    const raw = JSON.parse(localStorage.getItem(EARNED_KEY) ?? '[]');
    if (Array.isArray(raw)) return new Set(raw.filter((n) => typeof n === 'string'));
  } catch (_) { /* corrupted save: start fresh */ }
  return new Set();
}

function saveEarned() {
  localStorage.setItem(EARNED_KEY, JSON.stringify([...state.earned]));
  document.getElementById('savedNote').textContent =
    'Saved just now in this browser (localStorage) — no account, no network.';
}

function trophyById(id) {
  return state.trophies.find((t) => t.id === id);
}

function isMasked(t) {
  return state.spoiler && t.kind === 'story' && t.hidden && !state.earned.has(t.name);
}

function gradeLabel(grade) {
  return grade.charAt(0).toUpperCase() + grade.slice(1);
}

function countLine(t) {
  if (t.count == null) return '';
  if (t.id === 52 || t.id === 53) return `Tracked target: $${t.count.toLocaleString('en-US')}.`;
  if (t.id === 48) return 'Reported tracked count: 500 actions (GTABase, single source, unconfirmed).';
  const unit = { 15: 'stunts', 17: 'Shooting Range challenges', 18: 'drone race locations', 19: 'different races', 25: 'stranger strands', 28: 'meditation spots', 30: 'card sets', 31: 'WAiNK It locations', 32: 'challenges', 35: 'vehicles', 40: 'bank vaults', 42: 'areas of Leonida', 43: 'gangs', 54: 'garage properties', 55: 'vehicles' }[t.id];
  return `Tracked count: ${t.count} ${unit ?? ''}.`.trim();
}

function badgeRow(t) {
  const badges = [`<span class="badge ${t.grade}">${gradeLabel(t.grade)}</span>`];
  if (t.hidden) badges.push('<span class="badge hidden-badge">Hidden</span>');
  if (t.missable) badges.push('<span class="badge missable-badge">Potentially missable</span>');
  badges.push(`<span class="badge kind-badge">${t.kind}</span>`);
  return badges.join('');
}

function guideBody(t) {
  const count = countLine(t);
  const sources = t.sources.map((s) => escapeHtml(s)).join(' · ');
  return `<div class="guide-body">
    ${count ? `<p class="count-line">${escapeHtml(count)}</p>` : ''}
    <p>${escapeHtml(t.guide)}</p>
    <p class="guide-sources"><strong>Sources:</strong> ${sources}</p>
  </div>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function trophyCard(t) {
  const li = document.createElement('li');
  li.className = 'trophy-card' + (state.earned.has(t.name) ? ' earned' : '') + (t.missable ? ' missable-flag' : '');
  const masked = isMasked(t);
  const head = document.createElement('div');
  head.className = 'trophy-head';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = state.earned.has(t.name);
  box.setAttribute('aria-label', `Mark ${masked ? 'hidden story trophy' : t.name} as earned`);
  box.addEventListener('change', () => {
    if (box.checked) state.earned.add(t.name);
    else state.earned.delete(t.name);
    saveEarned();
    renderAll();
  });
  const title = document.createElement('div');
  title.className = 'trophy-title';
  const name = document.createElement('p');
  name.className = 'trophy-name';
  name.innerHTML = masked
    ? '<span class="spoiler-mask">Hidden story trophy — earn it to reveal its name</span>'
    : escapeHtml(t.name);
  const desc = document.createElement('p');
  desc.className = 'trophy-desc';
  desc.textContent = masked
    ? 'Hidden on PlayStation until earned. Turn off Hide spoilers to see it, or earn it in-game.'
    : t.description;
  const badges = document.createElement('div');
  badges.className = 'badges';
  badges.innerHTML = masked ? badgeRow({ ...t, missable: false }) : badgeRow(t);
  title.append(name, desc, badges);
  head.append(box, title);
  li.append(head);
  if (masked) {
    const note = document.createElement('p');
    note.className = 'guide-sources';
    note.textContent = 'Guide hidden with spoilers on. Sources: official description (Exophase / PSNProfiles).';
    li.append(note);
    return li;
  }
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'guide-toggle';
  const open = state.openId === t.id;
  toggle.textContent = open ? 'Hide guide ▲' : 'Read the guide ▼';
  toggle.addEventListener('click', () => {
    state.openId = open ? null : t.id;
    renderAll();
  });
  li.append(toggle);
  if (open) {
    const body = document.createElement('div');
    body.innerHTML = guideBody(t);
    li.append(body);
  }
  return li;
}

function filteredTrophies() {
  const q = state.query.trim().toLowerCase();
  return state.trophies.filter((t) => {
    if (state.kind === 'missable' && !t.missable) return false;
    if (state.kind !== 'all' && state.kind !== 'missable' && t.kind !== state.kind) return false;
    if (state.grade !== 'all' && t.grade !== state.grade) return false;
    if (state.status === 'earned' && !state.earned.has(t.name)) return false;
    if (state.status === 'remaining' && state.earned.has(t.name)) return false;
    if (q && !(`${t.name} ${t.description} ${t.guide}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

function renderStats() {
  const total = state.trophies.length;
  const earned = state.earned.size;
  const pct = total ? Math.round((earned / total) * 100) : 0;
  document.getElementById('earnedCount').textContent = String(earned);
  document.getElementById('progressFill').style.width = `${pct}%`;
  const byGrade = {};
  for (const t of state.trophies) {
    if (state.earned.has(t.name)) byGrade[t.grade] = (byGrade[t.grade] ?? 0) + 1;
  }
  document.getElementById('statLine').textContent =
    `${pct}% complete · ${byGrade.platinum ?? 0} platinum · ${byGrade.gold ?? 0} gold · ` +
    `${byGrade.silver ?? 0} silver · ${byGrade.bronze ?? 0} bronze · ` +
    `${state.trophies.filter((t) => t.missable).length} potentially missable`;
}

function renderList() {
  const items = filteredTrophies();
  listEl.replaceChildren();
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty-note';
    li.textContent = 'No trophies match these filters. Try clearing the search or choosing All kinds.';
    listEl.append(li);
  } else {
    for (const t of items) listEl.append(trophyCard(t));
  }
  document.getElementById('resultCount').textContent =
    `Showing ${items.length} of ${state.trophies.length} trophies · ${state.earned.size} earned`;
}

function renderMissable() {
  missableListEl.replaceChildren();
  for (const t of state.trophies.filter((x) => x.missable)) {
    missableListEl.append(trophyCard(t));
  }
}

function renderRoadmap() {
  if (!state.roadmap) return;
  document.getElementById('roadmapTitle').textContent = state.roadmap.title;
  document.getElementById('roadmapSummary').textContent = state.roadmap.summary;
  phaseListEl.replaceChildren();
  for (const phase of state.roadmap.phases) {
    const li = document.createElement('li');
    li.className = 'phase';
    const head = document.createElement('div');
    head.className = 'phase-head';
    const num = document.createElement('span');
    num.className = 'phase-num';
    num.textContent = String(phase.n);
    const title = document.createElement('h3');
    title.textContent = phase.title;
    const hours = document.createElement('span');
    hours.className = 'phase-hours';
    hours.textContent = phase.hours;
    head.append(num, title, hours);
    const goal = document.createElement('p');
    goal.textContent = phase.goal;
    const tips = document.createElement('p');
    tips.textContent = phase.tips;
    const chips = document.createElement('div');
    chips.className = 'phase-trophies';
    for (const id of phase.trophyIds) {
      const t = trophyById(id);
      if (!t) continue;
      const chip = document.createElement('span');
      chip.className = 'chip' + (state.earned.has(t.name) ? ' done' : '');
      chip.textContent = (state.earned.has(t.name) ? '✓ ' : '') + t.name + ` (${gradeLabel(t.grade)})`;
      chips.append(chip);
    }
    li.append(head, goal, tips, chips);
    phaseListEl.append(li);
  }
}

function renderAll() {
  renderStats();
  renderList();
  renderMissable();
  renderRoadmap();
}

function setView(view) {
  state.view = view;
  for (const v of ['tracker', 'roadmap', 'missable', 'sources']) {
    document.getElementById(`view-${v}`).hidden = v !== view;
    document.getElementById(`tab${v.charAt(0).toUpperCase()}${v.slice(1)}`).classList.toggle('active', v === view);
  }
  window.scrollTo({ top: 0 });
}

function exportProgress() {
  const payload = {
    app: 'leonida-ledger',
    version: 1,
    game: 'Grand Theft Auto VI',
    exportedAt: new Date().toISOString(),
    earned: [...state.earned].sort(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'leonida-ledger-progress.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importProgress(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const names = Array.isArray(data) ? data : data.earned;
    if (!Array.isArray(names)) throw new Error('bad file');
    const known = new Set(state.trophies.map((t) => t.name));
    const good = names.filter((n) => typeof n === 'string' && known.has(n));
    state.earned = new Set(good);
    saveEarned();
    renderAll();
    document.getElementById('savedNote').textContent =
      `Imported ${good.length} earned trophies${names.length - good.length ? ` (${names.length - good.length} unknown names ignored)` : ''}.`;
  } catch (_) {
    document.getElementById('savedNote').textContent =
      'That file could not be imported. It must be a Leonida Ledger export or a JSON list of trophy names.';
  }
}

async function boot() {
  const [trophyDoc, roadmapDoc] = await Promise.all([
    (await fetch('data/trophies.json')).json(),
    (await fetch('data/roadmap.json')).json(),
  ]);
  state.trophies = trophyDoc.trophies;
  state.roadmap = roadmapDoc;

  state.earned = loadEarned();
  try {
    state.spoiler = localStorage.getItem(SPOILER_KEY) === '1';
  } catch (_) { state.spoiler = false; }

  // Screenshot / deep-link parameters the app honours: ?seed=demo checks a sample
  // set of trophies (demo2 checks a set with no story trophies, so the spoiler
  // mask shows on the first rows), ?view=roadmap|missable|sources picks a tab, ?filter=missable
  // (or story/collectibles/activities) pre-filters, ?spoiler=on masks story
  // trophies, and ?open=<id> opens one trophy's guide.
  if (params.get('seed') === 'demo2') {
    state.earned = new Set(DEMO2_EARNED_IDS.map((id) => trophyById(id)?.name).filter(Boolean));
    saveEarned();
  }
  if (params.get('seed') === 'demo') {
    state.earned = new Set(DEMO_EARNED_IDS.map((id) => trophyById(id)?.name).filter(Boolean));
    saveEarned();
  }
  if (params.get('spoiler') === 'on') state.spoiler = true;
  if (params.get('spoiler') === 'off') state.spoiler = false;
  const filter = params.get('filter');
  if (filter && ['story', 'missable', 'collectibles', 'activities', 'other'].includes(filter)) {
    state.kind = filter;
    document.getElementById('kindFilter').value = filter;
  }
  const open = Number.parseInt(params.get('open') ?? '', 10);
  if (Number.isInteger(open) && trophyById(open)) state.openId = open;

  document.getElementById('spoilerToggle').checked = state.spoiler;
  document.getElementById('spoilerToggle').addEventListener('change', (e) => {
    state.spoiler = e.target.checked;
    try { localStorage.setItem(SPOILER_KEY, state.spoiler ? '1' : '0'); } catch (_) { /* private mode */ }
    renderAll();
  });
  document.getElementById('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderList();
  });
  document.getElementById('kindFilter').addEventListener('change', (e) => {
    state.kind = e.target.value;
    renderList();
  });
  document.getElementById('gradeFilter').addEventListener('change', (e) => {
    state.grade = e.target.value;
    renderList();
  });
  document.getElementById('statusFilter').addEventListener('change', (e) => {
    state.status = e.target.value;
    renderList();
  });
  document.getElementById('exportBtn').addEventListener('click', exportProgress);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', (e) => {
    importProgress(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (window.confirm('Clear all earned trophies in this browser?')) {
      state.earned = new Set();
      saveEarned();
      renderAll();
    }
  });
  for (const v of ['tracker', 'roadmap', 'missable', 'sources']) {
    document.getElementById(`tab${v.charAt(0).toUpperCase()}${v.slice(1)}`).addEventListener('click', () => setView(v));
  }

  const view = params.get('view');
  if (view === 'roadmap' || view === 'missable' || view === 'sources') setView(view);
  else if (filter === 'missable') setView('tracker');
  renderAll();
}

boot();
