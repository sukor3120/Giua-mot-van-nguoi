const overtureStage = document.getElementById('overtureStage');
const stickyStage = document.getElementById('stickyStage');
const curtainLeft = document.getElementById('curtainLeft');
const curtainRight = document.getElementById('curtainRight');
const topRisingHeader = document.getElementById('topRisingHeader');
const prosceniumValance = document.querySelector('.proscenium-valance');
const stageSpotlightRays = document.querySelector('.stage-spotlight-rays');
const scrollProgressBar = document.getElementById('scrollProgressBar');

const mvWorldCameraGroup = document.getElementById('mvWorldCameraGroup');
const mvInitialDarkTint = document.getElementById('mvInitialDarkTint');
const mvWaterReflection = document.getElementById('mvWaterReflection');
const mvWaterRipples = document.getElementById('mvWaterRipples');
const mvTitleCardLayer = document.getElementById('mvTitleCardLayer');
const mvAuthorGothic = document.getElementById('mvAuthorGothic');
const mvLyricSequence = document.getElementById('mvLyricSequence');
const stageHud = document.getElementById('stageHud');
const mvZoomSlider = document.getElementById('mvZoomSlider');
const hudPlayMvBtn = document.getElementById('hudPlayMvBtn');

let isManualSliderActive = false;
let isAutoPlayingMv = false;
let autoPlayStartTime = 0;
let autoPlayStartProgress = 0;
let currentMvProgress = 0;
let currentCurtainPhase = 0;
let pointerNormX = 0;
let pointerNormY = 0;

// Exact measured camera keyframes from hero.mp4 (1920x1080 coordinate space)
// Ballerina base placement at scale=1.00: x=889, y=268, width=127.7, height=171 (toes at y=439)
const MV_CAMERA_KEYFRAMES = [
  { p: 0.00, s: 8.08, bx: 497.8, by: 169.8 },
  { p: 0.21, s: 8.04, bx: 500.0, by: 171.0 }, // frame_3_2.png (title fades out, zoom begins)
  { p: 0.45, s: 4.28, bx: 708.0, by: 189.0 }, // frame_5_5.png (lake horizon at knees, inner mountains enter)
  { p: 0.68, s: 2.08, bx: 830.0, by: 213.0 }, // frame_7_8.png (full water reflection & twin mountains)
  { p: 0.86, s: 1.25, bx: 875.0, by: 247.0 }, // frame_10_2.png (gothic columns, hanging vines & shore enter)
  { p: 0.96, s: 1.00, bx: 889.0, by: 268.0 }, // frame_11_5.png (full 1:1 theatrical stage)
  { p: 1.00, s: 1.00, bx: 889.0, by: 268.0 }
];

const lyricPhrasesText = [
  'giữa một vạn người',
  'liệu bạn có tìm thấy mình'
];
let renderedPhraseIndex = -1;
let renderedLitEl = null;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function lerp(start, end, t) {
  return start + (end - start) * clamp(t, 0, 1);
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function sampleCameraState(mvProgress) {
  const p = clamp(mvProgress, 0, 1);
  for (let i = 0; i < MV_CAMERA_KEYFRAMES.length - 1; i++) {
    const k0 = MV_CAMERA_KEYFRAMES[i];
    const k1 = MV_CAMERA_KEYFRAMES[i + 1];
    if (p >= k0.p && p <= k1.p) {
      const span = k1.p - k0.p;
      const rawT = span > 0 ? (p - k0.p) / span : 0;
      // Optical logarithmic scale interpolation for silky constant-velocity cinema zoom
      const s = Math.exp(lerp(Math.log(k0.s), Math.log(k1.s), rawT));
      const scaleFrac = Math.abs(k1.s - k0.s) > 1e-4 ? (s - k0.s) / (k1.s - k0.s) : rawT;
      const bx = lerp(k0.bx, k1.bx, scaleFrac);
      const by = lerp(k0.by, k1.by, scaleFrac);
      return { s, bx, by };
    }
  }
  const last = MV_CAMERA_KEYFRAMES[MV_CAMERA_KEYFRAMES.length - 1];
  return { s: last.s, bx: last.bx, by: last.by };
}

function ensureLyricPhraseDom(phraseIdx) {
  if (!mvLyricSequence) return;
  if (renderedPhraseIndex === phraseIdx && renderedLitEl) return;
  renderedPhraseIndex = phraseIdx;
  const text = lyricPhrasesText[phraseIdx] || '';
  mvLyricSequence.innerHTML = `
    <span class="mv-lyric-phrase-wrap">
      <span class="mv-lyric-charcoal" aria-hidden="true">${text}</span>
      <span class="mv-lyric-lit">${text}</span>
    </span>
  `;
  renderedLitEl = mvLyricSequence.querySelector('.mv-lyric-lit');
}

function updateLyricByMvProgress(mvProgress) {
  if (!mvLyricSequence) return;

  if (mvProgress < 0.26) {
    mvLyricSequence.style.opacity = '0';
    return;
  }

  let phraseIdx = 0;
  let fadeInT = 1;
  let litT = 0;
  let fadeOutT = 1;

  if (mvProgress < 0.64) {
    phraseIdx = 0;
    fadeInT = smoothstep(0.26, 0.32, mvProgress);
    litT = clamp((mvProgress - 0.30) / 0.25, 0, 1);
    fadeOutT = 1 - smoothstep(0.57, 0.635, mvProgress);
  } else {
    phraseIdx = 1;
    fadeInT = smoothstep(0.64, 0.70, mvProgress);
    litT = clamp((mvProgress - 0.68) / 0.24, 0, 1);
    fadeOutT = 1;
  }

  ensureLyricPhraseDom(phraseIdx);
  const visibility = fadeInT * fadeOutT;
  mvLyricSequence.style.opacity = visibility.toFixed(3);
  mvLyricSequence.style.filter = `blur(${((1 - visibility) * 5.5).toFixed(1)}px)`;

  if (renderedLitEl) {
    const litPct = lerp(-15, 102, litT);
    renderedLitEl.style.setProperty('--lit-pct', `${litPct.toFixed(1)}%`);
  }
}

function applyMvAnimationProgress(mvProgress) {
  mvProgress = clamp(mvProgress, 0, 1);
  currentMvProgress = mvProgress;

  if (mvZoomSlider && !isManualSliderActive) {
    mvZoomSlider.value = Math.round(mvProgress * 100);
  }

  // 1. Phase 1 Opening Title Card ("ANTI PHÙNG KHÁNH LINH" + "Tô Đức Cường")
  const titleFade = 1 - smoothstep(0.11, 0.22, mvProgress);
  const titleBlur = (1 - titleFade) * 6;
  if (mvTitleCardLayer) {
    mvTitleCardLayer.style.opacity = titleFade.toFixed(3);
    mvTitleCardLayer.style.filter = `blur(${titleBlur.toFixed(1)}px)`;
    mvTitleCardLayer.style.transform = `translate3d(calc(-50% + ${(pointerNormX * 5).toFixed(1)}px), calc(-50% + ${(pointerNormY * 3.5).toFixed(1)}px), 0) scale(${lerp(1, 0.975, 1 - titleFade).toFixed(3)})`;
  }

  if (mvAuthorGothic) {
    mvAuthorGothic.style.opacity = titleFade.toFixed(3);
    mvAuthorGothic.style.filter = `blur(${titleBlur.toFixed(1)}px)`;
  }

  // 2. Opening Dark Charcoal Stage Veil (matches frame_0_3.png -> frame_3_2.png illumination)
  const brightenProgress = smoothstep(0.10, 0.23, mvProgress);
  if (mvInitialDarkTint) {
    mvInitialDarkTint.setAttribute('opacity', lerp(0.66, 0.0, brightenProgress).toFixed(3));
  }

  // 3. Exact 8.04x -> 1.00x Camera Zoom-Out on the unified 1920x1080 Stage World
  const cam = sampleCameraState(mvProgress);
  const parallaxDamp = 1 - smoothstep(0.75, 1.0, mvProgress) * 0.7;
  const shiftX = pointerNormX * 9 * parallaxDamp;
  const shiftY = pointerNormY * 4.5 * parallaxDamp;
  const tx = cam.bx - 889.0 * cam.s + shiftX;
  const ty = cam.by - 268.0 * cam.s + shiftY;

  if (mvWorldCameraGroup) {
    mvWorldCameraGroup.setAttribute(
      'transform',
      `translate(${tx.toFixed(2)}, ${ty.toFixed(2)}) scale(${cam.s.toFixed(4)})`
    );
  }

  // 4. Water Reflection & Ripple visibility as lake enters viewport
  const reflectionProgress = smoothstep(0.32, 0.55, mvProgress);
  if (mvWaterReflection) {
    mvWaterReflection.setAttribute('opacity', (reflectionProgress * 0.90).toFixed(3));
  }
  if (mvWaterRipples) {
    mvWaterRipples.setAttribute('opacity', (reflectionProgress * 0.85).toFixed(3));
  }

  // 5. Bottom Gothic Lyrics ("giữa một vạn người" -> "liệu bạn có tìm thấy mình")
  updateLyricByMvProgress(mvProgress);
}

function updateHeaderTransform() {
  if (!topRisingHeader) return;
  const moveUpVh = currentCurtainPhase * 115;
  const headerOpacity = 1 - Math.pow(currentCurtainPhase, 1.25);
  const tiltX = pointerNormX * 10 * (1 - currentCurtainPhase);
  const tiltY = pointerNormY * 6 * (1 - currentCurtainPhase);
  topRisingHeader.style.transform = `translate3d(calc(-50% + ${tiltX.toFixed(1)}px), calc(-${moveUpVh.toFixed(2)}vh + ${tiltY.toFixed(1)}px), 0)`;
  topRisingHeader.style.opacity = headerOpacity.toFixed(3);
  topRisingHeader.style.pointerEvents = headerOpacity < 0.1 ? 'none' : 'auto';
}

function stopAutoPlayMv() {
  if (!isAutoPlayingMv) return;
  isAutoPlayingMv = false;
  if (hudPlayMvBtn) {
    hudPlayMvBtn.classList.remove('playing');
    hudPlayMvBtn.textContent = '▶ Phát MV';
  }
}

function updateStageOnScroll() {
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollProgressBar && docHeight > 0) {
    const pagePct = clamp((window.pageYOffset / docHeight) * 100, 0, 100);
    scrollProgressBar.style.width = `${pagePct.toFixed(2)}%`;
  }

  if (!overtureStage) return;
  const stageTop = overtureStage.offsetTop;
  const scrollableDistance = overtureStage.offsetHeight - window.innerHeight;
  const scrollY = window.pageYOffset;

  const totalProgress = clamp((scrollY - stageTop) / scrollableDistance, 0, 1);

  currentCurtainPhase = clamp(totalProgress / 0.24, 0, 1);
  const curtainOffset = currentCurtainPhase * 104;
  if (curtainLeft) curtainLeft.style.transform = `translate3d(-${curtainOffset.toFixed(2)}%, 0, 0)`;
  if (curtainRight) curtainRight.style.transform = `translate3d(${curtainOffset.toFixed(2)}%, 0, 0)`;

  updateHeaderTransform();

  if (prosceniumValance) {
    prosceniumValance.style.opacity = (1 - currentCurtainPhase * 0.92).toFixed(3);
    prosceniumValance.style.transform = `translate3d(0, -${(currentCurtainPhase * 95).toFixed(2)}%, 0)`;
  }

  if (stageSpotlightRays) {
    stageSpotlightRays.style.opacity = (1 - currentCurtainPhase * 0.95).toFixed(3);
  }

  if (stageHud) {
    stageHud.classList.toggle('active', currentCurtainPhase >= 0.88 && totalProgress < 0.995);
  }

  if (!isAutoPlayingMv) {
    isManualSliderActive = false;
    const mvProgress = clamp((totalProgress - 0.24) / 0.76, 0, 1);
    applyMvAnimationProgress(mvProgress);
  }
}

let stageUpdateQueued = false;
function requestStageUpdate() {
  if (stageUpdateQueued) return;
  stageUpdateQueued = true;
  requestAnimationFrame(function () {
    stageUpdateQueued = false;
    updateStageOnScroll();
  });
}

window.addEventListener('scroll', function () {
  if (isAutoPlayingMv) stopAutoPlayMv();
  requestStageUpdate();
}, { passive: true });

window.addEventListener('resize', function () {
  requestStageUpdate();
});

if (stickyStage) {
  stickyStage.addEventListener('mousemove', function (e) {
    const rect = stickyStage.getBoundingClientRect();
    pointerNormX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointerNormY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    requestAnimationFrame(function () {
      updateHeaderTransform();
      applyMvAnimationProgress(currentMvProgress);
    });
  }, { passive: true });
}

function triggerSmoothOpen() {
  if (!overtureStage) return;
  const scrollableDistance = overtureStage.offsetHeight - window.innerHeight;
  const targetScroll = overtureStage.offsetTop + scrollableDistance * 0.25;
  window.scrollTo({ top: targetScroll, behavior: 'smooth' });
}

const crestLogoTrigger = document.getElementById('crestLogoTrigger');
const scrollHintBtn = document.getElementById('scrollHintBtn');
if (crestLogoTrigger) crestLogoTrigger.addEventListener('click', triggerSmoothOpen);
if (scrollHintBtn) scrollHintBtn.addEventListener('click', triggerSmoothOpen);

if (mvZoomSlider) {
  mvZoomSlider.addEventListener('input', function () {
    stopAutoPlayMv();
    isManualSliderActive = true;
    const mvProgress = parseFloat(this.value) / 100;
    applyMvAnimationProgress(mvProgress);
  });
}

function stepAutoPlayMv(now) {
  if (!isAutoPlayingMv) return;
  const durationMs = 12100; // Matches exact 12.10s duration of hero.mp4
  const elapsed = now - autoPlayStartTime;
  const nextProgress = clamp(autoPlayStartProgress + elapsed / durationMs, 0, 1);
  isManualSliderActive = false;
  applyMvAnimationProgress(nextProgress);

  if (nextProgress >= 1) {
    stopAutoPlayMv();
  } else {
    requestAnimationFrame(stepAutoPlayMv);
  }
}

if (hudPlayMvBtn) {
  hudPlayMvBtn.addEventListener('click', function () {
    if (isAutoPlayingMv) {
      stopAutoPlayMv();
      return;
    }
    isAutoPlayingMv = true;
    hudPlayMvBtn.classList.add('playing');
    hudPlayMvBtn.textContent = '⏸ Dừng';
    autoPlayStartProgress = currentMvProgress >= 0.96 ? 0 : currentMvProgress;
    autoPlayStartTime = performance.now();
    requestAnimationFrame(stepAutoPlayMv);
  });
}

function initVintageFilmCanvas() {
  const canvas = document.getElementById('mvFilmScratchCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const rippleTurb = document.getElementById('mvRippleTurb');

  const scratchTracks = [
    { x: 472, vx: 0.8, alpha: 0.22, width: 1.1 },
    { x: 676, vx: -0.5, alpha: 0.18, width: 0.9 },
    { x: 1018, vx: 0.6, alpha: 0.28, width: 1.25 },
    { x: 1320, vx: -0.9, alpha: 0.16, width: 1.0 }
  ];

  let lastFrameTime = 0;
  let ripplePhase = 0;

  function renderFilmFrame(now) {
    requestAnimationFrame(renderFilmFrame);
    if (document.hidden) return;
    if (now - lastFrameTime < 42) return; // Authentic 24fps film cadence
    lastFrameTime = now;

    // Gentle shimmer on water reflection turbulence
    ripplePhase += 0.09;
    if (rippleTurb && currentMvProgress > 0.30) {
      const bfY = (0.092 + Math.sin(ripplePhase) * 0.008).toFixed(4);
      rippleTurb.setAttribute('baseFrequency', `0.012 ${bfY}`);
    }

    ctx.clearRect(0, 0, w, h);

    // Draw vertical 16mm film scratches matching hero.mp4
    scratchTracks.forEach((sc, i) => {
      if (Math.random() < 0.18) {
        sc.x += (Math.random() - 0.5) * 28;
      } else {
        sc.x += sc.vx;
      }
      if (sc.x < 160) sc.x = 1740;
      if (sc.x > 1760) sc.x = 180;

      if (Math.random() < 0.82) {
        const topY = Math.random() < 0.65 ? 0 : Math.random() * 240;
        const botY = Math.random() < 0.65 ? h : h - Math.random() * 220;
        const a = sc.alpha * (0.65 + Math.random() * 0.55);
        ctx.strokeStyle = `rgba(232, 230, 231, ${a.toFixed(3)})`;
        ctx.lineWidth = sc.width;
        ctx.beginPath();
        ctx.moveTo(sc.x, topY);
        ctx.lineTo(sc.x + (Math.random() - 0.5) * 2.2, botY);
        ctx.stroke();
      }
    });

    // Occasional vintage film dust specks / tiny blotches
    const speckCount = 2 + Math.floor(Math.random() * 3);
    for (let s = 0; s < speckCount; s++) {
      const sx = 180 + Math.random() * 1560;
      const sy = 80 + Math.random() * 880;
      const sr = 1.2 + Math.random() * 2.8;
      const sa = 0.12 + Math.random() * 0.22;
      ctx.fillStyle = `rgba(225, 222, 223, ${sa.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, sr, sr * (0.6 + Math.random() * 0.8), Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(renderFilmFrame);
}

function playTourVideoNow() {
  const iframe = document.getElementById('pklTourYoutubeIframe');
  if (!iframe) return;
  try {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
      'https://www.youtube.com'
    );
  } catch (err) {
    iframe.src = 'https://www.youtube.com/embed/jITO5NX79pI?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1';
  }
}

function toggleCinemaLights() {
  const frame = document.getElementById('theatreVideoFrame');
  const btn = document.getElementById('cinemaLightBtn');
  if (!frame || !btn) return;
  const isDimmed = frame.classList.toggle('cinema-dimmed');
  btn.classList.toggle('active', isDimmed);
  btn.innerHTML = isDimmed ? '<span>☀️</span> Bật Đèn Sân Khấu' : '<span>💡</span> Tắt Đèn Sân Khấu';
}

const playTourBtn = document.getElementById('playTourBtn');
const cinemaLightBtn = document.getElementById('cinemaLightBtn');
if (playTourBtn) playTourBtn.addEventListener('click', playTourVideoNow);
if (cinemaLightBtn) cinemaLightBtn.addEventListener('click', toggleCinemaLights);

function tryLoadCandidates(candidates, onSuccess) {
  let index = 0;
  function tryNext() {
    if (index >= candidates.length) return;
    const url = candidates[index++];
    const probe = new Image();
    probe.onload = function () { onSuccess(url); };
    probe.onerror = tryNext;
    probe.src = url;
  }
  tryNext();
}

function initAutoPreloadAssets() {
  tryLoadCandidates(['logo.png'], function(validSrc) {
    const logoImg = document.getElementById('topCrestImage');
    const logoSvg = document.getElementById('svgCrest3D');
    if (logoImg && logoSvg) {
      logoImg.src = validSrc;
      logoImg.style.display = 'block';
      logoSvg.style.display = 'none';
    }
  });

  tryLoadCandidates(['avt.png'], function(validSrc) {
    const avtImg = document.getElementById('userPortraitImg');
    const avtSvg = document.getElementById('avtFallbackSvg');
    if (avtImg && avtSvg) {
      avtImg.src = validSrc;
      avtImg.style.display = 'block';
      avtSvg.style.display = 'none';
    }
  });

  // act_1.png .. act_5.png are pre-cleaned RGBA PNGs with transparent backgrounds & no watermarks
  const actCandidates = [
    { imgId: 'act1Img', svgId: 'act1Svg', files: ['act_1.png'] },
    { imgId: 'act2Img', svgId: 'act2Svg', files: ['act_2.png'] },
    { imgId: 'act3Img', svgId: 'act3Svg', files: ['act_3.png'] },
    { imgId: 'act4Img', svgId: 'act4Svg', files: ['act_4.png'] },
    { imgId: 'act5Img', svgId: 'act5Svg', files: ['act_5.png'] }
  ];

  actCandidates.forEach(item => {
    tryLoadCandidates(item.files, function(validSrc) {
      const imgEl = document.getElementById(item.imgId);
      const svgEl = document.getElementById(item.svgId);
      if (imgEl && svgEl) {
        imgEl.classList.remove('act-img-raw');
        imgEl.src = validSrc;
        imgEl.style.display = 'block';
        svgEl.style.display = 'none';
      }
    });
  });
}

function initScrollRevealAndGlow() {
  const revealEls = document.querySelectorAll('.reveal-on-scroll');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach((el, idx) => {
      if (el.classList.contains('act-door-card')) {
        el.style.transitionDelay = `${(idx % 5) * 75}ms`;
      }
      observer.observe(el);
    });
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  const glowCards = document.querySelectorAll('.interactive-glow-card');
  glowCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mouse-x', `${x.toFixed(1)}%`);
      card.style.setProperty('--mouse-y', `${y.toFixed(1)}%`);
    }, { passive: true });
  });
}

function initSnowfall() {
  const canvas = document.getElementById('snowCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);
  let mouseWind = 0;
  let lastMouseX = width * 0.5;
  let isPageVisible = !document.hidden;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  window.addEventListener('mousemove', (e) => {
    const deltaX = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    mouseWind = Math.max(-1.6, Math.min(1.6, mouseWind + deltaX * 0.012));
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    isPageVisible = !document.hidden;
    if (isPageVisible) requestAnimationFrame(renderSnow);
  });

  const flakes = Array.from({ length: 72 }, (_, idx) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: Math.random() * 2.5 + 0.75,
    speedY: Math.random() * 0.65 + 0.22,
    speedX: (Math.random() - 0.5) * 0.38,
    swayAmp: Math.random() * 0.45 + 0.15,
    swayPhase: Math.random() * Math.PI * 2,
    opacity: Math.random() * 0.55 + 0.25,
    kind: idx % 9 === 0 ? 'goldStar' : (Math.random() > 0.45 ? 'iceBlue' : 'white')
  }));

  function drawFourPointStar(cx, cy, radius, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 1.6);
    ctx.quadraticCurveTo(radius * 0.35, -radius * 0.35, radius * 1.6, 0);
    ctx.quadraticCurveTo(radius * 0.35, radius * 0.35, 0, radius * 1.6);
    ctx.quadraticCurveTo(-radius * 0.35, radius * 0.35, -radius * 1.6, 0);
    ctx.quadraticCurveTo(-radius * 0.35, -radius * 0.35, 0, -radius * 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function renderSnow() {
    if (!isPageVisible) return;
    ctx.clearRect(0, 0, width, height);
    mouseWind *= 0.96;

    flakes.forEach(f => {
      f.swayPhase += 0.018;
      const currentOpacity = f.kind === 'goldStar'
        ? f.opacity * (0.65 + 0.35 * Math.sin(f.swayPhase * 2.2))
        : f.opacity;

      if (f.kind === 'goldStar') {
        drawFourPointStar(f.x, f.y, f.r, `rgba(243, 212, 124, ${currentOpacity.toFixed(3)})`);
      } else {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = f.kind === 'iceBlue'
          ? `rgba(138, 226, 255, ${currentOpacity.toFixed(3)})`
          : `rgba(255, 255, 255, ${currentOpacity.toFixed(3)})`;
        ctx.fill();
      }

      f.y += f.speedY;
      f.x += f.speedX + Math.sin(f.swayPhase) * f.swayAmp + mouseWind * (f.r * 0.25);

      if (f.y > height + 8) {
        f.y = -8;
        f.x = Math.random() * width;
      }
      if (f.x > width + 8) f.x = -8;
      if (f.x < -8) f.x = width + 8;
    });
    requestAnimationFrame(renderSnow);
  }
  renderSnow();
}

updateStageOnScroll();
initVintageFilmCanvas();
initSnowfall();
initAutoPreloadAssets();
initScrollRevealAndGlow();
