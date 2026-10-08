// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const KEYWORDS_PATH = '/keywords.json';
// DA_SDK only resolves when the page is embedded by Experience Workspace.
// Opened in a plain browser tab it never resolves, so we race it against a timeout.
const SDK_TIMEOUT_MS = 3000;

const state = {
  org: null,
  site: null,
  actions: null,
  embedded: false,
  groups: [],
  selected: new Set(),
  brief: '',
};

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  });
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
};

async function initSdk() {
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(null), SDK_TIMEOUT_MS);
  });
  return Promise.race([DA_SDK, timeout]);
}

/**
 * Loads the keywords sheet and turns it into [{ category, topics: [] }].
 * Sheet columns: Category | Keywords (comma-separated).
 */
async function loadTopicGroups() {
  const url = new URL(KEYWORDS_PATH, window.location.origin).href;
  const fetchFn = state.actions?.daFetch || fetch;
  const resp = await fetchFn(url);
  if (!resp.ok) throw new Error(`Could not load ${KEYWORDS_PATH} (${resp.status})`);
  const json = await resp.json();
  const rows = Array.isArray(json) ? json : json.data || [];
  return rows
    .map((row) => ({
      category: (row.Category || '').trim(),
      topics: (row.Keywords || '').split(',').map((t) => t.trim()).filter(Boolean),
    }))
    .filter((group) => group.topics.length);
}

function formatList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function assemblePrompt(topics, brief) {
  const briefText = brief.trim().replace(/([^.!?])$/, '$1.');
  const briefSentence = briefText
    ? `The author's brief sets the angle and tone: ${briefText}`
    : 'No brief was given, so pick an angle that suits the Frescopa voice: warm, knowledgeable and inviting.';

  return [
    `Write a short blog post draft for the Frescopa coffee blog that covers ${formatList(topics)}.`,
    briefSentence,
    'Aim for roughly 400 words: a clear headline, a short intro, two or three sections with subheadings, and a friendly closing line. Weave the topics in naturally rather than listing them.',
    'Save it as a new page under /drafts/coffee/ using a short, lowercase, hyphenated slug based on the headline (for example /drafts/coffee/cold-brew-at-home).',
    'Do not preview or publish the page; leave it as a draft only.',
  ].join(' ');
}

function setStatus(message, type = 'info') {
  const status = document.querySelector('.cb-status');
  status.textContent = message;
  status.className = `cb-status ${type}`;
  status.hidden = !message;
}

// first match wins, so list the more specific patterns first
const CATEGORY_ICONS = [
  [/voice|experience/i, '💬'],
  [/production|sourc/i, '🌱'],
  [/brand|product/i, '🏷️'],
  [/type|drink/i, '☕'],
  [/flavou?r|taste/i, '😋'],
  [/brew|prep/i, '🫖'],
  [/caffeine|wellbeing/i, '⚡'],
  [/sustain/i, '♻️'],
  [/gap|opportunit/i, '💡'],
];
const iconFor = (category) => CATEGORY_ICONS.find(([re]) => re.test(category))?.[1] || '☕';

const SWEET_SPOT = 4;
const SURPRISE_COUNT = 3;

// topic -> pill element, so the tray and the accordion stay in sync
const pillsByTopic = new Map();

function renderMix() {
  const count = state.selected.size;
  const chips = document.querySelector('.cb-mix-chips');

  // Diff instead of re-rendering, so only newly added chips animate in.
  const existing = new Map([...chips.children].map((chip) => [chip.dataset.topic, chip]));
  existing.forEach((chip, topic) => { if (!state.selected.has(topic)) chip.remove(); });
  state.selected.forEach((topic) => {
    if (existing.has(topic)) return;
    const chip = el(
      'button',
      {
        type: 'button', class: 'cb-chip', 'data-topic': topic, 'aria-label': `Remove ${topic}`,
      },
      topic,
      el('span', { class: 'cb-chip-x', 'aria-hidden': 'true' }, '×'),
    );
    chip.addEventListener('click', () => setSelected(topic, false));
    chips.append(chip);
  });

  document.querySelector('.cb-mix-empty').hidden = count > 0;
  document.querySelector('.cb-clear').hidden = count === 0;
  document.querySelector('.cb-counter').textContent = `${count} selected`;
  document.querySelector('.cb-hint').hidden = count <= SWEET_SPOT;
  document.querySelector('.cb-generate').disabled = count === 0;

  document.querySelectorAll('.cb-cat').forEach((cat) => {
    const picked = [...cat.querySelectorAll('.cb-pill[aria-pressed="true"]')].length;
    const badge = cat.querySelector('.cb-badge');
    badge.textContent = picked;
    badge.hidden = picked === 0;
  });
}

function setSelected(topic, on) {
  if (on) state.selected.add(topic);
  else state.selected.delete(topic);
  pillsByTopic.get(topic)?.setAttribute('aria-pressed', on);
  renderMix();
  setStatus('');
}

function clearSelection() {
  [...state.selected].forEach((topic) => setSelected(topic, false));
}

const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

/** Replace the current mix with one random topic from each of N random categories. */
function surpriseMe() {
  clearSelection();
  const groups = [...state.groups];
  for (let i = 0; i < SURPRISE_COUNT && groups.length; i += 1) {
    const [group] = groups.splice(Math.floor(Math.random() * groups.length), 1);
    setSelected(pickRandom(group.topics), true);
  }
}

async function handleGenerate() {
  const prompt = assemblePrompt([...state.selected], state.brief);
  console.info('[coffee-brief] assembled prompt:\n', prompt);

  if (state.actions?.setPrompt) {
    state.actions.setPrompt(prompt, { autoSend: true });
    setStatus('Sent to chat — check the Assistant panel', 'success');
    return;
  }

  // Fallback: no Experience Workspace session (or an older one without setPrompt).
  try {
    await navigator.clipboard.writeText(prompt);
    setStatus('Chat handoff unavailable. Prompt copied to clipboard — paste it into the Assistant chat.', 'warning');
  } catch {
    setStatus('Chat handoff unavailable and clipboard blocked. Copy the prompt below into the Assistant chat.', 'warning');
    const fallback = document.querySelector('.cb-fallback');
    fallback.value = prompt;
    fallback.hidden = false;
    fallback.select();
  }
}

function renderHeader(root) {
  const context = state.embedded
    ? el('p', { class: 'cb-context' }, `${state.org} / ${state.site}`)
    : el('p', { class: 'cb-notice' }, 'Standalone mode: not connected to Experience Workspace. Generate will copy the prompt to your clipboard.');
  root.append(el('header', { class: 'cb-header' }, el('h1', {}, 'Coffee Brief'), context));
}

function renderMixTray() {
  const surprise = el('button', { type: 'button', class: 'cb-surprise' }, '🎲 Surprise me');
  surprise.addEventListener('click', surpriseMe);
  const clear = el('button', { type: 'button', class: 'cb-clear', hidden: '' }, 'Clear');
  clear.addEventListener('click', clearSelection);

  return el(
    'section',
    { class: 'cb-mix', 'aria-label': 'Your mix' },
    el(
      'div',
      { class: 'cb-mix-head' },
      el('h2', {}, 'Your mix ', el('span', { class: 'cb-counter' }, '0 selected')),
      el('div', { class: 'cb-mix-tools' }, clear, surprise),
    ),
    el('p', { class: 'cb-mix-empty' }, 'Open a category below and pick a few topics, or roll the dice.'),
    el('div', { class: 'cb-mix-chips', 'aria-live': 'polite' }),
    el('p', { class: 'cb-hint', hidden: '' }, `Tip: ${SWEET_SPOT} or fewer topics make a more focused post.`),
  );
}

function renderCategories() {
  const list = el('div', { class: 'cb-cats' });
  state.groups.forEach(({ category, topics }, i) => {
    const pills = topics.map((topic) => {
      const pill = el('button', {
        type: 'button', class: 'cb-pill', 'aria-pressed': 'false',
      }, topic);
      pill.addEventListener('click', () => setSelected(topic, !state.selected.has(topic)));
      pillsByTopic.set(topic, pill);
      return pill;
    });

    // details[name] = exclusive accordion: opening one category closes the others
    const details = el(
      'details',
      { class: 'cb-cat', name: 'cb-categories' },
      el(
        'summary',
        {},
        el('span', { class: 'cb-cat-icon', 'aria-hidden': 'true' }, iconFor(category)),
        el('span', { class: 'cb-cat-name' }, category),
        el('span', { class: 'cb-badge', hidden: '' }, '0'),
        el('span', { class: 'cb-cat-total' }, `${topics.length}`),
      ),
      el('div', { class: 'cb-pills', role: 'group', 'aria-label': category }, ...pills),
    );
    if (i === 0) details.open = true;
    list.append(details);
  });
  return list;
}

function renderForm(root) {
  const topicsSection = el(
    'div',
    { class: 'cb-topics' },
    renderMixTray(),
    renderCategories(),
  );

  const brief = el('textarea', {
    id: 'cb-brief', class: 'cb-brief', rows: '3', placeholder: 'What should this post focus on?',
  });
  brief.addEventListener('input', () => { state.brief = brief.value; });

  const generate = el('button', { type: 'button', class: 'cb-generate', disabled: '' }, 'Generate');
  generate.addEventListener('click', handleGenerate);

  root.append(
    topicsSection,
    el('div', { class: 'cb-field' }, el('label', { for: 'cb-brief' }, 'Content brief'), brief),
    el('div', { class: 'cb-actions' }, generate),
    el('p', { class: 'cb-status', role: 'status', hidden: '' }),
    el('textarea', {
      class: 'cb-fallback', readonly: '', rows: '6', hidden: '', 'aria-label': 'Assembled prompt',
    }),
  );
}

function renderError(root, message) {
  root.append(el('p', { class: 'cb-error', role: 'alert' }, message));
}

(async function init() {
  const root = document.querySelector('.coffee-brief');
  root.append(el('p', { class: 'cb-loading' }, 'Loading…'));

  const sdk = await initSdk();
  root.textContent = '';

  if (sdk) {
    const { context = {}, actions } = sdk;
    state.embedded = true;
    state.actions = actions;
    state.org = context.org;
    state.site = context.site || context.repo;
  }

  renderHeader(root);

  if (state.embedded && (!state.org || !state.site)) {
    renderError(root, `Missing context: ${!state.org ? 'org' : ''} ${!state.site ? 'site' : ''}`.trim());
    return;
  }

  try {
    state.groups = await loadTopicGroups();
  } catch (err) {
    renderError(root, err.message);
    return;
  }

  renderForm(root);
}());
