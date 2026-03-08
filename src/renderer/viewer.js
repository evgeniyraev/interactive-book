/* global bookApi */

const state = {
  config: null,
  pages: [],
  special: {
    frontCover: null,
    innerFront: null,
    innerBack: null,
    backCover: null
  },
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
  sideLeftStack: document.getElementById('side-left-stack'),
  sideRightStack: document.getElementById('side-right-stack'),
  baseLeft: document.getElementById('base-left'),
  baseRight: document.getElementById('base-right'),
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
  edgePrevZone: document.getElementById('edge-prev-zone'),
  edgeNextZone: document.getElementById('edge-next-zone'),
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

function normalizeBookPage(rawPage, fallbackText = '') {
  const type = rawPage?.type === 'image' ? 'image' : 'text';
  const text = rawPage?.text || rawPage?.title || fallbackText;

  return {
    type,
    text: String(text || ''),
    imagePath: String(rawPage?.imagePath || '')
  };
}

function hasPageData(rawPage) {
  return Boolean(rawPage && (rawPage.imagePath || rawPage.text || rawPage.title));
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

function getEdgeZoneWidth() {
  const value = Number(state.config?.design?.edgeZoneWidth);
  return clamp(Number.isFinite(value) ? value : 92, 24, 320);
}

function getInnerPagePaddingX() {
  const value = Number(state.config?.design?.innerPagePadding);
  return clamp(Number.isFinite(value) ? value : 24, 0, 120);
}

function getInnerPagePaddingY() {
  const value = Number(state.config?.design?.innerPagePaddingY ?? state.config?.design?.innerPagePadding);
  return clamp(Number.isFinite(value) ? value : 24, 0, 120);
}

function getSideViewMaxWidth() {
  const value = Number(state.config?.design?.sideViewMaxWidth);
  return clamp(Number.isFinite(value) ? value : 68, 0, 220);
}

function isCoverSlot(slot) {
  return slot?.kind === 'front-cover' || slot?.kind === 'back-cover';
}

function isInnerSlot(slot) {
  return slot?.kind === 'inner-front' || slot?.kind === 'inner-back';
}

function getCoverScaleFromInnerPadding() {
  const pageWidth = getPageWidth();
  const innerPadding = getInnerPagePaddingX();
  return (pageWidth + innerPadding) / pageWidth;
}

function getSpreadShift(spread) {
  const base = getBaseOffset();
  const pageWidth = getPageWidth();

  if (!spread) {
    return base;
  }

  if (spread.leftSlot == null && spread.rightSlot != null) {
    return base - (pageWidth * getSpreadScale(spread)) / 2;
  }

  if (spread.rightSlot == null && spread.leftSlot != null) {
    return base + (pageWidth * getSpreadScale(spread)) / 2;
  }

  return base;
}

function getSpreadScale(spread) {
  if (!spread) {
    return 1;
  }

  const singleSlot = spread.leftSlot || spread.rightSlot;
  if ((spread.leftSlot == null || spread.rightSlot == null) && isCoverSlot(singleSlot)) {
    return getCoverScaleFromInnerPadding();
  }

  return 1;
}

function isSingleSpread(spread) {
  return Boolean(
    spread && ((spread.leftSlot == null && spread.rightSlot != null) || (spread.rightSlot == null && spread.leftSlot != null))
  );
}

function getOpenStateByIndex(index) {
  const lastIndex = Math.max(0, state.spreads.length - 1);
  if (index <= 0 || index >= lastIndex) {
    return { factor: 0, progress: 0 };
  }

  const innerStart = 1;
  const innerEnd = Math.max(innerStart, lastIndex - 1);
  const innerRange = Math.max(1, innerEnd - innerStart);
  const progress = clamp((index - innerStart) / innerRange, 0, 1);
  return { factor: 1, progress };
}

function sideWidthsForState(openState, spreadIndex = state.spreadIndex) {
  const maxWidth = Math.min(getSideViewMaxWidth(), getInnerPagePaddingX());
  const factor = openState.factor;
  const progress = openState.progress;
  const widths = {
    left: maxWidth * factor * progress,
    right: maxWidth * factor * (1 - progress)
  };

  const penultimateSpreadIndex = Math.max(0, state.spreads.length - 2);
  if (spreadIndex === penultimateSpreadIndex && factor > 0.001) {
    widths.right = 0;
  }

  return widths;
}

function stackShiftForState(openState, spreadIndex = state.spreadIndex) {
  const widths = sideWidthsForState(openState, spreadIndex);
  return (widths.left - widths.right) / 2;
}

function applySideStackWidths(widths) {
  elements.sideLeftStack.style.width = `${widths.left}px`;
  elements.sideRightStack.style.width = `${widths.right}px`;
  elements.sideLeftStack.classList.toggle('hidden', widths.left <= 0.25);
  elements.sideRightStack.classList.toggle('hidden', widths.right <= 0.25);
}

function setSideStackWidths(openState, spreadIndex = state.spreadIndex) {
  applySideStackWidths(sideWidthsForState(openState, spreadIndex));
}

function setShellTransform(shift, scale = 1) {
  elements.shell.style.transform = `translateX(${shift}px) scaleX(${scale})`;
}

function buildSpreads() {
  const spreads = [];

  spreads.push({ leftSlot: null, rightSlot: { kind: 'front-cover' } });

  const contentSequence = [];
  for (let i = 0; i < state.pages.length; i += 1) {
    contentSequence.push({ kind: 'content', index: i });
  }

  if (contentSequence.length === 0) {
    spreads.push({ leftSlot: { kind: 'inner-front' }, rightSlot: { kind: 'inner-back' } });
    spreads.push({ leftSlot: { kind: 'back-cover' }, rightSlot: null });
    return spreads;
  }

  spreads.push({ leftSlot: { kind: 'inner-front' }, rightSlot: contentSequence[0] });

  for (let i = 1; i < contentSequence.length; i += 2) {
    spreads.push({
      leftSlot: contentSequence[i],
      rightSlot: contentSequence[i + 1] ?? { kind: 'inner-back' }
    });
  }

  if (contentSequence.length % 2 === 1) {
    spreads.push({ leftSlot: { kind: 'inner-back' }, rightSlot: { kind: 'back-cover' } });
    spreads.push({ leftSlot: { kind: 'back-cover' }, rightSlot: null });
    return spreads;
  }

  spreads.push({ leftSlot: { kind: 'back-cover' }, rightSlot: null });

  return spreads;
}

function currentSpread() {
  return state.spreads[state.spreadIndex] || { leftSlot: null, rightSlot: null };
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

function pageForSlot(slot) {
  if (!slot) {
    return null;
  }

  if (slot.kind === 'content') {
    return pageAt(slot.index);
  }

  if (slot.kind === 'front-cover') {
    return state.special.frontCover;
  }

  if (slot.kind === 'inner-front') {
    return state.special.innerFront;
  }

  if (slot.kind === 'inner-back') {
    return state.special.innerBack;
  }

  if (slot.kind === 'back-cover') {
    return state.special.backCover;
  }

  return null;
}

async function buildSlotMarkup(slot) {
  if (!slot) {
    return '<div class="page-content text"></div>';
  }

  const page = normalizeBookPage(pageForSlot(slot));

  if (page.type === 'image' && page.imagePath) {
    const src = await resolveAssetUrl(page.imagePath);
    return `<div class="page-content image"><img alt="Book page" src="${src}" draggable="false" /></div>`;
  }

  const isCover = isCoverSlot(slot);
  const className = isCover ? 'page-content text cover' : 'page-content text';
  return `<div class="${className}">${escapeHtml(page.text || '')}</div>`;
}

async function renderSlot(element, slot) {
  const background = state.config.design.page.background;
  element.style.background = background;
  element.classList.toggle('inner-slot', isInnerSlot(slot));
  element.classList.toggle('cover-slot', isCoverSlot(slot));
  element.innerHTML = await buildSlotMarkup(slot);
}

function showElementIfSlot(element, slot) {
  if (slot == null) {
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

function getVisiblePageEdges(spread) {
  const rect = elements.shell.getBoundingClientRect();
  const half = rect.width / 2;

  if (!spread || (spread.leftSlot == null && spread.rightSlot == null)) {
    return null;
  }

  if (spread.leftSlot == null && spread.rightSlot != null) {
    return { left: rect.left + half, right: rect.right, top: rect.top, height: rect.height };
  }

  if (spread.rightSlot == null && spread.leftSlot != null) {
    return { left: rect.left, right: rect.left + half, top: rect.top, height: rect.height };
  }

  return { left: rect.left, right: rect.right, top: rect.top, height: rect.height };
}

function positionEdgeZones() {
  const spread = currentSpread();
  const edges = getVisiblePageEdges(spread);
  const zoneWidth = getEdgeZoneWidth();

  if (!edges || state.flip) {
    elements.edgePrevZone.classList.add('hidden');
    elements.edgeNextZone.classList.add('hidden');
    return;
  }

  const prevLeft = clamp(edges.left, 0, Math.max(0, window.innerWidth - zoneWidth));
  const nextLeft = clamp(edges.right - zoneWidth, 0, Math.max(0, window.innerWidth - zoneWidth));

  elements.edgePrevZone.style.left = `${prevLeft}px`;
  elements.edgePrevZone.style.top = `${edges.top}px`;
  elements.edgePrevZone.style.height = `${edges.height}px`;

  elements.edgeNextZone.style.left = `${nextLeft}px`;
  elements.edgeNextZone.style.top = `${edges.top}px`;
  elements.edgeNextZone.style.height = `${edges.height}px`;

  elements.edgePrevZone.classList.remove('hidden');
  elements.edgeNextZone.classList.remove('hidden');

  elements.edgePrevZone.disabled = state.spreadIndex <= 0;
  elements.edgeNextZone.disabled = state.spreadIndex >= state.spreads.length - 1;
}

async function renderBasePages(openState) {
  await Promise.all([
    renderSlot(elements.baseLeft, { kind: 'inner-front' }),
    renderSlot(elements.baseRight, { kind: 'inner-back' })
  ]);

  const show = openState.factor > 0.001;
  if (!show) {
    elements.baseLeft.classList.add('hidden');
  } else {
    elements.baseLeft.classList.remove('hidden');
  }

  if (!show) {
    elements.baseRight.classList.add('hidden');
  } else {
    elements.baseRight.classList.remove('hidden');
  }
}

async function renderStaticSpread() {
  const spread = currentSpread();
  const openState = getOpenStateByIndex(state.spreadIndex);

  await Promise.all([
    renderSlot(elements.staticLeft, spread.leftSlot),
    renderSlot(elements.staticRight, spread.rightSlot)
  ]);

  await renderBasePages(openState);

  showElementIfSlot(elements.staticLeft, spread.leftSlot);
  showElementIfSlot(elements.staticRight, spread.rightSlot);

  elements.underLeft.classList.add('hidden');
  elements.underRight.classList.add('hidden');

  elements.flipSheet.classList.add('hidden');
  elements.flipSheet.classList.remove('forward', 'backward');
  elements.flipSheet.style.transform = '';
  elements.sheetShadow.style.opacity = '0';
  elements.sheetHighlight.style.opacity = '0';

  const fullShift = getSpreadShift(spread) + stackShiftForState(openState, state.spreadIndex);

  elements.shell.classList.toggle('single-view', isSingleSpread(spread));
  setShellTransform(fullShift, getSpreadScale(spread));
  setSideStackWidths(openState, state.spreadIndex);
  positionEdgeZones();
}

async function applyDesign() {
  const { design } = state.config;
  const backgroundUrl = await resolveAssetUrl(design.backgroundImage);
  const mapUrl = await resolveAssetUrl(design.displacementMap);
  const sideTextureUrl = await resolveAssetUrl(design.sideViewTexture || '');
  const appBackgroundColor = design.appBackgroundColor || '#101319';

  document.body.style.backgroundColor = appBackgroundColor;
  elements.backgroundLayer.style.backgroundColor = appBackgroundColor;
  elements.backgroundLayer.style.backgroundImage = backgroundUrl ? `url("${backgroundUrl}")` : 'none';

  const pageWidth = getPageWidth();
  const pageHeight = Number(design.page.height) || 1200;

  elements.shell.style.width = `${pageWidth * 2}px`;
  elements.shell.style.height = `${pageHeight}px`;

  const stackTexture = sideTextureUrl ? `url("${sideTextureUrl}")` : 'linear-gradient(90deg, #c8b79b, #bca88a, #d6c8ad)';
  elements.sideLeftStack.style.backgroundImage = stackTexture;
  elements.sideRightStack.style.backgroundImage = stackTexture;

  const displacementScale = mapUrl ? 18 : 0;
  elements.stage.style.filter = mapUrl ? 'url(#book-displacement-filter)' : 'none';
  elements.mapImage.setAttribute('href', mapUrl || '');
  elements.mapImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', mapUrl || '');

  const displacementNode = document.querySelector('#book-displacement-filter feDisplacementMap');
  displacementNode?.setAttribute('scale', String(displacementScale));

  const holdMs = Math.max(1, Number(state.config.mode.settingsHoldSeconds) || 10) * 1000;
  elements.touchZone.dataset.holdDuration = String(holdMs);

  document.documentElement.style.setProperty('--edge-zone-width', `${getEdgeZoneWidth()}px`);
  document.documentElement.style.setProperty('--inner-page-padding', `${getInnerPagePaddingX()}px`);
  document.documentElement.style.setProperty('--inner-page-padding-x', `${getInnerPagePaddingX()}px`);
  document.documentElement.style.setProperty('--inner-page-padding-y', `${getInnerPagePaddingY()}px`);
}

function computeFlipFromStep(step, current, target) {
  const frontSlot =
    step > 0
      ? (current.rightSlot ?? current.leftSlot)
      : (current.leftSlot ?? current.rightSlot);

  const frontSide = current.rightSlot === frontSlot ? 'right' : 'left';

  let backSlot = frontSide === 'right' ? target.leftSlot : target.rightSlot;
  if (frontSlot?.kind === 'front-cover') {
    backSlot = { kind: 'inner-front' };
  } else if (frontSlot?.kind === 'back-cover') {
    backSlot = { kind: 'inner-back' };
  }
  const underSlot = frontSide === 'right' ? target.rightSlot : target.leftSlot;

  const sourceOpenState = getOpenStateByIndex(state.spreadIndex);
  const targetOpenState = getOpenStateByIndex(state.spreadIndex + step);

  return {
    frontSlot,
    backSlot,
    underSlot,
    frontSide,
    visualDirection: frontSide === 'right' ? 'forward' : 'backward',
    progress: 0,
    dragging: false,
    pointerId: null,
    shellRect: elements.shell.getBoundingClientRect(),
    sourceSpreadIndex: state.spreadIndex,
    targetSpreadIndex: state.spreadIndex + step,
    sourceShift: getSpreadShift(current) + stackShiftForState(sourceOpenState, state.spreadIndex),
    targetShift: getSpreadShift(target) + stackShiftForState(targetOpenState, state.spreadIndex + step),
    sourceScale: getSpreadScale(current),
    targetScale: getSpreadScale(target),
    sourceOpenState,
    targetOpenState
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
    renderSlot(elements.flipFront, flip.frontSlot),
    renderSlot(elements.flipBack, flip.backSlot),
    renderSlot(flip.frontSide === 'right' ? elements.underRight : elements.underLeft, flip.underSlot)
  ]);

  await renderBasePages(flip.sourceOpenState);

  if (flip.frontSide === 'right') {
    elements.staticRight.classList.add('hidden');
    elements.underRight.classList.remove('hidden');
    elements.underLeft.classList.add('hidden');
  } else {
    elements.staticLeft.classList.add('hidden');
    elements.underLeft.classList.remove('hidden');
    elements.underRight.classList.add('hidden');
  }

  showElementIfSlot(flip.frontSide === 'right' ? elements.underRight : elements.underLeft, flip.underSlot);

  elements.flipSheet.classList.remove('hidden');
  elements.flipSheet.classList.remove('forward', 'backward');
  elements.flipSheet.classList.add(flip.visualDirection);
  elements.shell.classList.toggle('single-view', isSingleSpread(current));
  elements.edgePrevZone.classList.add('hidden');
  elements.edgeNextZone.classList.add('hidden');

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
  const closedOpenTransition = state.flip.sourceOpenState.factor !== state.flip.targetOpenState.factor;
  if (closedOpenTransition) {
    elements.sheetShadow.style.opacity = '0';
    elements.sheetHighlight.style.opacity = '0';
  } else {
    elements.sheetShadow.style.opacity = `${0.14 + bend * 0.62}`;
    elements.sheetHighlight.style.opacity = `${0.08 + bend * 0.36}`;
  }

  setShellTransform(
    lerp(state.flip.sourceShift, state.flip.targetShift, state.flip.progress),
    lerp(state.flip.sourceScale, state.flip.targetScale, state.flip.progress)
  );

  const openState = {
    factor: lerp(state.flip.sourceOpenState.factor, state.flip.targetOpenState.factor, state.flip.progress),
    progress: lerp(state.flip.sourceOpenState.progress, state.flip.targetOpenState.progress, state.flip.progress)
  };

  const transitioningWithClosed = state.flip.sourceOpenState.factor !== state.flip.targetOpenState.factor;
  const sourceWidths = sideWidthsForState(state.flip.sourceOpenState, state.flip.sourceSpreadIndex);
  const targetWidths = sideWidthsForState(state.flip.targetOpenState, state.flip.targetSpreadIndex);
  applySideStackWidths({
    left: lerp(sourceWidths.left, targetWidths.left, state.flip.progress),
    right: lerp(sourceWidths.right, targetWidths.right, state.flip.progress)
  });

  if (transitioningWithClosed) {
    const lastSpreadIndex = Math.max(0, state.spreads.length - 1);
    const isOpeningFromFrontCover = state.flip.sourceSpreadIndex === 0 && state.flip.targetSpreadIndex === 1;
    if (isOpeningFromFrontCover) {
      const showBackInner = state.flip.progress > 0.001;
      elements.baseLeft.classList.add('hidden');
      elements.baseRight.classList.toggle('hidden', !showBackInner);
      return;
    }

    const isClosingToFrontCover = state.flip.sourceSpreadIndex === 1 && state.flip.targetSpreadIndex === 0;
    if (isClosingToFrontCover) {
      const showBackInner = state.flip.progress < 0.999;
      elements.baseLeft.classList.add('hidden');
      elements.baseRight.classList.toggle('hidden', !showBackInner);
      return;
    }

    const isOpeningFromBackCover =
      state.flip.sourceSpreadIndex === lastSpreadIndex && state.flip.targetSpreadIndex === lastSpreadIndex - 1;
    if (isOpeningFromBackCover) {
      const showFrontInner = state.flip.progress > 0.001;
      elements.baseRight.classList.add('hidden');
      elements.baseLeft.classList.toggle('hidden', !showFrontInner);
      return;
    }

    const isClosingToBackCover =
      state.flip.sourceSpreadIndex === lastSpreadIndex - 1 && state.flip.targetSpreadIndex === lastSpreadIndex;
    if (isClosingToBackCover) {
      const showFrontInner = state.flip.progress < 0.999;
      elements.baseRight.classList.add('hidden');
      elements.baseLeft.classList.toggle('hidden', !showFrontInner);
      return;
    }

    elements.baseLeft.classList.add('hidden');
    elements.baseRight.classList.add('hidden');
    return;
  }

  elements.baseLeft.classList.toggle('hidden', openState.factor <= 0.001);
  elements.baseRight.classList.toggle('hidden', openState.factor <= 0.001);
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

function resolveSpecialPages(config) {
  const content = config.content || {};
  const legacyCovers = content.covers || {};
  const frontSource = hasPageData(content.frontCover) ? content.frontCover : legacyCovers.front;
  const backSource = hasPageData(content.backCover) ? content.backCover : legacyCovers.back;

  return {
    frontCover: normalizeBookPage(frontSource, 'Book Title'),
    innerFront: normalizeBookPage(content.innerFront, ''),
    innerBack: normalizeBookPage(content.innerBack, ''),
    backCover: normalizeBookPage(backSource, '')
  };
}

async function reloadFromConfig() {
  stopActiveAnimation();
  state.resolvedAssetCache.clear();

  state.config = await window.bookApi.getConfig();
  state.pages = (state.config.content?.pages || []).map((page) => normalizeBookPage(page));
  state.special = resolveSpecialPages(state.config);
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
  elements.edgeNextZone.addEventListener('click', () => {
    triggerStep(1);
  });

  elements.edgePrevZone.addEventListener('click', () => {
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

  window.addEventListener('resize', () => {
    positionEdgeZones();
  });

  window.bookApi.onContentUpdated(() => {
    reloadFromConfig();
  });
}

async function bootstrap() {
  setupEvents();
  setupTouchOpenSettings();
  await reloadFromConfig();
}

bootstrap();
