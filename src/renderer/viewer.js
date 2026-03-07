/* global bookApi */

const state = {
  config: null,
  pages: [],
  spreads: [],
  spreadIndex: 0,
  flip: null,
  holdTimer: null,
  resolvedAssetCache: new Map(),
  animationFrame: null,
  isAnimating: false
};

const elements = {
  stage: document.getElementById('book-stage'),
  shell: document.getElementById('book-shell'),
  staticLeft: document.getElementById('static-left'),
  staticRight: document.getElementById('static-right'),
  underLeft: document.getElementById('under-left'),
  underRight: document.getElementById('under-right'),
  flipSheet: document.getElementById('flip-sheet'),
  flipFront: document.getElementById('flip-front'),
  flipBack: document.getElementById('flip-back'),
  sheetShadow: document.getElementById('sheet-shadow'),
  sheetHighlight: document.getElementById('sheet-highlight'),
  backgroundLayer: document.getElementById('background-layer'),
  mapImage: document.getElementById('displacement-map-image'),
  prevBtn: document.getElementById('prev-btn'),
  nextBtn: document.getElementById('next-btn'),
  indicator: document.getElementById('page-indicator'),
  touchZone: document.getElementById('touch-settings-zone')
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function escapeHtml(value) {
  const input = String(value ?? '');
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pageAt(index) {
  if (typeof index !== 'number' || index < 0 || index >= state.pages.length) {
    return null;
  }

  return state.pages[index];
}

function getPageWidth() {
  return Number(state.config?.design?.page?.width) || 900;
}

function getBaseOffset() {
  return Number(state.config?.design?.pageOffsetX) || 0;
}

function getSpreadShift(spread) {
  const base = getBaseOffset();
  const pageWidth = getPageWidth();

  if (!spread) {
    return base;
  }

  if (spread.leftIndex == null && spread.rightIndex != null) {
    return base - pageWidth / 2;
  }

  if (spread.rightIndex == null && spread.leftIndex != null) {
    return base + pageWidth / 2;
  }

  return base;
}

function isSingleSpread(spread) {
  return Boolean(
    spread &&
      ((spread.leftIndex == null && spread.rightIndex != null) ||
        (spread.rightIndex == null && spread.leftIndex != null))
  );
}

function setShellShift(shift) {
  elements.shell.style.transform = `translateX(${shift}px)`;
}

function buildSpreads() {
  const total = state.pages.length;

  if (total === 0) {
    return [{ leftIndex: null, rightIndex: null }];
  }

  if (total === 1) {
    return [{ leftIndex: null, rightIndex: 0 }];
  }

  const spreads = [];
  spreads.push({ leftIndex: null, rightIndex: 0 });

  let middleIndex = 1;
  const middleEnd = total - 2;
  while (middleIndex <= middleEnd) {
    const leftIndex = middleIndex;
    const rightIndex = middleIndex + 1 <= middleEnd ? middleIndex + 1 : null;
    spreads.push({ leftIndex, rightIndex });
    middleIndex += 2;
  }

  spreads.push({ leftIndex: total - 1, rightIndex: null });
  return spreads;
}

function currentSpread() {
  return state.spreads[state.spreadIndex] || { leftIndex: null, rightIndex: null };
}

function targetSpread(step) {
  return state.spreads[state.spreadIndex + step] || null;
}

async function resolveAssetUrl(relativePath) {
  if (!relativePath) {
    return '';
  }

  if (state.resolvedAssetCache.has(relativePath)) {
    return state.resolvedAssetCache.get(relativePath);
  }

  const url = await window.bookApi.resolveAssetUrl(relativePath);
  state.resolvedAssetCache.set(relativePath, url);
  return url;
}

async function buildPageMarkup(page, pageBackground) {
  if (!page) {
    return '<div class="page-content text"></div>';
  }

  if (page.type === 'image' && page.imagePath) {
    const src = await resolveAssetUrl(page.imagePath);
    return `<div class="page-content image"><img alt="Book page" src="${src}" draggable="false" /></div>`;
  }

  const text = escapeHtml(page.text || page.title || '');
  return `<div class="page-content text" style="background:${escapeHtml(pageBackground)}">${text}</div>`;
}

async function renderPage(element, pageIndex) {
  const page = pageAt(pageIndex);
  const pageBackground = state.config.design.page.background;
  element.style.background = pageBackground;
  element.innerHTML = await buildPageMarkup(page, pageBackground);
}

function showElementIfPage(element, pageIndex) {
  if (pageIndex == null) {
    element.classList.add('hidden');
  } else {
    element.classList.remove('hidden');
  }
}

function stopActiveAnimation() {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
}

function updateIndicator() {
  const spread = currentSpread();
  const left = spread.leftIndex != null ? spread.leftIndex + 1 : null;
  const right = spread.rightIndex != null ? spread.rightIndex + 1 : null;
  const spreadLabel = left && right ? `${left}-${right}` : left || right || 'none';

  elements.indicator.textContent = `View ${state.spreadIndex + 1}/${state.spreads.length} • Pages ${spreadLabel}/${state.pages.length}`;
}

async function renderStaticSpread() {
  const spread = currentSpread();

  await Promise.all([
    renderPage(elements.staticLeft, spread.leftIndex),
    renderPage(elements.staticRight, spread.rightIndex)
  ]);

  showElementIfPage(elements.staticLeft, spread.leftIndex);
  showElementIfPage(elements.staticRight, spread.rightIndex);

  elements.underLeft.classList.add('hidden');
  elements.underRight.classList.add('hidden');

  elements.flipSheet.classList.add('hidden');
  elements.flipSheet.classList.remove('forward', 'backward');
  elements.flipSheet.style.transform = '';
  elements.sheetShadow.style.opacity = '0';
  elements.sheetHighlight.style.opacity = '0';

  elements.shell.classList.toggle('single-view', isSingleSpread(spread));
  setShellShift(getSpreadShift(spread));
  updateIndicator();
}

async function applyDesign() {
  const { design } = state.config;
  const backgroundUrl = await resolveAssetUrl(design.backgroundImage);
  const mapUrl = await resolveAssetUrl(design.displacementMap);

  elements.backgroundLayer.style.backgroundImage = backgroundUrl ? `url("${backgroundUrl}")` : 'none';

  const pageWidth = getPageWidth();
  const pageHeight = Number(design.page.height) || 1200;

  elements.shell.style.width = `${pageWidth * 2}px`;
  elements.shell.style.height = `${pageHeight}px`;

  const displacementScale = mapUrl ? 18 : 0;
  elements.stage.style.filter = mapUrl ? 'url(#book-displacement-filter)' : 'none';
  elements.mapImage.setAttribute('href', mapUrl || '');
  elements.mapImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', mapUrl || '');

  const displacementNode = document.querySelector('#book-displacement-filter feDisplacementMap');
  displacementNode?.setAttribute('scale', String(displacementScale));

  const holdMs = Math.max(1, Number(state.config.mode.settingsHoldSeconds) || 10) * 1000;
  elements.touchZone.dataset.holdDuration = String(holdMs);
}

function computeFlipFromStep(step, current, target) {
  const frontIndex =
    step > 0
      ? (current.rightIndex ?? current.leftIndex)
      : (current.leftIndex ?? current.rightIndex);

  const frontSide = current.rightIndex === frontIndex ? 'right' : 'left';

  const backIndex = frontSide === 'right' ? target.leftIndex : target.rightIndex;
  const underIndex = frontSide === 'right' ? target.rightIndex : target.leftIndex;

  return {
    step,
    frontIndex,
    backIndex,
    underIndex,
    frontSide,
    visualDirection: frontSide === 'right' ? 'forward' : 'backward',
    progress: 0,
    dragging: false,
    pointerId: null,
    shellRect: elements.shell.getBoundingClientRect(),
    sourceSpreadIndex: state.spreadIndex,
    targetSpreadIndex: state.spreadIndex + step,
    sourceShift: getSpreadShift(current),
    targetShift: getSpreadShift(target)
  };
}

async function prepareFlip(step) {
  if (state.isAnimating || state.flip) {
    return false;
  }

  const targetIndex = state.spreadIndex + step;
  if (targetIndex < 0 || targetIndex >= state.spreads.length) {
    return false;
  }

  const current = currentSpread();
  const target = targetSpread(step);
  if (!target) {
    return false;
  }

  const flip = computeFlipFromStep(step, current, target);

  await Promise.all([
    renderPage(elements.flipFront, flip.frontIndex),
    renderPage(elements.flipBack, flip.backIndex),
    renderPage(flip.frontSide === 'right' ? elements.underRight : elements.underLeft, flip.underIndex)
  ]);

  if (flip.frontSide === 'right') {
    elements.staticRight.classList.add('hidden');
    elements.underRight.classList.remove('hidden');
    elements.underLeft.classList.add('hidden');
  } else {
    elements.staticLeft.classList.add('hidden');
    elements.underLeft.classList.remove('hidden');
    elements.underRight.classList.add('hidden');
  }

  showElementIfPage(flip.frontSide === 'right' ? elements.underRight : elements.underLeft, flip.underIndex);

  elements.flipSheet.classList.remove('hidden');
  elements.flipSheet.classList.remove('forward', 'backward');
  elements.flipSheet.classList.add(flip.visualDirection);
  elements.shell.classList.toggle('single-view', isSingleSpread(current));

  state.flip = flip;
  applyFlipProgress(0);
  return true;
}

function applyFlipProgress(progress) {
  if (!state.flip) {
    return;
  }

  state.flip.progress = clamp(progress, 0, 1);

  const isForward = state.flip.visualDirection === 'forward';
  const angle = (isForward ? -180 : 180) * state.flip.progress;
  const bend = Math.sin(Math.PI * state.flip.progress);
  const skew = (isForward ? -1 : 1) * bend * 6;
  const lift = bend * 14;

  elements.flipSheet.style.transform = `translateZ(${lift}px) rotateY(${angle}deg) skewY(${skew}deg)`;
  elements.sheetShadow.style.opacity = `${0.14 + bend * 0.62}`;
  elements.sheetHighlight.style.opacity = `${0.08 + bend * 0.36}`;

  setShellShift(lerp(state.flip.sourceShift, state.flip.targetShift, state.flip.progress));
}

async function finishFlip(commit) {
  if (!state.flip) {
    return;
  }

  const targetSpreadIndex = state.flip.targetSpreadIndex;
  state.flip = null;

  if (commit) {
    state.spreadIndex = targetSpreadIndex;
  }

  state.isAnimating = false;
  await renderStaticSpread();
}

function animateFlipTo(targetProgress) {
  if (!state.flip) {
    return;
  }

  stopActiveAnimation();
  state.isAnimating = true;

  const startProgress = state.flip.progress;
  const distance = Math.abs(targetProgress - startProgress);
  const baseDuration = Math.max(220, Number(state.config.design.turnAnimationMs) || 700);
  const duration = Math.max(120, baseDuration * distance);
  const startTime = performance.now();

  const tick = (now) => {
    if (!state.flip) {
      state.isAnimating = false;
      return;
    }

    const elapsed = now - startTime;
    const t = clamp(elapsed / duration, 0, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    const value = lerp(startProgress, targetProgress, eased);

    applyFlipProgress(value);

    if (t < 1) {
      state.animationFrame = requestAnimationFrame(tick);
      return;
    }

    state.animationFrame = null;
    finishFlip(targetProgress > 0.5);
  };

  state.animationFrame = requestAnimationFrame(tick);
}

function pointerToProgress(clientX) {
  if (!state.flip) {
    return 0;
  }

  const rect = state.flip.shellRect;
  if (state.flip.frontSide === 'right') {
    return clamp((rect.right - clientX) / rect.width, 0, 1);
  }

  return clamp((clientX - rect.left) / rect.width, 0, 1);
}

function decideStepFromPointer(clientX, rect) {
  const canGoNext = state.spreadIndex < state.spreads.length - 1;
  const canGoPrev = state.spreadIndex > 0;
  const mid = rect.left + rect.width / 2;

  if (canGoNext && clientX >= mid) {
    return 1;
  }

  if (canGoPrev && clientX < mid) {
    return -1;
  }

  if (canGoNext) {
    return 1;
  }

  if (canGoPrev) {
    return -1;
  }

  return 0;
}

async function onPointerDown(event) {
  if (state.flip || state.isAnimating) {
    return;
  }

  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }

  const rect = elements.shell.getBoundingClientRect();
  const step = decideStepFromPointer(event.clientX, rect);
  if (!step) {
    return;
  }

  const ready = await prepareFlip(step);
  if (!ready || !state.flip) {
    return;
  }

  state.flip.dragging = true;
  state.flip.pointerId = event.pointerId;

  elements.shell.setPointerCapture(event.pointerId);
  applyFlipProgress(pointerToProgress(event.clientX));
}

function onPointerMove(event) {
  if (!state.flip || !state.flip.dragging) {
    return;
  }

  if (event.pointerId !== state.flip.pointerId) {
    return;
  }

  applyFlipProgress(pointerToProgress(event.clientX));
}

function onPointerUp(event) {
  if (!state.flip || !state.flip.dragging) {
    return;
  }

  if (event.pointerId !== state.flip.pointerId) {
    return;
  }

  state.flip.dragging = false;
  const shouldCommit = state.flip.progress > 0.5;
  animateFlipTo(shouldCommit ? 1 : 0);
}

function onPointerCancel(event) {
  if (!state.flip || !state.flip.dragging) {
    return;
  }

  if (event.pointerId !== state.flip.pointerId) {
    return;
  }

  state.flip.dragging = false;
  animateFlipTo(0);
}

function setupTouchOpenSettings() {
  const startHold = () => {
    const holdDuration = Number(elements.touchZone.dataset.holdDuration || '10000');
    clearTimeout(state.holdTimer);
    state.holdTimer = setTimeout(() => {
      window.bookApi.openSettings();
    }, holdDuration);
  };

  const cancelHold = () => {
    clearTimeout(state.holdTimer);
  };

  elements.touchZone.addEventListener('pointerdown', startHold);
  elements.touchZone.addEventListener('pointerup', cancelHold);
  elements.touchZone.addEventListener('pointerleave', cancelHold);
  elements.touchZone.addEventListener('pointercancel', cancelHold);
}

async function reloadFromConfig() {
  stopActiveAnimation();
  state.resolvedAssetCache.clear();

  state.config = await window.bookApi.getConfig();
  state.pages = state.config.content.pages || [];
  state.spreads = buildSpreads();

  const maxSpread = state.spreads.length - 1;
  state.spreadIndex = clamp(state.spreadIndex, 0, maxSpread);
  state.flip = null;
  state.isAnimating = false;

  await applyDesign();
  await renderStaticSpread();
}

async function triggerStep(step) {
  const ready = await prepareFlip(step);
  if (ready) {
    animateFlipTo(1);
  }
}

function setupEvents() {
  elements.nextBtn.addEventListener('click', () => {
    triggerStep(1);
  });

  elements.prevBtn.addEventListener('click', () => {
    triggerStep(-1);
  });

  elements.shell.addEventListener('pointerdown', onPointerDown);
  elements.shell.addEventListener('pointermove', onPointerMove);
  elements.shell.addEventListener('pointerup', onPointerUp);
  elements.shell.addEventListener('pointercancel', onPointerCancel);
  elements.shell.addEventListener('lostpointercapture', onPointerCancel);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      triggerStep(1);
    }

    if (event.key === 'ArrowLeft') {
      triggerStep(-1);
    }
  });

  window.bookApi.onContentUpdated(() => {
    reloadFromConfig();
  });

  window.bookApi.onUpdateDownloaded((payload) => {
    elements.indicator.textContent = `Update ${payload.version} downloaded. Open settings to install.`;
  });
}

async function bootstrap() {
  setupEvents();
  setupTouchOpenSettings();
  await reloadFromConfig();
}

bootstrap();
