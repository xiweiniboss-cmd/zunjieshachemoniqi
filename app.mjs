import { BrakeGame } from './engine.mjs';
import { TrackScene } from './scene.mjs';

const $ = (id) => document.getElementById(id);
const game = new BrakeGame();
const scene = new TrackScene($('scene'));
const elements = Object.fromEntries([
  'game', 'intro', 'result', 'live-message', 'live-eyebrow', 'live-title', 'live-hint',
  'speed', 'speed-status', 'force', 'force-note', 'force-fill', 'force-marker', 'force-meter',
  'reaction', 'elapsed', 'distance', 'best', 'best-unit', 'pause', 'pause-overlay', 'pedal',
  'brake-tip', 'restart', 'result-eyebrow', 'result-title', 'result-time', 'result-copy',
  'gauge-progress', 'gauge-tip', 'gauge-tip-glow', 'sound',
].map(id => [id, $(id)]));
const RUNNING = new Set(['countdown', 'accelerating', 'braking']);
const STORE_KEY = 'redline.local.scores.v1';
let scores = readScores();
let muted = readPreference();
let lastFrame = performance.now();
let lastCountdown = -1;
let readySignaled = false;
let finishedRecorded = false;
let pointerHeld = false;
let activePointerId = null;
let keyboardHeld = false;
let returnToRunning = false;
let forceWarningAt = 0;

function setText(element, text) {
  const next = String(text);
  if (element.textContent !== next) element.textContent = next;
}

function readScores() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(record => record && Number.isFinite(record.time) && record.time > 0 && record.time <= 30
      && Number.isFinite(record.reaction) && record.reaction >= 0
      && Number.isFinite(record.distance) && record.distance >= 0
      && Number.isFinite(record.peakForce) && record.peakForce < 1600
      && Number.isFinite(record.date)).sort((a, b) => a.time - b.time).slice(0, 50);
  } catch { return []; }
}

function readPreference() {
  try { return localStorage.getItem('redline.muted') === 'true'; } catch { return false; }
}

class GameAudio {
  constructor() { this.context = null; }
  unlock() {
    try {
      if (!this.context) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = this.context;
        this.master = ctx.createGain();
        this.master.gain.value = muted ? 0 : 0.35;
        this.master.connect(ctx.destination);
        this.engine = ctx.createOscillator();
        this.engine.type = 'sawtooth';
        this.engineGain = ctx.createGain();
        this.engineGain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 340;
        this.engine.connect(filter).connect(this.engineGain).connect(this.master);
        this.engine.start();
        this.brakes = ctx.createOscillator();
        this.brakes.type = 'triangle';
        this.brakes.frequency.value = 300;
        this.brakeGain = ctx.createGain();
        this.brakeGain.gain.value = 0;
        this.brakes.connect(this.brakeGain).connect(this.master);
        this.brakes.start();
      }
      this.context.resume().catch(() => {});
    } catch { /* The game remains fully playable without audio support. */ }
  }
  setMuted(value) {
    if (this.master) this.master.gain.setTargetAtTime(value ? 0 : 0.35, this.context.currentTime, 0.03);
  }
  update(snapshot) {
    if (!this.context || !this.engine) return;
    const active = ['accelerating', 'braking'].includes(snapshot.phase) && !snapshot.paused;
    const t = this.context.currentTime;
    this.engine.frequency.setTargetAtTime(36 + snapshot.speed * 1.35, t, 0.04);
    this.engineGain.gain.setTargetAtTime(active ? 0.025 + snapshot.speed / 5000 : 0, t, 0.06);
    this.brakes.frequency.setTargetAtTime(140 + snapshot.force / 3, t, 0.06);
    this.brakeGain.gain.setTargetAtTime(active ? snapshot.force / 65000 : 0, t, 0.04);
  }
  beep(frequency = 660, duration = 0.13, delay = 0, type = 'sine') {
    if (!this.context || muted) return;
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
const audio = new GameAudio();

function makeTicks() {
  const ns = 'http://www.w3.org/2000/svg';
  const group = $('gauge-ticks');
  for (let value = 0; value <= 200; value += 10) {
    const angle = (150 + value / 200 * 240) * Math.PI / 180;
    const major = value % 50 === 0;
    const line = document.createElementNS(ns, 'line');
    const r1 = major ? 133 : 140;
    line.setAttribute('x1', 210 + Math.cos(angle) * r1);
    line.setAttribute('y1', 195 + Math.sin(angle) * r1);
    line.setAttribute('x2', 210 + Math.cos(angle) * 147);
    line.setAttribute('y2', 195 + Math.sin(angle) * 147);
    line.setAttribute('stroke', value === 100 ? '#b6f2d0' : '#c6d4c180');
    line.setAttribute('stroke-width', value === 100 ? '2' : '1');
    group.append(line);
    if (major) {
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', 210 + Math.cos(angle) * 166);
      text.setAttribute('y', 199 + Math.sin(angle) * 166);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', value === 100 ? '#b6f2d0' : '#c0cfbf');
      text.setAttribute('font-family', 'Barlow Condensed, sans-serif');
      text.setAttribute('font-size', '13');
      text.textContent = value;
      group.append(text);
    }
  }
}

function advanceTo(now) {
  if (now <= lastFrame) return;
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;
  game.update(dt);
}

function startRun() {
  audio.unlock();
  pointerHeld = false;
  activePointerId = null;
  keyboardHeld = false;
  readySignaled = false;
  finishedRecorded = false;
  lastCountdown = -1;
  game.start();
  lastFrame = performance.now();
  render(game.snapshot);
  elements.game.focus({ preventScroll: true });
}

function applyPedal() {
  advanceTo(performance.now());
  game.setPedal(pointerHeld || keyboardHeld);
  render(game.snapshot);
}

function releaseAll() {
  pointerHeld = false;
  activePointerId = null;
  keyboardHeld = false;
  game.setPedal(false);
}

function pause(value) {
  if (!RUNNING.has(game.phase)) return;
  advanceTo(performance.now());
  releaseAll();
  game.setPaused(value);
  lastFrame = performance.now();
  render(game.snapshot);
  if (!value) elements.game.focus({ preventScroll: true });
}

function toggleMute() {
  muted = !muted;
  audio.unlock();
  audio.setMuted(muted);
  try { localStorage.setItem('redline.muted', String(muted)); } catch {}
  renderMute();
}

function renderMute() {
  elements.sound.setAttribute('aria-label', muted ? '开启声音' : '关闭声音');
  elements.sound.setAttribute('aria-pressed', String(muted));
  elements.sound.innerHTML = muted
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
}

function completeRun(snapshot) {
  if (finishedRecorded) return;
  finishedRecorded = true;
  releaseAll();
  if (snapshot.phase === 'success') {
    const previousBest = scores[0]?.time ?? Infinity;
    const isBest = snapshot.elapsed < previousBest;
    const record = {
      time: snapshot.elapsed, reaction: snapshot.reaction ?? 0, distance: snapshot.distance,
      peakForce: snapshot.peakForce, date: Date.now(),
    };
    scores.push(record);
    scores.sort((a, b) => a.time - b.time);
    scores = scores.slice(0, 50);
    let saved = true;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(scores)); } catch { saved = false; }
    elements['result-eyebrow'].textContent = isBest ? 'PERSONAL BEST / 新的个人纪录' : 'TEST COMPLETE / 测试完成';
    elements['result-title'].textContent = snapshot.elapsed < 4.2 ? '漂亮，稳稳停住。' : '安全刹停，继续突破。';
    elements['result-time'].replaceChildren(document.createTextNode(snapshot.elapsed.toFixed(3)));
    const seconds = document.createElement('span');
    seconds.textContent = 's';
    elements['result-time'].append(seconds);
    elements['result-copy'].textContent = `反应 ${record.reaction.toFixed(3)} s · 峰值力度 ${Math.round(snapshot.peakForce)} N · ${saved ? '成绩已记录' : '本次成绩未能保存'}`;
    audio.beep(523, 0.18);
    audio.beep(659, 0.18, 0.13);
    audio.beep(784, 0.3, 0.26);
  } else {
    const failureMessages = {
      early: ['TOO EARLY / 抢跑了', '太心急了。', '车速还没到 100 km/h。等绿灯亮起，再踩下刹车。'],
      broken: ['OVER THE LIMIT / 踏板断裂', '用力过猛，踩断了。', '力度达到了 1600 N。下次早点松开，再轻踩补力。'],
      timeout: ['TIME OUT / 测试超时', '风景好看，也要刹车。', '30 秒过去了。准备好，绿灯亮起就开始制动。'],
    };
    const [kicker, title, copy] = failureMessages[snapshot.failure] || failureMessages.timeout;
    elements['result-eyebrow'].textContent = kicker;
    elements['result-title'].textContent = title;
    elements['result-copy'].textContent = copy;
    audio.beep(180, 0.3, 0, 'triangle');
  }
  // 上报全网统计 / 实时排行榜（成功与失败都计数）
  try {
    if (window.BrakeNet) {
      const ok = snapshot.phase === 'success';
      window.BrakeNet.report(ok, ok ? Math.round(snapshot.elapsed * 1000) : 0, Math.round((snapshot.reaction ?? 0) * 1000));
    }
  } catch (e) {}
}

function render(snapshot) {
  const { phase, paused, speed, force, pedal } = snapshot;
  const active = RUNNING.has(phase);
  const ended = phase === 'success' || phase === 'failed';
  const ready = phase === 'braking' || (phase === 'accelerating' && speed >= 100);
  const danger = force >= 1400 && !ended;

  if (ended) completeRun(snapshot);
  elements.game.dataset.phase = phase;
  elements.game.dataset.ready = String(ready);
  elements.game.dataset.danger = String(danger);
  elements.game.dataset.pedal = String(pedal);
  elements.intro.hidden = phase !== 'idle';
  elements.result.hidden = !ended;
  elements['live-message'].hidden = !active || paused;
  elements['pause-overlay'].hidden = !paused || !active;
  elements.pause.disabled = !active;
  const pauseLabel = paused ? '继续游戏' : '暂停游戏';
  if (elements.pause.getAttribute('aria-label') !== pauseLabel) {
    elements.pause.setAttribute('aria-label', pauseLabel);
    elements.pause.innerHTML = paused
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 10 7-10 7V5Z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
  }
  elements.restart.hidden = !active;
  elements.pedal.disabled = paused || !['accelerating', 'braking'].includes(phase);
  elements.pedal.setAttribute('aria-pressed', String(pedal));
  // The display must not reach 100 before the actual timing boundary.
  const displaySpeed = phase === 'accelerating' ? Math.floor(speed) : Math.round(speed);
  setText(elements.speed, String(displaySpeed).padStart(3, '0'));
  setText(elements.force, Math.round(force));
  setText(elements.reaction, snapshot.reaction === null ? '—' : snapshot.reaction.toFixed(3));
  setText(elements.elapsed, ended && phase === 'success' ? snapshot.elapsed.toFixed(3) : snapshot.elapsed.toFixed(2));
  setText(elements.distance, snapshot.distance.toFixed(1));
  setText(elements.best, scores.length ? scores[0].time.toFixed(3) : '—');
  setText(elements['best-unit'], scores.length ? 's' : '');
  const percentage = Math.min(100, force / 1600 * 100);
  elements['force-fill'].style.height = `${percentage}%`;
  elements['force-marker'].style.bottom = `${percentage}%`;
  elements['force-meter'].setAttribute('aria-valuenow', Math.round(force));
  setText(elements['force-note'], danger ? '危险！快松开' : ended && phase === 'failed' && snapshot.failure === 'broken' ? '踏板已断裂' : '力度越大，刹停越快');
  setText(elements['brake-tip'], danger ? '松开！给踏板一点余地' : pedal ? '保持力度，注意红线' : '轻踩 · 抬起 · 再踩');

  const angle = (150 + Math.min(speed, 200) / 200 * 240) * Math.PI / 180;
  const tipX = 210 + Math.cos(angle) * 150;
  const tipY = 195 + Math.sin(angle) * 150;
  for (const tip of [elements['gauge-tip'], elements['gauge-tip-glow']]) {
    tip.setAttribute('cx', tipX); tip.setAttribute('cy', tipY);
    tip.setAttribute('fill', ready ? '#b6f2d0' : '#ff986e');
  }
  elements['gauge-progress'].style.strokeDashoffset = 628.3 * (1 - Math.min(speed, 200) / 200);
  elements['gauge-progress'].style.stroke = ready ? 'var(--mint)' : 'var(--orange)';
  let status = '准备就绪';
  if (phase === 'countdown') {
    const number = Math.ceil(snapshot.countdown);
    status = '即将发车';
    setText(elements['live-eyebrow'], 'READY TO GO / 准备发车');
    setText(elements['live-title'], number);
    setText(elements['live-hint'], '放轻松，先别踩刹车');
    if (number !== lastCountdown) { audio.beep(number === 1 ? 880 : 660, 0.12); lastCountdown = number; }
  } else if (phase === 'accelerating') {
    status = ready ? '开始计时 · 踩下刹车' : '正在加速';
    setText(elements['live-eyebrow'], ready ? 'BRAKE NOW / 100 KM/H' : 'BUILDING SPEED / 自动加速');
    setText(elements['live-title'], ready ? '现在，踩刹车！' : '等待 100');
    setText(elements['live-hint'], ready ? '按住加力，松开减力。别越过红线。' : '提前踩下会失败，准备好你的反应');
  } else if (phase === 'braking') {
    status = danger ? '危险 · 快松开' : pedal ? '制动中 · 持续加力' : '制动中 · 力度回落';
    setText(elements['live-eyebrow'], 'STAY IN CONTROL / 控制力度');
    setText(elements['live-title'], danger ? '松开，别踩断！' : '稳住，快到极限。');
    setText(elements['live-hint'], '保持高力度，轻踩和抬起交替');
  } else if (phase === 'success') status = '测试完成 · 安全刹停';
  else if (phase === 'failed') status = snapshot.failure === 'broken' ? '测试失败 · 踏板断裂' : snapshot.failure === 'early' ? '测试失败 · 提前刹车' : '测试超时';
  if (paused) status = '测试暂停';
  // Reuse the status node instead of repeatedly adding live region announcements.
  if (elements['speed-status'].lastChild.textContent !== status) elements['speed-status'].lastChild.textContent = status;
  if (ready && !readySignaled) {
    audio.beep(1046, 0.17); audio.beep(1318, 0.18, 0.13);
    readySignaled = true;
  }
  if (danger && !paused && performance.now() - forceWarningAt > 550) {
    audio.beep(360, 0.08, 0, 'triangle'); forceWarningAt = performance.now();
  }
  audio.update(snapshot);
}

function renderRecords() {
  const list = $('records-list');
  list.replaceChildren();
  const loading = document.createElement('li');
  loading.className = 'empty-records';
  loading.textContent = '正在加载全网排行…';
  list.append(loading);
  const done = (board) => {
    list.replaceChildren();
    if (!board || !board.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-records';
      const icon = document.createElement('b'); icon.textContent = '—';
      empty.append(icon, document.createTextNode(board ? '还没有人上榜，来做第一个！' : '加载失败，检查网络后重试。'));
      list.append(empty);
      return;
    }
    const myDevice = window.BrakeNet ? window.BrakeNet.device() : '';
    board.forEach((entry, index) => {
      const row = document.createElement('li'); row.className = 'record-row';
      const rank = document.createElement('span'); rank.className = 'record-rank'; rank.textContent = String(index + 1).padStart(2, '0');
      const who = document.createElement('span'); who.className = 'record-date';
      who.textContent = entry.n + (entry.d && entry.d === myDevice ? '（你）' : '');
      const time = document.createElement('span'); time.className = 'record-score'; time.textContent = (entry.ms / 1000).toFixed(3);
      const unit = document.createElement('small'); unit.textContent = 's'; time.append(unit);
      row.append(rank, who, time); list.append(row);
    });
  };
  if (window.BrakeNet) {
    window.BrakeNet.getBoard().then(done).catch(() => done(null));
  } else {
    done(null);
  }
}

function openDialog(id) {
  if ($('records-dialog').open || $('help-dialog').open) return;
  returnToRunning = RUNNING.has(game.phase) && !game.paused;
  if (returnToRunning) pause(true);
  if (id === 'records-dialog') renderRecords();
  $(id).showModal();
}

function dialogClosed() {
  if (returnToRunning) pause(false);
  returnToRunning = false;
}

$('start').addEventListener('click', startRun);
$('retry').addEventListener('click', startRun);
$('restart').addEventListener('click', startRun);
$('pause-restart').addEventListener('click', startRun);
$('pause').addEventListener('click', () => pause(!game.paused));
$('resume').addEventListener('click', () => pause(false));
$('sound').addEventListener('click', toggleMute);
for (const id of ['records-open', 'result-records']) $(id).addEventListener('click', () => openDialog('records-dialog'));
$('help-open').addEventListener('click', () => openDialog('help-dialog'));
$('records-close').addEventListener('click', () => $('records-dialog').close());
for (const id of ['help-close', 'help-done']) $(id).addEventListener('click', () => $('help-dialog').close());
for (const id of ['records-dialog', 'help-dialog']) {
  $(id).addEventListener('close', dialogClosed);
  $(id).addEventListener('click', event => {
    const rect = $(id).getBoundingClientRect();
    if (event.target === $(id) && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) $(id).close();
  });
}

elements.pedal.addEventListener('pointerdown', event => {
  if (event.button !== 0 || elements.pedal.disabled || activePointerId !== null) return;
  event.preventDefault();
  elements.pedal.setPointerCapture(event.pointerId);
  activePointerId = event.pointerId;
  pointerHeld = true;
  audio.unlock();
  applyPedal();
});
function releasePointer(event) {
  if (!pointerHeld || event.pointerId !== activePointerId) return;
  pointerHeld = false;
  activePointerId = null;
  applyPedal();
}
elements.pedal.addEventListener('pointerup', releasePointer);
elements.pedal.addEventListener('pointercancel', releasePointer);
elements.pedal.addEventListener('lostpointercapture', releasePointer);
elements.pedal.addEventListener('contextmenu', event => event.preventDefault());

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('dialog')) return;
  if (event.code === 'Space') {
    const control = event.target.closest('button,a,input,select,textarea,[contenteditable]');
    if (control && control !== elements.pedal) return;
    event.preventDefault();
    if (event.repeat) return;
    if (game.phase === 'idle' || game.phase === 'success' || game.phase === 'failed') startRun();
    else if (!game.paused && ['accelerating', 'braking'].includes(game.phase)) {
      keyboardHeld = true; audio.unlock(); applyPedal();
    }
  } else if (event.code === 'KeyR' && !event.repeat) startRun();
  else if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) pause(!game.paused);
  else if (event.code === 'KeyM' && !event.repeat) toggleMute();
});
document.addEventListener('keyup', event => {
  if (event.code === 'Space' && keyboardHeld) { event.preventDefault(); keyboardHeld = false; applyPedal(); }
});
window.addEventListener('blur', () => { if (RUNNING.has(game.phase)) pause(true); else releaseAll(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && RUNNING.has(game.phase)) pause(true); });
window.addEventListener('resize', () => scene.resize());

function frame(now) {
  advanceTo(now);
  const snapshot = game.snapshot;
  render(snapshot);
  scene.render(snapshot, now / 1000);
  requestAnimationFrame(frame);
}
makeTicks();
renderMute();
render(game.snapshot);
requestAnimationFrame(frame);
