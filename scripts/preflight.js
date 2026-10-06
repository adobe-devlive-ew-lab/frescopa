/**
 * Custom preflight checks consumed by the Experience Governance tool.
 * The crawler invokes window.aem.preflight() in the page runtime and merges
 * the returned array of { alignment, id, title, reasoning, suggestions } checks.
 * alignment must be one of 'YES' (pass), 'NO' (fail) or 'NA' (not applicable).
 */

// One that always passes.
function checkAlwaysPass() {
  return {
    id: 'always-pass',
    title: 'Baseline preflight check',
    alignment: 'YES',
    reasoning: 'Sentinel check confirming window.aem.preflight is wired up.',
  };
}

// Verify the cards block structure — only applicable when a cards block exists.
function checkCardsStructure() {
  const id = 'cards-structure';
  const title = 'Cards block has valid structure';
  const blocks = [...document.querySelectorAll('.cards.block')];
  if (blocks.length === 0) {
    return { id, title, alignment: 'NA', reasoning: 'No cards block on the page.' };
  }
  const problems = [];
  blocks.forEach((block, bi) => {
    const uls = [...block.children].filter((el) => el.tagName === 'UL');
    if (uls.length !== 1) {
      problems.push(`cards #${bi + 1}: expected exactly one <ul>, found ${uls.length}`);
      return;
    }
    const items = [...uls[0].children];
    if (items.length === 0) problems.push(`cards #${bi + 1}: <ul> has no <li> items`);
    items.forEach((li, liI) => {
      if (li.tagName !== 'LI') {
        problems.push(`cards #${bi + 1} item ${liI + 1}: <ul> child is <${li.tagName.toLowerCase()}>, expected <li>`);
        return;
      }
      [...li.children].forEach((cell) => {
        const ok = cell.classList.contains('cards-card-image')
          || cell.classList.contains('cards-card-body');
        if (!ok) problems.push(`cards #${bi + 1} item ${liI + 1}: cell missing cards-card-image/cards-card-body class`);
      });
      const imageCell = li.querySelector('.cards-card-image');
      if (imageCell && !imageCell.querySelector('picture img')) {
        problems.push(`cards #${bi + 1} item ${liI + 1}: cards-card-image has no <picture><img>`);
      }
    });
  });
  return problems.length === 0
    ? { id, title, alignment: 'YES', reasoning: `${blocks.length} cards block(s) validated.` }
    : {
      id,
      title,
      alignment: 'NO',
      reasoning: problems.join('; '),
      suggestions: 'Ensure each card row is an <li> with cards-card-image and/or cards-card-body cells.',
    };
}

// Verify the page has exactly one H1.
function checkSingleH1() {
  const id = 'single-h1';
  const title = 'Page has exactly one H1';
  const h1s = document.querySelectorAll('main h1');
  if (h1s.length === 1) {
    return { id, title, alignment: 'YES', reasoning: 'Exactly one <h1> found in main.' };
  }
  return {
    id,
    title,
    alignment: 'NO',
    reasoning: `Found ${h1s.length} <h1> element(s) in main; expected exactly 1.`,
    suggestions: h1s.length === 0 ? 'Add a single H1 heading.' : 'Demote extra H1s to H2 or lower.',
  };
}

// Verify every image has non-empty alt text.
function checkImagesHaveAlt() {
  const id = 'images-have-alt';
  const title = 'All images have alt text';
  const imgs = [...document.querySelectorAll('main img')];
  if (imgs.length === 0) {
    return { id, title, alignment: 'NA', reasoning: 'No images on the page.' };
  }
  const missing = imgs.filter((img) => !img.getAttribute('alt') || img.getAttribute('alt').trim() === '');
  return missing.length === 0
    ? { id, title, alignment: 'YES', reasoning: `All ${imgs.length} image(s) have alt text.` }
    : {
      id,
      title,
      alignment: 'NO',
      reasoning: `${missing.length} of ${imgs.length} image(s) missing alt text: ${missing.map((img) => img.currentSrc || img.src).join(', ')}`,
      suggestions: 'Provide descriptive alt text for every image.',
    };
}

// Verify headings descend in a logical, accessible order.
function checkHeadingOrder() {
  const id = 'heading-order';
  const title = 'Headings are in a valid accessibility order';
  const headings = [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')];
  if (headings.length === 0) {
    return { id, title, alignment: 'NA', reasoning: 'No headings on the page.' };
  }

  const level = (h) => Number(h.tagName[1]);
  const label = (h) => h.tagName.toLowerCase();
  const text = (h) => (h.textContent || '').trim().slice(0, 40);
  const problems = [];

  // First heading must be H1.
  if (level(headings[0]) !== 1) {
    problems.push(`First heading is <${label(headings[0])}> ("${text(headings[0])}"); expected <h1>.`);
  }

  // No heading before the first H1.
  const firstH1Index = headings.findIndex((h) => level(h) === 1);
  if (firstH1Index > 0) {
    problems.push(`${firstH1Index} heading(s) appear before the first <h1>.`);
  }

  // No skipped levels when descending.
  let prev = level(headings[0]);
  for (let i = 1; i < headings.length; i += 1) {
    const cur = level(headings[i]);
    if (cur > prev + 1) {
      problems.push(`Heading level jumps from <h${prev}> to <${label(headings[i])}> ("${text(headings[i])}"); do not skip levels.`);
    }
    prev = cur;
  }

  // Dedupe (e.g. first-heading and before-h1 rules can overlap).
  const unique = [...new Set(problems)];
  return unique.length === 0
    ? { id, title, alignment: 'YES', reasoning: `${headings.length} heading(s) in valid order.` }
    : {
      id,
      title,
      alignment: 'NO',
      reasoning: unique.join('; '),
      suggestions: 'Start with a single H1 and step heading levels by one when nesting; do not skip levels.',
    };
}

export default function registerPreflightChecks() {
  window.aem = window.aem || {};
  window.aem.preflight = () => [
    checkHeadingOrder(),
    checkAlwaysPass(),
    checkCardsStructure(),
    checkSingleH1(),
    checkImagesHaveAlt(),
  ];
}
