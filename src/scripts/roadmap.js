import { STAGES, EDITABLE_STAGES, validateFeed, feedAge, displayTitle, selectItems } from '../../shared/roadmap.mjs';

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
let editor;
let saving = false;
let draggedNumber;
const savedMoves = new Map();
const editorStatus = root.querySelector('[data-editor-status]');
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
  li.dataset.issue = String(item.number);
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
  if (editor && EDITABLE_STAGES.includes(item.stage)) {
    li.draggable = !saving;
    li.addEventListener('dragstart', event => {
      if (saving || event.target.closest('a, button, select')) {
        event.preventDefault();
        return;
      }
      draggedNumber = item.number;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(item.number));
    });
    li.addEventListener('dragend', clearDrag);
    const label = node('label', 'roadmap-move', 'Move to');
    const select = node('select', '');
    select.setAttribute('aria-label', `Stage for issue ${item.number}`);
    select.disabled = saving;
    for (const stage of STAGES.filter(stage => EDITABLE_STAGES.includes(stage.id))) {
      const option = node('option', '', stage.label);
      option.value = stage.id;
      option.selected = stage.id === item.stage;
      select.append(option);
    }
    select.addEventListener('change', () => moveItem(item, select.value));
    label.append(select);
    li.append(label);
  }
  return li;
}

function currentItems() {
  return feed.items.map(item => {
    const saved = savedMoves.get(item.number);
    return saved && EDITABLE_STAGES.includes(item.stage) ? { ...item, stage: saved.stage } : item;
  });
}

function syncURL() {
  const url = new URL(location.href);
  for (const [key, value] of [['q', search.value.trim()], ['kind', kind === 'all' ? '' : kind], ['stage', activeStage === 'backlog' ? '' : activeStage]]) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  for (const stage of STAGES) url.searchParams.delete(`page-${stage.id}`);
  url.searchParams.delete('editor');
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
  const matches = selectItems(currentItems(), search.value, kind).length;
  const when = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(feed.generated_at));
  const late = delayed || age.stale;
  status.textContent = `${matches} ${matches === 1 ? 'item' : 'items'} · ${late ? 'Updates delayed. Last verified' : 'Verified'} ${when}`;
  status.parentElement.toggleAttribute('data-delayed', late);
  refresh.hidden = !late;
  refresh.textContent = 'Refresh';
}

function render(resetScroll = false) {
  const focusedCard = document.activeElement?.closest('.roadmap-card');
  const focusedSelectIssue = document.activeElement instanceof HTMLSelectElement ? focusedCard?.dataset.issue : null;
  const focusedLink = focusedCard && document.activeElement instanceof HTMLAnchorElement
    ? document.activeElement.href : null;
  const focusedStage = focusedCard?.closest('[data-stage]')?.dataset.stage;
  const matches = selectItems(currentItems(), search.value, kind);
  for (const stage of STAGES) {
    const column = root.querySelector(`[data-stage="${stage.id}"]`);
    const items = matches.filter(item => item.stage === stage.id);
    const scroller = column.querySelector('[data-scroll]');
    const scrollTop = resetScroll ? 0 : scroller.scrollTop;
    const count = column.querySelector('[data-count]');
    count.textContent = String(items.length);
    count.setAttribute('aria-label', `${items.length} items`);
    root.querySelector(`[data-mobile-count="${stage.id}"]`).textContent = String(items.length);
    column.querySelector('[data-cards]').replaceChildren(...items.map(card));
    scroller.scrollTop = scrollTop;
    const empty = column.querySelector('[data-empty]');
    empty.hidden = items.length > 0;
    empty.querySelector('p').textContent = search.value.trim() || kind !== 'all'
      ? 'No matching items in this stage.' : stage.empty;
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
  if (focusedSelectIssue) {
    root.querySelector(`[data-issue="${focusedSelectIssue}"] select`)?.focus({ preventScroll: true });
  }
}

function unavailable() {
  clearDrag();
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
    let changed = !feed || JSON.stringify(feed.items) !== JSON.stringify(next.items);
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
    for (const [number, saved] of savedMoves) {
      const item = feed.items.find(item => item.number === number);
      if (!item || item.stage === saved.stage || Date.parse(feed.generated_at) > Date.parse(saved.saved_at)) {
        savedMoves.delete(number);
        changed = true;
      }
    }
    if (changed && !saving) render();
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
  syncURL();
  if (feed) render(true);
});
root.querySelectorAll('[data-stage-select]').forEach(button => button.addEventListener('click', () => {
  activeStage = button.dataset.stageSelect;
  chooseStage();
  syncURL();
}));
function editingMessage(text, error = false) {
  editorStatus.hidden = false;
  editorStatus.textContent = text;
  editorStatus.toggleAttribute('data-error', error);
}

async function loadEditor() {
  try {
    const result = await fetch('/api/roadmap/editor/session', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!result.ok) throw new Error('Editing is unavailable. Try signing in again.');
    const session = await result.json();
    if (!session.configured) {
      root.querySelector('[data-roadmap-login]').addEventListener('click', event => {
        event.preventDefault();
        editingMessage('Editing needs GitHub setup. You can still browse the board.', true);
      });
    }
    if (session.authenticated) {
      editor = session;
      root.querySelector('[data-roadmap-login]').hidden = true;
      root.querySelector('[data-roadmap-logout]').hidden = false;
      editingMessage('Drag cards or use Move to. Beta and release stages are automatic.');
      if (feed) render();
    } else if (params.has('editor')) {
      const messages = {
        'not-configured': 'Editing needs GitHub setup. You can still browse the board.',
        denied: 'Only the maintainer can edit this board. Sign in with the brandomoore GitHub account.',
        failed: 'Sign-in failed or expired. Try again.',
        ready: 'Your editing session expired. Sign in again.',
      };
      editingMessage(messages[params.get('editor')] || 'Sign in again to edit the board.', true);
    }
  } catch (error) {
    console.error('Roadmap editor could not be loaded.', error);
    editingMessage('Editing is unavailable. The public board is still available.', true);
  }
}

async function moveItem(item, stage) {
  if (!editor || saving || stage === item.stage) return;
  saving = true;
  clearDrag();
  render();
  editingMessage(`Saving issue #${item.number}…`);
  try {
    const result = await fetch(`/api/roadmap/editor/issues/${item.number}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Roadmap-CSRF': editor.csrf },
      body: JSON.stringify({ stage, expectedStage: item.stage }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await result.json();
    if (!result.ok) throw new Error(body.message || 'Could not save. Check the issue on GitHub before trying again.');
    if (body.number !== item.number || body.stage !== stage || !Number.isFinite(Date.parse(body.saved_at))) {
      throw new Error('The save response could not be verified. Check the issue on GitHub.');
    }
    savedMoves.set(item.number, body);
    activeStage = stage;
    editingMessage(`Saved #${item.number} to ${STAGES.find(s => s.id === stage).label}. The public board updates after the next sync.`);
  } catch (error) {
    console.error('Roadmap stage change failed.', error);
    editingMessage(error.name === 'TimeoutError' ? 'Saving timed out. Check the issue on GitHub before trying again.' : error.message, true);
  } finally {
    saving = false;
    if (feed) {
      render();
      root.querySelector(`[data-stage="${activeStage}"] [data-issue="${item.number}"] select`)?.focus();
    }
  }
}

function clearDrag() {
  draggedNumber = undefined;
  root.querySelectorAll('[data-drop-target]').forEach(column => column.removeAttribute('data-drop-target'));
}

root.querySelectorAll('[data-stage]').forEach(column => {
  column.addEventListener('dragover', event => {
    if (!editor || saving || !draggedNumber || !EDITABLE_STAGES.includes(column.dataset.stage)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    column.setAttribute('data-drop-target', '');
  });
  column.addEventListener('dragleave', event => {
    if (!column.contains(event.relatedTarget)) column.removeAttribute('data-drop-target');
  });
  column.addEventListener('drop', event => {
    if (!editor || !feed || !draggedNumber || !EDITABLE_STAGES.includes(column.dataset.stage)) return;
    event.preventDefault();
    const item = currentItems().find(item => item.number === draggedNumber);
    clearDrag();
    if (item) moveItem(item, column.dataset.stage);
  });
});
root.querySelector('[data-roadmap-logout]').addEventListener('click', async () => {
  if (!editor || saving) return;
  try {
    const result = await fetch('/api/roadmap/editor/logout', {
      method: 'POST', headers: { 'X-Roadmap-CSRF': editor.csrf }, signal: AbortSignal.timeout(15_000),
    });
    if (!result.ok) throw new Error('Sign-out could not be completed. Try again.');
    editor = undefined;
    savedMoves.clear();
    root.querySelector('[data-roadmap-login]').hidden = false;
    root.querySelector('[data-roadmap-logout]').hidden = true;
    editingMessage('Signed out.');
    if (feed) render();
  } catch (error) {
    console.error('Roadmap sign-out failed.', error);
    editingMessage(error.message, true);
  }
});
refresh.addEventListener('click', load);
chooseStage();
load();
loadEditor();
setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
setInterval(() => { if (feed) renderStatus(); }, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
