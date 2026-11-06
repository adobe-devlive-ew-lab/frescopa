const KEYWORDS_URL = 'https://main--seat-15--adobe-devlive-ew-lab.aem.live/keywords.json';

// Reads the published keywords sheet at runtime. Accepts a category column (category/group/section)
// and a keyword column (keyword/keywords/term/name/value); comma-separated cells are split.
async function loadCategories() {
  const resp = await fetch(KEYWORDS_URL, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`keywords sheet ${resp.status}`);
  const json = await resp.json();
  const rows = json.data || json[Object.keys(json).find((k) => json[k]?.data)]?.data || [];
  const pick = (row, names) => {
    const key = Object.keys(row).find((k) => names.includes(k.trim().toLowerCase()));
    return key ? String(row[key] ?? '').trim() : '';
  };
  const byCat = new Map();
  rows.forEach((row) => {
    const cat = pick(row, ['category', 'group', 'section', 'topic']);
    const kws = pick(row, ['keyword', 'keywords', 'term', 'terms', 'name', 'value']);
    if (!cat || !kws) return;
    if (!byCat.has(cat)) byCat.set(cat, new Set());
    kws.split(',').map((s) => s.trim()).filter(Boolean).forEach((k) => byCat.get(cat).add(k));
  });
  return [...byCat].map(([name, set]) => ({ id: slugify(name), name, keywords: [...set] }));
}

// Fallback only, used if the sheet can't be read.
let CATEGORIES = [
  { id: "brand-products", name: "Brand & Products", keywords: ["Frescopa", "Atelier Nova", "Coffee Agent", "Smart Machine", "MyBarista subscription", "Coffee Quiz", "Taste Profiles", "House Blend Medium Roast"] },
  { id: "coffee-types-drinks", name: "Coffee Types & Drinks", keywords: ["Espresso", "Cappuccino", "Latte", "Flat White", "Americano", "Drip Coffee", "Cold Brew", "Iced Coffee"] },
  { id: "flavor-taste", name: "Flavor & Taste", keywords: ["Bold", "Rich", "Smooth", "Balanced", "Full-bodied", "Citrusy notes", "Less acidic", "Crema"] },
  { id: "brewing-preparation", name: "Brewing & Preparation", keywords: ["Brewing", "Extraction", "Steeping", "Coarse grounds", "Coffee-to-water ratio", "French press", "Barista-quality", "Café-quality"] },
  { id: "caffeine-wellbeing", name: "Caffeine & Wellbeing", keywords: ["Caffeine content", "Strength", "Energy boost", "Natural caffeine", "Daily intake", "Gentle on the stomach"] },
  { id: "coffee-production-sourcing", name: "Coffee Production & Sourcing", keywords: ["Responsibly sourced beans", "Roasted to perfection", "Artisan coffee", "Farmer-first", "Ethical sourcing", "Long-term partnerships", "Origin", "Seasonality"] },
  { id: "sustainability", name: "Sustainability", keywords: ["Sustainability", "Circularity", "Reusable cups", "Water stewardship", "Energy efficiency", "Recycling", "Repairable machines", "Responsible packaging"] },
  { id: "brand-voice-experience", name: "Brand Voice & Experience", keywords: ["Coffee ritual", "Coffee moments", "Crafted for coffee lovers", "Every sip", "Personalised brew", "Innovation meets indulgence", "Premium quality", "Connection"] },
  { id: "content-gaps-opportunities", name: "Content Gaps / Opportunities", keywords: ["Single-origin", "Growing regions", "Washed process", "Natural process", "Dark roast", "Decaf", "Grind size", "Pour-over"] },
];

const DRAFT_ROOT = '/drafts/coffee/';
const picks = new Map(); // keyword -> categoryId
let openCat = null;

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => n.append(k));
  return n;
};

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
  .trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);

function toggle(keyword, catId) {
  if (picks.has(keyword)) picks.delete(keyword); else picks.set(keyword, catId);
  render();
}

function renderTray() {
  const box = $('cb-picks');
  box.replaceChildren();
  $('cb-count').textContent = picks.size;
  if (!picks.size) { box.append(el('span', { className: 'cb-empty', textContent: 'Pick keywords below' })); return; }
  picks.forEach((catId, kw) => {
    const chip = el('button', { type: 'button', className: 'cb-chip', title: `Remove ${kw}` }, kw, el('span', { className: 'cb-x', textContent: '×', ariaHidden: 'true' }));
    chip.addEventListener('click', () => toggle(kw, catId));
    box.append(chip);
  });
}

function renderCats() {
  const wrap = $('cb-cats');
  wrap.replaceChildren();
  CATEGORIES.forEach((cat) => {
    const count = [...picks.values()].filter((c) => c === cat.id).length;
    const isOpen = openCat === cat.id;
    const head = el('button', { type: 'button', className: 'cb-cat-head', ariaExpanded: String(isOpen) },
      el('span', { textContent: cat.name }),
      count ? el('span', { className: 'cb-badge', textContent: count }) : '',
      el('span', { className: 'cb-chev', textContent: isOpen ? '⌄' : '›' }));
    head.addEventListener('click', () => { openCat = isOpen ? null : cat.id; renderCats(); });
    const section = el('div', { className: `cb-cat${isOpen ? ' open' : ''}` }, head);
    if (isOpen) {
      const pills = el('div', { className: 'cb-pills' });
      cat.keywords.forEach((kw) => {
        const pill = el('button', { type: 'button', className: `cb-pill${picks.has(kw) ? ' on' : ''}`, textContent: kw, ariaPressed: String(picks.has(kw)) });
        pill.addEventListener('click', () => toggle(kw, cat.id));
        pills.append(pill);
      });
      section.append(pills);
    }
    wrap.append(section);
  });
}

function updateGenerate() {
  $('cb-generate').disabled = !picks.size;
}

function render() { renderTray(); renderCats(); updateGenerate(); }

function surprise() {
  picks.clear();
  const shuffled = [...CATEGORIES].sort(() => Math.random() - 0.5).slice(0, 3);
  shuffled.forEach((cat) => {
    const kw = cat.keywords[Math.floor(Math.random() * cat.keywords.length)];
    picks.set(kw, cat.id);
  });
  openCat = shuffled[0].id;
  render();
}

function buildPrompt() {
  const brief = $('cb-brief').value.trim();
  const topics = [...picks.keys()];
  const topicList = topics.length > 1
    ? `${topics.slice(0, -1).join(', ')} and ${topics.at(-1)}`
    : topics[0] || 'coffee';
  const briefPunctuation = /[.!?]$/.test(brief) ? '' : '.';
  const briefSentence = brief
    ? `The content brief is: ${brief}${briefPunctuation}`
    : 'No content brief was given; choose an angle that suits the Frescopa voice.';
  return [
    `Write a short blog post draft of approximately 400 words for Frescopa about ${topicList}, weaving the topics in naturally.`,
    briefSentence,
    'Include a headline, an intro, two or three subheaded sections and a closing line.',
    `Save it as a new page under ${DRAFT_ROOT} using a short, lowercase, hyphenated slug based on the headline; do not overwrite an existing page.`,
    'Do NOT preview or publish it.',
  ].join(' ');
}

async function sendPrompt(actions, prompt) {
  console.info(prompt);
  const status = $('cb-status');
  const manualPrompt = $('cb-prompt');
  status.className = 'cb-status';
  manualPrompt.hidden = true;
  manualPrompt.value = '';
  $('cb-prompt-label').hidden = true;
  if (typeof actions?.setPrompt === 'function') {
    await actions.setPrompt(prompt, { autoSend: true });
    status.textContent = 'Sent to chat — check the Assistant panel';
    status.classList.add('ok');
    return;
  }
  try {
    await navigator.clipboard.writeText(prompt);
    status.textContent = 'Prompt copied — paste it into the Assistant chat.';
    status.classList.add('ok');
  } catch {
    manualPrompt.value = prompt;
    manualPrompt.hidden = false;
    $('cb-prompt-label').hidden = false;
    status.textContent = 'Copy the prompt below and paste it into the Assistant chat.';
    manualPrompt.focus();
    manualPrompt.select();
  }
}

async function init() {
  render();
  $('cb-surprise').addEventListener('click', surprise);
  $('cb-brief').addEventListener('input', updateGenerate);

  let sdk;
  try {
    sdk = window.parent === window ? null : await Promise.race([
      import('https://da.live/nx/utils/sdk.js').then((module) => module.default),
      new Promise((resolve) => { setTimeout(() => resolve(null), 2000); }),
    ]);
  } catch {
    sdk = null;
  }

  {
    try {
      const cats = await loadCategories();
      if (cats.length) { CATEGORIES = cats; picks.clear(); openCat = null; render(); }
      else throw new Error('no category/keyword rows found');
    } catch (e) {
      $('cb-status').textContent = `Using default keywords (${e.message}).`;
    }
  }

  $('cb-generate').addEventListener('click', async () => {
    const status = $('cb-status');
    status.className = 'cb-status';
    $('cb-generate').disabled = true;
    try {
      await sendPrompt(sdk?.actions, buildPrompt());
    } catch (e) {
      status.textContent = `Could not send to chat: ${e.message || e}`;
      status.classList.add('err');
    } finally {
      updateGenerate();
    }
  });
}

init();
