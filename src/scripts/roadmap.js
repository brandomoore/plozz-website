import { STAGES, PAGE_SIZE, validateFeed, feedAge, displayTitle, selectItems, pageItems } from '../../shared/roadmap.mjs';

const root = document.querySelector('.roadmap-shell');
const form = root.querySelector('[data-roadmap-filters]');
const search = form.querySelector('input[type="search"]');
const status = root.querySelector('[data-roadmap-status]');
const board = root.querySelector('[data-roadmap-board]');
const refresh = root.querySelector('[data-roadmap-refresh]');
const params = new URLSearchParams(location.search);
let kind = ['bug', 'feature'].includes(params.get('kind')) ? params.get('kind') : 'all';
let activeStage = STAGES.some(stage => stage.id === params.get('stage')) ? params.get('stage') : 'backlog';
let feed;
let loading = false;
let delayed = false;
let pages = Object.fromEntries(STAGES.map(stage => {
  const value = Number(params.get(`page-${stage.id}`));
  return [stage.id, Number.isSafeInteger(value) && value > 0 ? value - 1 : 0];
}));
let preview = false;
search.value = (params.get('q') || '').slice(0, 200);
form.querySelector(`input[value="${kind}"]`).checked = true;

function node(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function card(item) {
  const li = node('li', 'roadmap-card');
  li.dataset.kind = item.kind;
  const meta = node('div', 'roadmap-card-meta');
  const kindLabel = node('span', 'roadmap-card-kind', item.kind === 'bug' ? 'Bug' : 'Feature');
  kindLabel.prepend(form.querySelector(`[data-kind-icon="${item.kind}"]`).cloneNode(true));
  meta.append(kindLabel, node('span', 'roadmap-card-number', `#${item.number}`));
  const heading = node('h3', '');
  const link = node('a', 'roadmap-card-title');
  link.href = item.github_url;
  link.title = displayTitle(item.title);
  link.append(node('span', '', displayTitle(item.title)));
  heading.append(link);
  li.append(meta, heading);
  if (item.discord_urls.length) {
    const discussions = node('div', 'roadmap-card-discussions');
    item.discord_urls.forEach((url, index) => {
      const link = node('a', '', item.discord_urls.length === 1 ? 'Discord discussion ↗' : `Discussion ${index + 1} ↗`);
      link.href = url;
      link.setAttribute('aria-label', `Discord discussion ${index + 1} for issue ${item.number}`);
      discussions.append(link);
    });
    li.append(discussions);
  }
  return li;
}

function syncURL() {
  const url = new URL(location.href);
  for (const [key, value] of [['q', search.value.trim()], ['kind', kind === 'all' ? '' : kind], ['stage', activeStage === 'backlog' ? '' : activeStage]]) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  for (const stage of STAGES) {
    const key = `page-${stage.id}`;
    if (pages[stage.id] > 0) url.searchParams.set(key, String(pages[stage.id] + 1));
    else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
}

function chooseStage() {
  root.querySelectorAll('[data-stage-select]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.stageSelect === activeStage));
  });
  root.querySelectorAll('[data-stage]').forEach(column => {
    column.toggleAttribute('data-mobile-active', column.dataset.stage === activeStage);
  });
}

function renderStatus() {
  if (!feed) return;
  const age = feedAge(feed);
  if (age.expired) {
    unavailable();
    return;
  }
  const matches = selectItems(feed.items, search.value, kind).length;
  const when = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(feed.generated_at));
  const late = delayed || age.stale;
  status.textContent = `${matches} ${matches === 1 ? 'item' : 'items'} · ${late ? 'Updates delayed. Last verified' : 'Verified'} ${when}`;
  status.parentElement.toggleAttribute('data-delayed', late);
  refresh.hidden = !late;
  refresh.textContent = 'Refresh';
}

function render() {
  const focusedCard = document.activeElement?.closest('.roadmap-card');
  const focusedLink = focusedCard && document.activeElement instanceof HTMLAnchorElement
    ? document.activeElement.href : null;
  const focusedStage = focusedCard?.closest('[data-stage]')?.dataset.stage;
  const matches = selectItems(feed.items, search.value, kind);
  for (const stage of STAGES) {
    const column = root.querySelector(`[data-stage="${stage.id}"]`);
    const items = matches.filter(item => item.stage === stage.id);
    const page = pageItems(items, pages[stage.id]);
    pages[stage.id] = page.page;
    const count = column.querySelector('[data-count]');
    count.textContent = String(items.length);
    count.setAttribute('aria-label', `${items.length} items`);
    root.querySelector(`[data-mobile-count="${stage.id}"]`).textContent = String(items.length);
    column.querySelector('[data-cards]').replaceChildren(...page.items.map(card));
    const empty = column.querySelector('[data-empty]');
    empty.hidden = items.length > 0;
    empty.querySelector('p').textContent = search.value.trim() || kind !== 'all'
      ? 'No matching items in this stage.' : stage.empty;
    column.querySelector('.roadmap-pagination').hidden = items.length === 0;
    column.querySelector('[data-range]').textContent = `${page.page * PAGE_SIZE + 1}–${Math.min((page.page + 1) * PAGE_SIZE, items.length)} of ${items.length}`;
    column.querySelector('[data-previous]').disabled = page.page === 0;
    column.querySelector('[data-next]').disabled = page.page === page.pages - 1;
  }
  chooseStage();
  syncURL();
  renderStatus();
  if (focusedLink) {
    const replacement = [...root.querySelectorAll('.roadmap-card a')]
      .find(link => link.href === focusedLink && link.closest('[data-stage]').dataset.stage === focusedStage);
    if (replacement) replacement.focus({ preventScroll: true });
    else {
      const heading = root.querySelector(`#heading-${focusedStage}`);
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }
}

function unavailable() {
  feed = undefined;
  status.textContent = 'The roadmap is unavailable. Try again, or browse the issues on GitHub below.';
  status.parentElement.setAttribute('data-delayed', '');
  refresh.hidden = false;
  refresh.textContent = 'Retry';
  form.querySelector('fieldset').disabled = true;
  root.querySelector('[data-roadmap-evidence]').hidden = true;
  for (const column of root.querySelectorAll('[data-stage]')) {
    column.querySelector('[data-cards]').replaceChildren();
    column.querySelector('[data-count]').textContent = '—';
    column.querySelector('[data-count]').setAttribute('aria-label', 'Count unavailable');
    column.querySelector('.roadmap-pagination').hidden = true;
    column.querySelector('[data-empty]').hidden = false;
    column.querySelector('[data-empty] p').textContent = 'Couldn’t load this stage.';
  }
  root.querySelectorAll('[data-mobile-count]').forEach(count => { count.textContent = '—'; });
}

async function load() {
  if (loading) return;
  loading = true;
  refresh.disabled = true;
  try {
    const result = await fetch('/api/roadmap', { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    if (!result.ok) throw new Error('Roadmap endpoint unavailable.');
    const payload = await result.json();
    const next = validateFeed(payload.feed);
    if (feedAge(next).expired || !['current', 'delayed'].includes(payload.status)) {
      throw new Error('Roadmap snapshot unavailable.');
    }
    if (feed && Date.parse(next.generated_at) < Date.parse(feed.generated_at)) {
      throw new Error('Roadmap snapshot moved backwards.');
    }
    const changed = !feed || JSON.stringify(feed.items) !== JSON.stringify(next.items);
    feed = next;
    delayed = payload.status === 'delayed';
    // The local preview server alone adds this flag; production never supplies it.
    preview = payload.preview === true;
    root.querySelector('[data-roadmap-preview]').hidden = !preview;
    const evidence = root.querySelector('[data-roadmap-evidence]');
    const source = node('a', '', `Source ${feed.source.revision.slice(0, 7)}`);
    source.href = `https://github.com/brandomoore/Plozz/commit/${feed.source.revision}`;
    const run = node('a', '', 'Verification run');
    run.href = feed.source.run_url;
    evidence.replaceChildren(source, document.createTextNode(' · '), run);
    evidence.hidden = false;
    form.querySelector('fieldset').disabled = false;
    root.querySelectorAll('[data-stage-select]').forEach(button => { button.disabled = false; });
    if (changed) render();
    else renderStatus();
  } catch (error) {
    console.error('Roadmap refresh failed.', error);
    if (feed && !feedAge(feed).expired) {
      delayed = true;
      renderStatus();
    } else {
      unavailable();
    }
  } finally {
    loading = false;
    refresh.disabled = false;
    board.setAttribute('aria-busy', 'false');
  }
}

form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', () => {
  kind = form.querySelector('input[name="kind"]:checked').value;
  pages = {};
  syncURL();
  if (feed) render();
});
root.querySelectorAll('[data-stage-select]').forEach(button => button.addEventListener('click', () => {
  activeStage = button.dataset.stageSelect;
  chooseStage();
  syncURL();
}));
root.querySelectorAll('[data-stage]').forEach(column => {
  for (const [selector, delta] of [['[data-previous]', -1], ['[data-next]', 1]]) {
    column.querySelector(selector).addEventListener('click', () => {
      pages[column.dataset.stage] = (pages[column.dataset.stage] || 0) + delta;
      render();
      const firstLink = column.querySelector('.roadmap-card-title');
      firstLink?.focus();
    });
  }
});
refresh.addEventListener('click', load);
chooseStage();
load();
setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
setInterval(() => { if (feed) renderStatus(); }, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
