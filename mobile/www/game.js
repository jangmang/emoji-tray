// ── 사운드 매니저 ──────────────────────────────────────
const SND = {
  muted: false,
  bgm:        new Audio('sounds/bgm.ogg'),
  start:      new Audio('sounds/start.ogg'),
  put:        new Audio('sounds/put.ogg'),
  item:       new Audio('sounds/item.ogg'),
  goldentime: new Audio('sounds/goldentime.ogg'),
  levelup:    new Audio('sounds/levelup.ogg'),
  drop:       new Audio('sounds/drop.ogg'),
  winner:     new Audio('sounds/winner.ogg'),
  end:        new Audio('sounds/end.ogg'),
};
SND.bgm.loop = true;
SND.bgm.volume = 0.5;
SND.goldentime.loop = true;

function playSFX(key) {
  if(SND.muted) return;
  const a = SND[key];
  if(!a) return;
  a.currentTime = 0;
  a.play().catch(()=>{});
}
function playBGM() {
  if(SND.muted) return;
  SND.bgm.currentTime = 0;
  SND.bgm.play().catch(()=>{});
}
function stopBGM() { SND.bgm.pause(); SND.bgm.currentTime = 0; }
function pauseBGM() { SND.bgm.pause(); }
function resumeBGM() { if(!SND.muted) SND.bgm.play().catch(()=>{}); }
function playGoldenBGM() {
  if(SND.muted) return;
  SND.goldentime.currentTime = 0;
  SND.goldentime.play().catch(()=>{});
}
function stopGoldenBGM() { SND.goldentime.pause(); SND.goldentime.currentTime = 0; }

function confirmGoHome() {
  if (confirm('처음으로 돌아가시겠습니까? 진행내용이 사라집니다.')) {
    window.location.reload();
  }
}

// 음소거 토글
const muteBtn = document.getElementById('muteBtn');
muteBtn.addEventListener('click', () => {
  SND.muted = !SND.muted;
  muteBtn.innerHTML = SND.muted ? '<img src="./icon_mute.svg" alt="음소거">' : '<img src="./icon_sound.svg" alt="사운드">';
  if(SND.muted) {
    SND.bgm.pause();
    SND.goldentime.pause();
  } else {
    // 게임 진행 중이면 적절한 BGM 재개
    if(running && goldenTime) SND.goldentime.play().catch(()=>{});
    else if(running) SND.bgm.play().catch(()=>{});
  }
});

// 앱 비활성/활성 시 게임 일시정지/재개
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // ── 일시정지 ──
    SND.bgm.pause();
    SND.goldentime.pause();
    if (!running) return;
    paused = true;
    cancelAnimationFrame(rafId);

    const now = performance.now();
    _pauseData = { dropElapsed: now - lastDropTime };

    // frozenTimer 남은 시간 저장
    if (frozenTimer) {
      _pauseData.frozenRemain = Math.max(0, ICE_DURATION - (now - frozenStart));
      clearTimeout(frozenTimer); frozenTimer = null;
    }
    // goldenTimer 남은 시간 저장
    if (goldenTimer) {
      _pauseData.goldenRemain = Math.max(0, GOLDEN_DURATION - (now - goldenStart));
      clearTimeout(goldenTimer); goldenTimer = null;
    }
    // criticalTimer 남은 시간 저장
    if (criticalTimer) {
      _pauseData.criticalRemain = Math.max(0, CRITICAL_DURATIONS[criticalZone] - (now - criticalStart));
      _pauseData.criticalZone = criticalZone;
      clearTimeout(criticalTimer); criticalTimer = null;
    }
    // 카운트다운 interval 정지
    if (_lcInterval) { clearInterval(_lcInterval); _pauseData.lcPaused = true; }
    if (_gcInterval) { clearInterval(_gcInterval); _pauseData.gcPaused = true; }
  } else {
    // ── 재개 ──
    if (!running || !paused) return;
    paused = false;
    const pd = _pauseData || {};

    // 자동드롭 타이머 보정
    lastDropTime = performance.now() - (pd.dropElapsed || 0);

    // frozenTimer 복원
    if (pd.frozenRemain > 0) {
      frozenStart = performance.now();
      frozenTimer = setTimeout(() => {
        frozen = false; frozenTimer = null;
        document.getElementById('frostOverlay').classList.remove('active');
        clearFrostFlakes();
      }, pd.frozenRemain);
    }
    // goldenTimer 복원
    if (pd.goldenRemain > 0) {
      goldenStart = performance.now();
      goldenTimer = setTimeout(() => { endGoldenTime(); }, pd.goldenRemain);
    }
    // criticalTimer 복원
    if (pd.criticalRemain > 0) {
      criticalZone = pd.criticalZone || 1;
      criticalStart = performance.now();
      criticalTimer = setTimeout(() => { criticalZone=0; criticalTimer=null; gameOver(); }, pd.criticalRemain);
    }
    // 카운트다운 interval은 짧은 전환이므로 남은 시간 그대로 재시작
    // (레벨클리어/골든카운트다운은 running=false 상태이므로 대부분 해당 없음)

    _pauseData = null;

    // 사운드 재개
    if (!SND.muted) {
      if (goldenTime) SND.goldentime.play().catch(()=>{});
      else SND.bgm.play().catch(()=>{});
    }

    // 게임 루프 재시작
    loop();
  }
});

// ── 미션 시스템 ─────────────────────────────────────────
const MISSION_DEFS = [
  { id:'shrink',  icon:'🤏', desc:'이모지 크기 줄임' },
  { id:'score',   icon:'💰', desc:'점수 ×2 획득' },
  { id:'nodrop',  icon:'🕝', desc:'자동드롭 비활성' },
];

// ── 이모지 데이터 ──────────────────────────────────────
const EMOJI_DATA = [
  // 100점 (w:0.1) - 가볍지만 고점수 2개
  {e:'🪙',w:0.1,pts:100},{e:'💰',w:0.1,pts:100},
  // 1점 (w:0.1) - 깃털 4개
  {e:'🦋',w:0.1},{e:'🌈',w:0.1},{e:'💫',w:0.1},{e:'🌸',w:0.1},
  // 5점 (w:0.5) - 가벼운 7개
  {e:'🍒',w:0.5},{e:'🍓',w:0.5},{e:'🔥',w:0.5},
  {e:'🍪',w:0.5},{e:'🍦',w:0.5},{e:'🥝',w:0.5},{e:'🍄',w:0.5},
  // 10점 (w:1.0) - 보통 14개
  {e:'🍎',w:1.0},{e:'🍊',w:1.0},{e:'🍋',w:1.0},{e:'🍑',w:1.0},
  {e:'🍣',w:1.0},{e:'🧁',w:1.0},{e:'🎲',w:1.0},{e:'🌵',w:1.0},
  {e:'🍩',w:1.0},{e:'🎯',w:1.0},{e:'🪄',w:1.0},{e:'🌮',w:1.0},
  {e:'🍇',w:1.0},{e:'🐸',w:1.0},
  // 20점 (w:2.0) - 무거운 9개
  {e:'🍕',w:2.0},{e:'🏀',w:2.0},{e:'🥭',w:2.0},
  {e:'🍔',w:2.0},{e:'🍜',w:2.0},{e:'🧸',w:2.0},{e:'🍍',w:2.0},
  {e:'🦊',w:2.0},{e:'👑',w:2.0},
  // 30점 (w:3.0) - 아주무거운 7개
  {e:'🎸',w:3.0},{e:'🦄',w:3.0},{e:'🎂',w:3.0},
  {e:'🛸',w:3.0},{e:'🏆',w:3.0},{e:'🎁',w:3.0},{e:'🐧',w:3.0},
  // 50점 (w:5.0) - 초무거운 4개
  {e:'💎',w:5.0},{e:'🚀',w:5.0},{e:'🦁',w:5.0},{e:'🐳',w:5.0},
];
const GIANT_EMOJI = [
  {e:'🐘',w:10},{e:'🦛',w:10},{e:'🗿',w:10},{e:'⚓',w:10},
  {e:'🧱',w:10},{e:'🛢️',w:10},{e:'🪨',w:10},{e:'🏋️',w:10},
];
// 특수 이모지 (모든 레벨에서 등장, 15% 확률)
const SPECIAL_EMOJI = [
  {e:'💣',w:0}, // 폭탄: 전체 제거 (리셋)
  {e:'🧊',w:0}, // 얼음: 기울기 동결 (방어)
  {e:'🧲',w:0}, // 자석: 주변 끌어당기기
  {e:'⭐',w:0}, // 별: 골든타임 (쟁반 위 이모지를 별로 변환, 클릭하면 10점)
];
const SPECIAL_RATE = 0.15;
// 랜덤박스
const MYSTERY_EMOJI = {e:'❓', w:0, special:true, mystery:true};
const MYSTERY_RATE = 0.08;

// ── 쟁반 SVG 좌표계 상수 ───────────────────────────────
// SVG viewBox: 35 45 490 330
// 쟁반 타원 중심: (280, 172), rx=228, ry=108
const VB_X = 35, VB_Y = 45, SVG_W = 490, SVG_H = 330;
const TRAY_CX = 280, TRAY_CY = 172; // 타원 중심
const TRAY_RX = 222, TRAY_RY = 102; // 이모지 배치 가능 반경 (테두리 안쪽)

const DANGER_WARN = 0.65;

// ── 레벨 시스템 ─────────────────────────────────────────
const LEVELS = [
  { goal:100,   autoDrop:10000, floorCount:10, tiltLimit:46, maxWeight:1.0, giantRate:0    },
  { goal:500,   autoDrop:10000, floorCount:10, tiltLimit:38, maxWeight:2.0, giantRate:0    },
  { goal:1000,  autoDrop:10000, floorCount:10, tiltLimit:32, maxWeight:3.0, giantRate:0.05 },
  { goal:5000,  autoDrop:5000,  floorCount:10, tiltLimit:32, maxWeight:5.0, giantRate:0.10 },
  { goal:10000, autoDrop:5000,  floorCount:10, tiltLimit:30, maxWeight:7.0, giantRate:0.12 },
  { goal:Infinity, autoDrop:5000, floorCount:10, tiltLimit:28, maxWeight:10,  giantRate:0.15 },
];
let level = 1;
let TILT_LIMIT = 46, FLOOR_COUNT = 10, AUTO_DROP_DELAY = 10000;
let currentGoal = 100, currentMaxWeight = 1.0, currentGiantRate = 0;

function applyLevel(lv) {
  const cfg = LEVELS[lv - 1];
  TILT_LIMIT = cfg.tiltLimit;
  FLOOR_COUNT = cfg.floorCount;
  AUTO_DROP_DELAY = cfg.autoDrop;
  currentGoal = cfg.goal;
  currentMaxWeight = cfg.maxWeight;
  currentGiantRate = cfg.giantRate;
}

// ── 상태 ───────────────────────────────────────────────
let levelMissions = []; // [{emoji, missionId, count, done}]
let currentMissionIndex = 0;
let missionEffects = { sizeScale:1.0, scoreMulti:1, noAutoDrop:false };
let itemCounts = { shuffle:3, clean:3 };
let items=[], tiltX=0, tiltY=0, running=false, rafId=null, shakeTimer=0;
let frozen=false, frozenTimer=null;
let goldenTime=false, goldenTimer=null;
// criticalZone: 0=안전 1=90~95% 2=95~99% 3=100%+
let criticalZone=0, criticalTimer=null, criticalStart=0;
const CRITICAL_DURATIONS = [0, 5000, 3000, 1500];
let score=0, best = parseInt(localStorage.getItem('trayBest5')||'0');
let floorItems=[], nextId=0, dragging=null;

// ── 일시정지 상태 ──────────────────────────────────────
let paused = false;
let _pauseData = null; // { frozenRemain, goldenRemain, lcRemain, gcRemain, ... }

function toPoints(w){ return Math.round(w * 10 * missionEffects.scoreMulti); }

// ── Firestore 랭킹 헬퍼 ─────────────────────────────────
async function loadLeaderboard() {
  try {
    const fb = window._fb; if(!fb) return [];
    const q = fb.query(fb.collection(fb.db,'rankings'), fb.orderBy('score','desc'), fb.limit(10));
    const snap = await fb.getDocs(q);
    const list = [];
    snap.forEach(doc => list.push(doc.data()));
    return list;
  } catch(e) { console.warn('랭킹 로드 실패:', e); return []; }
}
async function saveScore(name, sc) {
  try {
    const fb = window._fb; if(!fb) return;
    await fb.addDoc(fb.collection(fb.db,'rankings'), {
      name: name, score: sc, date: new Date().toISOString()
    });
  } catch(e) { console.warn('점수 저장 실패:', e); }
}
async function isTopTen(sc) {
  const board = await loadLeaderboard();
  if(board.length < 10) return true;
  return sc > board[board.length - 1].score;
}
function renderLeaderboard(board, myScore, myName) {
  const container = document.getElementById('goLbList');
  container.innerHTML = '';
  if(board.length === 0) {
    container.innerHTML = '<div class="go-lb-empty">아직 기록이 없습니다</div>';
    return;
  }
  const table = document.createElement('table');
  table.className = 'go-lb-table';
  table.innerHTML = '<thead><tr><th>순위</th><th>닉네임</th><th>점수</th></tr></thead>';
  const tbody = document.createElement('tbody');
  board.forEach((entry, i) => {
    const tr = document.createElement('tr');
    const isMe = entry.name === myName && entry.score === myScore;
    if(isMe) tr.className = 'me';
    const rankClass = i===0?' gold':i===1?' silver':i===2?' bronze':'';
    const medal = i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':'';
    tr.innerHTML = `<td class="go-lb-rank${rankClass}">${medal}${i+1}</td>`
      + `<td class="go-lb-name">${entry.name}</td>`
      + `<td class="go-lb-score">${entry.score}점</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

// ── 미션 함수들 ─────────────────────────────────────────
function initLevelMissions() {
  const pool = EMOJI_DATA.filter(d => !d.pts && d.w <= 1.0).map(d => d.e);
  const shuffled = [...MISSION_DEFS].sort(() => Math.random() - 0.5);
  const usedEmojis = [];
  levelMissions = shuffled.map(def => {
    // 미션마다 서로 다른 이모지 3개 뽑기 (전체 미션 간 중복도 없앰)
    const emojis = [];
    while(emojis.length < 3) {
      const e = pool[Math.floor(Math.random() * pool.length)];
      if(!emojis.includes(e) && !usedEmojis.includes(e)) emojis.push(e);
    }
    usedEmojis.push(...emojis);
    return { emojis, missionId: def.id, collected: [false, false, false], done: false };
  });
  currentMissionIndex = 0;
  updateMissionUI();
}

function trackMissionEmoji(emoji) {
  if(currentMissionIndex >= levelMissions.length) return;
  const m = levelMissions[currentMissionIndex];
  if(m.done) return;
  const idx = m.emojis.findIndex((e, i) => e === emoji && !m.collected[i]);
  if(idx === -1) return;
  m.collected[idx] = true;
  updateMissionUI(true);
  if(m.collected.every(c => c)) applyMissionEffect(m.missionId);
}

function applyMissionEffect(missionId) {
  const m = levelMissions[currentMissionIndex];
  if(m) m.done = true;
  if(missionId === 'shrink') {
    missionEffects.sizeScale = Math.max(0.25, missionEffects.sizeScale * 0.5);
  } else if(missionId === 'score') {
    missionEffects.scoreMulti = Math.min(3, missionEffects.scoreMulti + 1);
  } else if(missionId === 'nodrop') {
    missionEffects.noAutoDrop = true;
  }
  showMissionToast(missionId);

  // 3개 채워진 상태를 1.5초간 보여준 후 다음 미션으로 전환
  const wrap = document.querySelector('.mission-wrap');
  if(wrap) wrap.classList.add('m-clear');
  setTimeout(() => {
    if(wrap) wrap.classList.remove('m-clear');
    addMissionDoneBadge(missionId);
    currentMissionIndex++;
    updateMissionUI();
  }, 1500);
}

function addMissionDoneBadge(missionId) {
  const list = document.getElementById('missionDoneList');
  if(!list) return;
  const def = MISSION_DEFS.find(d => d.id === missionId);
  if(!def) return;
  const item = document.createElement('div');
  item.className = 'mdb-item';
  item.innerHTML = `<span class="mdb-check">✔️</span><span class="mdb-text">${def.desc}</span>`;
  list.appendChild(item);
}

function showMissionToast(missionId) {
  const lines = {
    shrink: { icon:'🤏', title:'미션 달성!', desc:'이모지 크기 줄임' },
    score:  { icon:'💰', title:'미션 달성!', desc:`점수 ${missionEffects.scoreMulti}배 적용` },
    nodrop: { icon:'🕝', title:'미션 달성!', desc:'자동드롭 비활성화' },
  };
  const { icon, title, desc } = lines[missionId];
  const el = document.createElement('div');
  el.className = 'mission-toast';
  el.innerHTML = `<div class="mt-icon">${icon}</div><div class="mt-title">${title}</div><div class="mt-desc">${desc}</div>`;
  document.body.appendChild(el);
  // 팝업 표시 동안 게임 일시정지
  running = false;
  setTimeout(() => {
    el.remove();
    running = true;
    loop();
  }, 3000);
}

function updateMissionBadges() {
  const m = currentMissionIndex < levelMissions.length ? levelMissions[currentMissionIndex] : null;
  const targets = m ? m.emojis.filter((_, i) => !m.collected[i]) : [];
  floorItems.forEach(fi => {
    fi.el.querySelector('.m-badge')?.remove();
    if(targets.includes(fi.e)) {
      const mb = document.createElement('span');
      mb.className = 'm-badge';
      mb.textContent = 'M';
      fi.el.appendChild(mb);
    }
  });
}

function updateMissionUI(pop = false) {
  const panel = document.getElementById('missionPanel');
  if(!panel) return;

  if(currentMissionIndex >= levelMissions.length) {
    panel.innerHTML = '<div class="m-complete">🎉</div>';
    return;
  }

  const m = levelMissions[currentMissionIndex];
  const def = MISSION_DEFS.find(d => d.id === m.missionId);

  let slotsHtml = '';
  for(let i = 0; i < 3; i++) {
    if(i > 0) slotsHtml += '<span class="m-slot-sep">+</span>';
    slotsHtml += m.collected[i]
      ? `<div class="m-slot filled" data-slot="${i}">${m.emojis[i]}</div>`
      : `<div class="m-slot empty" data-slot="${i}"><span class="m-slot-ph">${m.emojis[i]}</span></div>`;
  }

  panel.innerHTML = `
    <div class="m-slots">${slotsHtml}</div>
    <div class="m-effect-desc">${def.desc}</div>`;

  if(pop) {
    requestAnimationFrame(() => {
      const lastIdx = m.collected.lastIndexOf(true);
      const slot = panel.querySelector(`.m-slot[data-slot="${lastIdx}"]`);
      if(slot) { slot.classList.remove('pop'); void slot.offsetWidth; slot.classList.add('pop'); }
    });
  }
  updateMissionBadges();
}

// ── 축하 컨페티 ──────────────────────────────────────────
function spawnConfetti() {
  const colors = ['#FFD700','#FF6B6B','#4ECDC4','#45B7D1','#F4A535','#E84040','#40C870','#FF9FF3','#FFF'];
  const shapes = ['square','circle','rect'];
  const count = 60;
  for(let i=0; i<count; i++){
    const el = document.createElement('div');
    el.className = 'confetti';
    const color = colors[Math.floor(Math.random()*colors.length)];
    const shape = shapes[Math.floor(Math.random()*shapes.length)];
    const size = 6 + Math.random()*8;
    const left = Math.random()*100;
    const dur = 2 + Math.random()*2;
    const delay = Math.random()*1.2;
    const spin = 360 + Math.random()*720;
    const fallDist = window.innerHeight + 50;

    el.style.cssText = `
      left:${left}vw;
      width:${shape==='rect'?size*2.5:size}px;
      height:${size}px;
      background:${color};
      border-radius:${shape==='circle'?'50%':'2px'};
      --fall-dur:${dur}s;
      --fall-dist:${fallDist}px;
      --spin:${spin}deg;
      animation-delay:${delay}s;
      opacity:0;
    `;
    document.body.appendChild(el);
    setTimeout(()=> el.remove(), (dur+delay)*1000 + 100);
  }
}

let lastDropTime=0;

const scene        = document.getElementById('scene');
const trayGroup    = document.getElementById('trayGroup');
const dropZone     = document.getElementById('dropZone');
const dropHighlight= document.getElementById('dropHighlight');
const floorShelf   = document.getElementById('floorShelf');
const ghost        = document.getElementById('dragGhost');
const startOverlay = document.getElementById('startOverlay');
const goOverlay    = document.getElementById('gameoverOverlay');
const canvas       = document.getElementById('emojiCanvas');
const ctx          = canvas.getContext('2d');
const countdownTimer = document.getElementById('countdownTimer');
const countdownRing  = document.getElementById('countdownRing');
const countdownText  = document.getElementById('countdownText');
const RING_CIRCUM    = 2 * Math.PI * 18; // ≈113.1

document.getElementById('bestVal').textContent = best;
document.getElementById('goBest').textContent  = best;

// ── 캔버스 크기 = scene 크기 ──────────────────────────
function syncCanvas() {
  const r = scene.getBoundingClientRect();
  canvas.width  = r.width;
  canvas.height = r.height;
}

// SVG 좌표 → 씬 픽셀 좌표 변환
function svgToScene(sx, sy) {
  const r = scene.getBoundingClientRect();
  return {
    x: (sx - VB_X) / SVG_W * r.width,
    y: (sy - VB_Y) / SVG_H * r.height,
  };
}

// 씬 픽셀 → SVG 좌표
function sceneToSvg(px, py) {
  const r = scene.getBoundingClientRect();
  return {
    x: px / r.width  * SVG_W + VB_X,
    y: py / r.height * SVG_H + VB_Y,
  };
}

// 클라이언트 좌표 → SVG 좌표
function clientToSvg(cx, cy) {
  const r = scene.getBoundingClientRect();
  return {
    x: (cx - r.left) / r.width  * SVG_W + VB_X,
    y: (cy - r.top)  / r.height * SVG_H + VB_Y,
  };
}

// 쟁반 위인지 (SVG 좌표 기준)
function isOnTray(sx, sy) {
  const dx = (sx - TRAY_CX) / TRAY_RX;
  const dy = (sy - TRAY_CY) / TRAY_RY;
  return dx*dx + dy*dy <= 1;
}

// ── 이모지 폰트 크기 (무게 비례) ──────────────────────
function emojiSize(w) {
  const sceneW = scene.getBoundingClientRect().width;
  const base = sceneW * 0.068; // 기본 크기
  const effectiveW = Math.max(w, 0.1); // 무게 0도 1점(0.1) 크기로
  const t = Math.sqrt((Math.min(effectiveW,10) - 0.1) / 9.9); // 0~1
  return Math.round(base * (1 + t * 3.5) * missionEffects.sizeScale);
}

// ── 창고 이모지 ────────────────────────────────────────
function randED() {
  if(currentGiantRate > 0 && Math.random() < currentGiantRate) {
    return GIANT_EMOJI[Math.floor(Math.random()*GIANT_EMOJI.length)];
  }
  if(Math.random() < MYSTERY_RATE) {
    return {...MYSTERY_EMOJI};
  }
  if(Math.random() < SPECIAL_RATE) {
    const pool = SPECIAL_EMOJI.filter(s => s.e !== '⭐' || level >= 3);
    if(pool.length > 0) {
      const sp = pool[Math.floor(Math.random()*pool.length)];
      return {...sp, special:true};
    }
  }
  const pool = EMOJI_DATA.filter(d => d.w <= currentMaxWeight);
  return pool[Math.floor(Math.random()*pool.length)];
}

function addFloorItem() {
  // 미수집 미션 이모지 목록
  const curM = currentMissionIndex < levelMissions.length ? levelMissions[currentMissionIndex] : null;
  const targets = curM ? curM.emojis.filter((_, i) => !curM.collected[i]) : [];
  let d;
  // 15% 확률로 미수집 미션 이모지 강제 등장 (창고에 미션 이모지 없을 때만)
  const missionAlreadyInShelf = targets.some(e => floorItems.some(f => f.e === e));
  if(targets.length > 0 && !missionAlreadyInShelf && Math.random() < 0.15) {
    const pick = targets[Math.floor(Math.random() * targets.length)];
    const mData = EMOJI_DATA.find(ed => ed.e === pick);
    if(mData) d = mData;
  }
  if(!d) d = randED();
  // 같은 이모지 중복 없음 (최대 10회 재시도)
  for(let retry = 0; retry < 10; retry++) {
    const count = floorItems.filter(f => f.e === d.e).length;
    if(count < 1) break;
    d = randED();
  }
  const id = nextId++;
  const el = document.createElement('div');
  el.className = 'e-chip' + (d.w>=10?' giant':'') + (d.special?' special':'') + (d.mystery?' mystery':'') + (d.e==='⭐'?' star':'') + (d.pts?' coin':'');
  el.dataset.id = id;
  const emojiSpan = document.createTextNode(d.e);
  el.appendChild(emojiSpan);
  const badge = document.createElement('span');
  badge.className = 'pts';
  badge.textContent = d.mystery ? '?' : (d.special ? '★' : (d.pts || Math.round(d.w * 10)));
  el.appendChild(badge);
  // 미션 이모지면 M 뱃지 표시
  if(targets.includes(d.e)) {
    const mb = document.createElement('span');
    mb.className = 'm-badge';
    mb.textContent = 'M';
    el.appendChild(mb);
  }
  el.addEventListener('mousedown',  ev => startDrag(ev, d, el));
  el.addEventListener('touchstart', ev => startDragTouch(ev, d, el), {passive:false});
  floorShelf.appendChild(el);
  floorItems.push({...d, id, el});
}
function removeFloorItem(el) {
  const i = floorItems.findIndex(f=>f.el===el);
  if(i!==-1) floorItems.splice(i,1);
  el.remove(); addFloorItem();
}
function initFloor() {
  floorShelf.innerHTML=''; floorItems=[];
  for(let i=0;i<FLOOR_COUNT;i++) addFloorItem();
}

// ── 아이템 버튼 ────────────────────────────────────────
function updateItemBtns() {
  const sc = document.getElementById('shuffleCount');
  const cc = document.getElementById('cleanCount');
  const bs = document.getElementById('btnShuffle');
  const bc = document.getElementById('btnClean');
  if(sc) sc.textContent = itemCounts.shuffle;
  if(cc) cc.textContent = itemCounts.clean;
  if(bs) { bs.disabled = itemCounts.shuffle <= 0; bs.style.display = itemCounts.shuffle <= 0 ? 'none' : ''; }
  if(bc) { bc.disabled = itemCounts.clean <= 0;   bc.style.display = itemCounts.clean <= 0   ? 'none' : ''; }
}

let _itemLock = false;

function useItemShuffle() {
  if(_itemLock || !running || itemCounts.shuffle <= 0) return;
  _itemLock = true;
  itemCounts.shuffle--;
  updateItemBtns();
  floorShelf.classList.add('shelf-flash');
  floorShelf.addEventListener('animationend', () => {
    floorShelf.classList.remove('shelf-flash');
    floorShelf.innerHTML=''; floorItems=[];
    for(let i=0;i<FLOOR_COUNT;i++) {
      addFloorItem();
      // 각 이모지 칩에 팝 등장 딜레이 적용
      const el = floorItems[floorItems.length - 1].el;
      el.style.setProperty('--pop-delay', `${i * 40}ms`);
      el.classList.add('item-pop-in');
      el.addEventListener('animationend', () => el.classList.remove('item-pop-in'), {once:true});
    }
    _itemLock = false;
  }, {once:true});
}

function useItemClean() {
  if(_itemLock || !running || itemCounts.clean <= 0 || items.length === 0) return;
  _itemLock = true;
  itemCounts.clean--;
  updateItemBtns();
  if(criticalTimer) { clearTimeout(criticalTimer); criticalTimer = null; }
  criticalZone = 0;
  document.getElementById('vignetteOverlay').style.opacity = '0';

  const sceneWrap = document.querySelector('.scene-wrap');
  const sweep = document.createElement('div');
  sweep.className = 'sweep-motion';
  sweep.textContent = '🧹';
  sceneWrap.appendChild(sweep);

  const dustInterval = setInterval(() => {
    const count = 2 + Math.floor(Math.random() * 2);
    for(let i = 0; i < count; i++) {
      const dust = document.createElement('div');
      dust.className = 'sweep-dust';
      dust.textContent = '☁️';
      const pct = 25 + Math.random() * 50;
      const top = 15 + Math.random() * 30;
      dust.style.cssText = `left:${pct}%;top:${top}%;--dx:${(Math.random()-0.5)*40}px;--dy:${-(15+Math.random()*20)}px;`;
      sceneWrap.appendChild(dust);
      dust.addEventListener('animationend', () => dust.remove(), {once:true});
    }
  }, 150);

  sweep.addEventListener('animationend', () => {
    sweep.remove();
    clearInterval(dustInterval);
    items = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    _itemLock = false;
  }, {once:true});
}

// ── 드래그 ─────────────────────────────────────────────
function startDrag(e, data, sourceEl) {
  if(!running) return; e.preventDefault();
  hideGuideMotion();
  dragging={data,sourceEl};
  sourceEl.classList.add('dragging');
  ghost.textContent = data.e;
  ghost.style.fontSize = data.w>=10 ? '3.6rem' : '2.4rem';
  ghost.style.display = 'block';
  moveGhost(e.clientX, e.clientY);
}
function startDragTouch(e, data, sourceEl) {
  if(!running) return; e.preventDefault();
  hideGuideMotion();
  dragging={data,sourceEl};
  sourceEl.classList.add('dragging');
  ghost.textContent = data.e;
  ghost.style.fontSize = data.w>=10 ? '3.6rem' : '2.4rem';
  ghost.style.display = 'block';
  moveGhost(e.touches[0].clientX, e.touches[0].clientY);
}
document.addEventListener('mousemove', e=>{ if(!dragging)return; moveGhost(e.clientX,e.clientY); hoverCheck(e.clientX,e.clientY); });
document.addEventListener('mouseup',   e=>{ if(!dragging)return; ghost.style.display='none'; dropHighlight.setAttribute('opacity','0'); if(!tryDrop(e.clientX,e.clientY)) dragging.sourceEl.classList.remove('dragging'); dragging=null; });
document.addEventListener('touchmove', e=>{ if(!dragging)return; e.preventDefault(); moveGhost(e.touches[0].clientX,e.touches[0].clientY); hoverCheck(e.touches[0].clientX,e.touches[0].clientY); },{passive:false});
document.addEventListener('touchend',  e=>{ if(!dragging)return; ghost.style.display='none'; dropHighlight.setAttribute('opacity','0'); if(!tryDrop(e.changedTouches[0].clientX,e.changedTouches[0].clientY)) dragging.sourceEl.classList.remove('dragging'); dragging=null; });

function moveGhost(cx,cy){ ghost.style.left=cx+'px'; ghost.style.top=cy+'px'; spawnSparkles(cx,cy); }


// ── 반짝이 꼬리 ──────────────────────────────────────────
const SPARKLE_COLORS = ['#FFD700','#FFA500','#FF6347','#FF69B4','#87CEEB','#ADFF2F','#fff'];
let lastSparkleTime = 0;
function spawnSparkles(cx, cy) {
  const now = performance.now();
  if(now - lastSparkleTime < 25) return; // 간격 제한
  lastSparkleTime = now;
  const count = 2 + Math.floor(Math.random()*2);
  for(let i=0; i<count; i++){
    const el = document.createElement('div');
    el.className = 'sparkle';
    const size = 4 + Math.random()*8;
    const color = SPARKLE_COLORS[Math.floor(Math.random()*SPARKLE_COLORS.length)];
    const ox = (Math.random()-.5)*24;
    const oy = (Math.random()-.5)*24;
    el.style.cssText = `left:${cx+ox}px;top:${cy+oy}px;width:${size}px;height:${size}px;background:${color};box-shadow:0 0 ${size*2}px ${color};animation:sparkle-fade ${800+Math.random()*700}ms ease-out forwards;`;
    document.body.appendChild(el);
    el.addEventListener('animationend', ()=>el.remove());
  }
}

function hoverCheck(cx,cy) {
  const sv = clientToSvg(cx,cy);
  const on = isOnTray(sv.x, sv.y);
  dropHighlight.setAttribute('stroke', on?'rgba(244,165,53,0.8)':'rgba(244,165,53,0)');
  dropHighlight.setAttribute('opacity', on?'1':'0');
}

// 겹침 체크: 반경 내 이모지 수
const OVERLAP_RADIUS = 35; // SVG 좌표 기준 반경
const MAX_OVERLAP = 2;     // 최대 2개까지 (3개째부터 금지)
function countNearby(sx, sy) {
  let n = 0;
  for(const it of items) {
    const dx = it.sx - sx, dy = it.sy - sy;
    if(Math.sqrt(dx*dx + dy*dy) < OVERLAP_RADIUS) n++;
  }
  return n;
}

function showOverlapToast(cx, cy) {
  const el = document.createElement('div');
  el.className = 'overlap-toast';
  el.textContent = '⚠ 같은 곳에 3개 이상 놓을 수 없어요!';
  document.body.appendChild(el);
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  let left = cx - rect.width / 2;
  if(left < 8) left = 8;
  if(left + rect.width > vw - 8) left = vw - 8 - rect.width;
  el.style.left = left + 'px';
  el.style.top = (cy - 30) + 'px';
  setTimeout(() => el.remove(), 1500);
}

function tryDrop(cx,cy) {
  if(goldenCountdownActive || goldenTime) return false;
  const sv = clientToSvg(cx,cy);
  if(!isOnTray(sv.x, sv.y)) return false;
  // 특수 이모지는 겹침 체크 무시
  const isSpecial = dragging.data.e === '💣' || dragging.data.e === '🧊' || dragging.data.e === '🧲' || dragging.data.e === '⭐' || dragging.data.mystery;
  if(!isSpecial) {
    if(countNearby(sv.x, sv.y) >= MAX_OVERLAP) { showOverlapToast(cx, cy); return false; }
  }
  // 랜덤박스: 랜덤 특수효과 발동
  if(dragging.data.mystery) {
    removeFloorItem(dragging.sourceEl);
    playSFX('item');
    mysteryActivate(cx, cy, sv.x, sv.y);
    return true;
  }
  // 폭탄: 쟁반에 추가하지 않고 바로 폭발
  if(dragging.data.e === '💣') {
    removeFloorItem(dragging.sourceEl);
    playSFX('item');
    bombExplode();
    return true;
  }
  // 얼음: 쟁반에 추가하지 않고 동결 효과
  if(dragging.data.e === '🧊') {
    removeFloorItem(dragging.sourceEl);
    playSFX('item');
    iceFreeze(cx, cy);
    return true;
  }
  // 자석: 쟁반에 추가하지 않고 주변 이모지 끌어당기기
  if(dragging.data.e === '🧲') {
    removeFloorItem(dragging.sourceEl);
    playSFX('item');
    magnetPull(sv.x, sv.y, cx, cy);
    return true;
  }
  // 별: 쟁반에 추가하지 않고 골든타임 발동
  if(dragging.data.e === '⭐') {
    removeFloorItem(dragging.sourceEl);
    playSFX('item');
    starGoldenTime(cx, cy);
    return true;
  }
  const dropPts = dragging.data.pts || toPoints(dragging.data.w);
  items.push({sx:sv.x, sy:sv.y, e:dragging.data.e, w:dragging.data.w, dropT:performance.now()});
  score += dropPts;
  trackMissionEmoji(dragging.data.e);
  removeFloorItem(dragging.sourceEl);
  playSFX('put');
  spawnDropBurst(cx, cy);
  spawnScoreStars(cx, cy, dropPts);
  spawnScorePopup(cx, cy, dropPts);
  return true;
}

// ── 랜덤박스 효과 ──────────────────────────────────────────
const MYSTERY_EFFECTS = [
  {emoji:'💣', name:'폭탄'},
  {emoji:'🧊', name:'얼음'},
  {emoji:'🧲', name:'자석'},
  {emoji:'⭐', name:'골든타임'},
];
function mysteryActivate(cx, cy, svgX, svgY) {
  const effect = MYSTERY_EFFECTS[Math.floor(Math.random()*MYSTERY_EFFECTS.length)];
  // 토스트 표시
  showMysteryToast(cx, cy, effect.emoji, effect.name);
  // 랜덤박스 열리는 이펙트
  spawnMysteryBurst(cx, cy);
  // 약간의 딜레이 후 효과 발동
  setTimeout(() => {
    switch(effect.emoji) {
      case '💣': bombExplode(); break;
      case '🧊': iceFreeze(cx, cy); break;
      case '🧲': magnetPull(svgX, svgY, cx, cy); break;
      case '⭐': starGoldenTime(cx, cy); break;
    }
  }, 400);
}
function showMysteryToast(cx, cy, emoji, name) {
  const el = document.createElement('div');
  el.className = 'mystery-toast';
  el.innerHTML = `<span style="font-size:1.4rem">${emoji}</span> ${name}!`;
  document.body.appendChild(el);
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  let left = cx - rect.width / 2;
  if(left < 8) left = 8;
  if(left + rect.width > vw - 8) left = vw - 8 - rect.width;
  el.style.left = left + 'px';
  el.style.top = (cy - 50) + 'px';
  setTimeout(() => el.remove(), 1800);
}
function spawnMysteryBurst(cx, cy) {
  const icons = ['❓','❗','✨','🎲','🎰','💫'];
  const count = 14;
  for(let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'score-star';
    el.textContent = icons[Math.floor(Math.random() * icons.length)];
    const angle = (Math.PI * 2 / count) * i + (Math.random() - .5) * .5;
    const dist = 70 + Math.random() * 100;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const rot = (Math.random() - .5) * 400;
    const dur = 600 + Math.random() * 500;
    const delay = Math.random() * 100;
    const fs = 1.2 + Math.random() * 1.2;
    el.style.cssText = `left:${cx}px;top:${cy}px;--tx:${tx}px;--ty:${ty}px;--rot:${rot}deg;--dur:${dur}ms;--delay:${delay}ms;--fs:${fs}rem;`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ── 폭탄 폭발 효과: 모든 이모지 제거 + 구름 ─────────────
function bombExplode() {
  const sceneRect = scene.getBoundingClientRect();
  // 쟁반 시각적 중앙 화면 좌표 (SVG 타원 중심 보정)
  const center = svgToScene(TRAY_CX - 20, TRAY_CY - 30);
  const trayCx = sceneRect.left + center.x;
  const trayCy = sceneRect.top + center.y;

  // 1. 화면 흔들기
  let shakeCount = 0;
  const shakeInterval = setInterval(() => {
    const sx = (Math.random() - .5) * 12;
    const sy = (Math.random() - .5) * 12;
    trayGroup.style.transform = `translate(${sx}px,${sy}px)`;
    if(++shakeCount > 8) { clearInterval(shakeInterval); trayGroup.style.transform = ''; }
  }, 40);

  // 2. 폭발 이모지 퍼지기
  const blasts = ['💥','💥','💥','🔥','🔥','💨','💨','✨'];
  for(let i = 0; i < 16; i++) {
    const el = document.createElement('div');
    el.className = 'score-star';
    el.textContent = blasts[Math.floor(Math.random() * blasts.length)];
    const angle = (Math.PI * 2 / 16) * i + (Math.random() - .5) * .4;
    const dist = 80 + Math.random() * 120;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const rot = (Math.random() - .5) * 500;
    const dur = 600 + Math.random() * 500;
    const delay = Math.random() * 100;
    const fs = 1.8 + Math.random() * 1.5;
    el.style.cssText = `left:${trayCx}px;top:${trayCy}px;--tx:${tx}px;--ty:${ty}px;--rot:${rot}deg;--dur:${dur}ms;--delay:${delay}ms;--fs:${fs}rem;`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  // 3. 구름 효과
  spawnBombCloud(trayCx, trayCy);

  // 4. 모든 이모지를 날려버리기
  for(let i = items.length - 1; i >= 0; i--) {
    spawnFallingEmoji(items[i]);
  }
  items.length = 0;
  tiltX = 0; tiltY = 0;
}

function spawnBombCloud(cx, cy) {
  const clouds = ['💨','☁️'];
  const count = 8;
  for(let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'bomb-cloud';
    el.textContent = clouds[Math.floor(Math.random() * clouds.length)];
    const angle = (Math.PI * 2 / count) * i + (Math.random() - .5) * .6;
    const dist = 40 + Math.random() * 80;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist - 10;
    const dur = 1200 + Math.random() * 600;
    const delay = 100 + Math.random() * 200;
    const fs = 2.5 + Math.random() * 2;
    el.style.cssText = `left:${cx}px;top:${cy}px;--tx:${tx}px;--ty:${ty}px;--dur:${dur}ms;--delay:${delay}ms;--fs:${fs}rem;`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ── 얼음 동결 효과: 10초간 기울기 고정 ────────────────────
const ICE_DURATION = 5000;
let frozenStart = 0; // frozenTimer 시작 시점

let frostFlakes = [];

function iceFreeze(screenCx, screenCy) {
  // 이미 동결 중이면 타이머 리셋 & 기존 눈꽃 제거
  if(frozenTimer) clearTimeout(frozenTimer);
  clearFrostFlakes();

  frozen = true;

  // 서리 이펙트
  spawnIceBurst(screenCx, screenCy);

  // 쟁반에 서리 오버레이
  const overlay = document.getElementById('frostOverlay');
  overlay.classList.add('active');

  // 쟁반 주변에 ❄️ 흩뿌리기
  spawnFrostFlakes();

  // 10초 후 해제
  frozenStart = performance.now();
  frozenTimer = setTimeout(() => {
    frozen = false;
    frozenTimer = null;
    overlay.classList.remove('active');
    clearFrostFlakes();
  }, ICE_DURATION);
}

function spawnFrostFlakes() {
  const sceneEl = document.getElementById('scene');
  const count = 12;
  for(let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'frost-flake';
    el.textContent = '❄️';
    // 쟁반 타원 주변에 배치 (타원 가장자리~바깥)
    const angle = (Math.PI * 2 / count) * i + (Math.random() - .5) * .4;
    const rx = 38 + Math.random() * 12; // % 단위
    const ry = 30 + Math.random() * 15;
    const x = 50 + Math.cos(angle) * rx;
    const y = 42 + Math.sin(angle) * ry;
    const fs = .8 + Math.random() * .9;
    const rot = Math.random() * 360;
    const delay = Math.random() * .5;
    el.style.cssText = `left:${x}%;top:${y}%;font-size:${fs}rem;--rot:${rot}deg;animation-delay:${delay}s;`;
    sceneEl.appendChild(el);
    frostFlakes.push(el);
  }
}

function clearFrostFlakes() {
  frostFlakes.forEach(el => {
    el.classList.add('melting');
    setTimeout(() => el.remove(), 500);
  });
  frostFlakes = [];
}

function spawnIceBurst(cx, cy) {
  const ices = ['❄️','🧊','💎','✨','❄️','❄️'];
  const count = 14;
  for(let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'score-star';
    el.textContent = ices[Math.floor(Math.random() * ices.length)];
    const angle = (Math.PI * 2 / count) * i + (Math.random() - .5) * .5;
    const dist = 60 + Math.random() * 100;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const rot = (Math.random() - .5) * 300;
    const dur = 700 + Math.random() * 500;
    const delay = Math.random() * 150;
    const fs = 1.4 + Math.random() * 1.4;
    el.style.cssText = `left:${cx}px;top:${cy}px;--tx:${tx}px;--ty:${ty}px;--rot:${rot}deg;--dur:${dur}ms;--delay:${delay}ms;--fs:${fs}rem;`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ── 자석 끌어당기기 효과 ──────────────────────────────────
function magnetPull(targetSx, targetSy, screenCx, screenCy) {
  if(items.length === 0) return;

  // 자석 이펙트
  spawnMagnetBurst(screenCx, screenCy);

  // 반경 1/3 내 이모지만 끌어당기기
  const magnetRadius = Math.max(TRAY_RX, TRAY_RY) / 3;
  const nearby = items.filter(it => {
    const dx = it.sx - targetSx, dy = it.sy - targetSy;
    return Math.sqrt(dx * dx + dy * dy) <= magnetRadius;
  });
  if(nearby.length === 0) return;

  const pullSteps = 15;
  let step = 0;
  const pullInterval = setInterval(() => {
    step++;
    for(const it of nearby) {
      const dx = targetSx - it.sx;
      const dy = targetSy - it.sy;
      it.sx += dx * 0.15;
      it.sy += dy * 0.15;
    }
    if(step >= pullSteps) clearInterval(pullInterval);
  }, 30);
}

function spawnMagnetBurst(cx, cy) {
  const magnets = ['🧲','⚡','✨','💫'];
  const count = 12;
  for(let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'score-star';
    el.textContent = magnets[Math.floor(Math.random() * magnets.length)];
    const angle = (Math.PI * 2 / count) * i + (Math.random() - .5) * .5;
    const dist = 70 + Math.random() * 90;
    // 바깥에서 안으로 들어오는 방향 (tx/ty를 음수로)
    const startTx = Math.cos(angle) * dist;
    const startTy = Math.sin(angle) * dist;
    const dur = 600 + Math.random() * 400;
    const delay = Math.random() * 150;
    const fs = 1.0 + Math.random() * 1.0;
    el.style.cssText = `left:${cx + startTx}px;top:${cy + startTy}px;--tx:${-startTx}px;--ty:${-startTy}px;--rot:0deg;--dur:${dur}ms;--delay:${delay}ms;--fs:${fs}rem;`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ── 별 골든타임: 쟁반 위 이모지를 별로 변환, 클릭하면 10점 ─────
const GOLDEN_DURATION = 10000;
let goldenStart = 0; // goldenTimer 시작 시점

let goldenCountdownActive = false;

function starGoldenTime(screenCx, screenCy) {
  // 쟁반에 이모지가 없으면 무시
  if(items.length === 0) return;
  // 카운트다운 중이면 무시
  if(goldenCountdownActive) return;
  // 이미 골든타임 중이면 타이머 리셋
  if(goldenTimer) { clearTimeout(goldenTimer); }

  // 별 퍼지기 이펙트
  spawnGoldenBurst(screenCx, screenCy);

  // 창고 위에 골든타임 오버레이
  showGoldenShelfOverlay();

  // 카운트다운 중 기울기 고정 + 자동드롭 정지
  tiltX = 0; tiltY = 0;
  trayGroup.style.transform = 'rotateX(0deg) rotateY(0deg)';
  lastDropTime = performance.now();

  // 3초 카운트다운 후 골든타임 시작
  showGoldenCountdown(() => {
    if(!running) return;
    goldenTime = true;
    pauseBGM();
    playGoldenBGM();

    // 쟁반 위 이모지를 전부 별로 변환 (20% 확률로 🌟 100점)
    items.forEach(it => {
      it.originalE = it.e;
      it.originalW = it.w;
      const isSuperStar = Math.random() < 0.2;
      it.e = isSuperStar ? '🌟' : '⭐';
      it.goldenScore = isSuperStar ? 100 : 10;
      it.golden = true;
      it.tapCount = 0;
    });

    // 쟁반 골든 오버레이 (노란 섬광)
    dropHighlight.setAttribute('stroke', 'rgba(255,215,0,0.8)');
    dropHighlight.setAttribute('stroke-width', '6');
    dropHighlight.setAttribute('opacity', '1');
    dropHighlight.classList.add('golden-flash');

    // 쟁반 골든 테두리
    floorShelf.classList.add('golden-time');

    // 기울기 0으로 리셋 (3D transform 왜곡 제거 → 터치 좌표 정확)
    tiltX = 0; tiltY = 0;
    trayGroup.style.transform = 'rotateX(0deg) rotateY(0deg)';

    // 자동드롭 타이머 리셋 (골든타임 동안 여유 확보)
    lastDropTime = performance.now();

    // 5초 후 해제
    goldenStart = performance.now();
    goldenTimer = setTimeout(() => {
      endGoldenTime();
    }, GOLDEN_DURATION);
  });
}

function endGoldenTime() {
  goldenTime = false;
  goldenTimer = null;
  stopGoldenBGM();
  resumeBGM();
  floorShelf.classList.remove('golden-time');
  dropHighlight.setAttribute('opacity', '0');
  dropHighlight.setAttribute('stroke', 'rgba(244,165,53,0)');
  dropHighlight.setAttribute('stroke-width', '4');
  dropHighlight.classList.remove('golden-flash');
  hideGoldenShelfOverlay();

  // 수확되지 않은 별을 원래 이모지로 복원
  items.forEach(it => {
    if(it.golden) {
      it.e = it.originalE;
      it.w = it.originalW;
      delete it.golden;
      delete it.goldenScore;
      delete it.originalE;
      delete it.originalW;
    }
  });
}

let _gcInterval = null; // 골든 카운트다운 interval (일시정지용)
function showGoldenCountdown(onComplete) {
  goldenCountdownActive = true;
  // 골든타임 진입 시 위기 타이머 취소
  if(criticalTimer){ clearTimeout(criticalTimer); criticalTimer=null; }
  criticalZone = 0;
  document.getElementById('vignetteOverlay').style.opacity = '0';
  const el = document.createElement('div');
  el.className = 'golden-toast countdown';
  el.innerHTML = '<div class="gt-title">⭐ 골든타임</div><div class="gt-sub">별을 터치하세요</div><div class="gt-num">3</div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.left = (window.innerWidth / 2 - el.offsetWidth / 2) + 'px';
    el.style.top = '18%';
    el.style.opacity = '1';
  });

  const numEl = el.querySelector('.gt-num');
  let count = 3;
  const interval = setInterval(() => {
    count--;
    if(count > 0) {
      numEl.textContent = count;
      numEl.style.animation = 'none';
      numEl.offsetHeight; // reflow
      numEl.style.animation = '';
    } else {
      clearInterval(interval);
      _gcInterval = null;
      el.style.opacity = '0';
      goldenCountdownActive = false;
      onComplete();
      setTimeout(() => el.remove(), 400);
    }
  }, 1000);
  _gcInterval = interval;
}

function showGoldenClearToast() {
  const el = document.createElement('div');
  el.className = 'golden-toast';
  el.innerHTML = '<div class="gt-title">⭐ 잘했어요!</div><div class="gt-sub">모든 별을 수확했습니다</div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.left = (window.innerWidth / 2 - el.offsetWidth / 2) + 'px';
    el.style.top = '18%';
    el.style.opacity = '1';
  });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 1500);
}

let goldenShelfOverlay = null;
function showGoldenShelfOverlay() {
  if(goldenShelfOverlay) return;
  const el = document.createElement('div');
  el.className = 'golden-shelf-overlay';
  el.textContent = 'GOLDEN TIME';
  floorShelf.style.position = 'relative';
  floorShelf.appendChild(el);
  goldenShelfOverlay = el;
}
function hideGoldenShelfOverlay() {
  if(goldenShelfOverlay) {
    goldenShelfOverlay.remove();
    goldenShelfOverlay = null;
  }
}

// 쟁반 위 골든 별 클릭 수확 (기울기 0 상태에서 SVG 좌표 직접 비교)
function harvestGoldenStar(cx, cy) {
  if(!goldenTime || !running) return false;
  const sv = clientToSvg(cx, cy);
  const goldenFs = emojiSize(0.1);
  const sceneRect = scene.getBoundingClientRect();
  // 픽셀 히트 반경을 SVG 단위로 변환 (넉넉하게)
  const hitRadius = (goldenFs * 1.8) / sceneRect.width * SVG_W;

  let closest = null, closestDist = Infinity;
  for(let i = 0; i < items.length; i++) {
    const it = items[i];
    if(!it.golden) continue;
    const dx = it.sx - sv.x, dy = it.sy - sv.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if(dist < hitRadius && dist < closestDist) { closestDist = dist; closest = i; }
  }

  if(closest === null) return false;

  const it = items[closest];
  it.tapCount = (it.tapCount || 0) + 1;

  if(it.tapCount < 2) {
    // 1번 탭 — 성장 이펙트
    spawnDropBurst(cx, cy);
    return true;
  }

  // 2번 탭 완료 → 수확!
  const base = it.goldenScore || 10;
  const pts = base * 5;
  score += pts;
  items.splice(closest, 1);

  spawnDropBurst(cx, cy);
  spawnScoreStars(cx, cy, pts);

  // 모든 골든 별이 수확되면 조기 종료
  if(!items.some(it => it.golden)) {
    if(goldenTimer) { clearTimeout(goldenTimer); }
    endGoldenTime();
    showGoldenClearToast();
  }

  return true;
}

function spawnGoldenBurst(cx, cy) {
  const stars = ['⭐','🌟','✨','💛','⭐','⭐'];
  const count = 16;
  for(let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'score-star';
    el.textContent = stars[Math.floor(Math.random() * stars.length)];
    const angle = (Math.PI * 2 / count) * i + (Math.random() - .5) * .5;
    const dist = 80 + Math.random() * 120;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const rot = (Math.random() - .5) * 400;
    const dur = 700 + Math.random() * 500;
    const delay = Math.random() * 150;
    const fs = 1.2 + Math.random() * 1.2;
    el.style.cssText = `left:${cx}px;top:${cy}px;--tx:${tx}px;--ty:${ty}px;--rot:${rot}deg;--dur:${dur}ms;--delay:${delay}ms;--fs:${fs}rem;`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ── 점수 팝업 (드롭 시 위로 튀어오름) ──────────────────────
function spawnScorePopup(cx, cy, pts) {
  const el = document.createElement('div');
  el.className = 'score-popup';
  el.textContent = `+${pts}`;
  const hue = pts >= 20 ? '#ffd700' : pts >= 10 ? '#7fffff' : '#ffffff';
  const fs = pts >= 20 ? 1.8 : pts >= 10 ? 1.5 : 1.2;
  el.style.cssText = `left:${cx}px;top:${cy}px;--dur:900ms;--fs:${fs}rem;color:${hue};text-shadow:0 0 10px ${hue},0 2px 0 rgba(0,0,0,.6);`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ── 드롭 시 반짝이 폭발 ─────────────────────────────────
function spawnDropBurst(cx, cy) {
  const count = 12 + Math.floor(Math.random()*6);
  for(let i=0; i<count; i++){
    const el = document.createElement('div');
    el.className = 'sparkle';
    const size = 5 + Math.random()*10;
    const color = SPARKLE_COLORS[Math.floor(Math.random()*SPARKLE_COLORS.length)];
    const angle = (Math.PI*2 / count) * i + (Math.random()-.5)*.5;
    const dist = 20 + Math.random()*40;
    const ox = Math.cos(angle) * dist;
    const oy = Math.sin(angle) * dist;
    const dur = 400 + Math.random()*500;
    el.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${color};box-shadow:0 0 ${size*3}px ${color};animation:sparkle-burst ${dur}ms ease-out forwards;--sx:${ox}px;--sy:${oy}px;`;
    document.body.appendChild(el);
    el.addEventListener('animationend', ()=>el.remove());
  }
}

// ── 점수 별 퍼지기 효과 ─────────────────────────────────
function spawnScoreStars(cx, cy, pts) {
  const stars = ['⭐','🌟','✨','💫','⚡'];
  const count = Math.min(5 + Math.floor(pts / 5), 14);
  for(let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'score-star';
    el.textContent = stars[Math.floor(Math.random() * stars.length)];
    const angle = (Math.PI * 2 / count) * i + (Math.random() - .5) * .8;
    const dist = 90 + Math.random() * 130;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist - 30;
    const rot = (Math.random() - .5) * 540;
    const dur = 700 + Math.random() * 500;
    const delay = Math.random() * 120;
    const fs = 0.7 + Math.random() * 0.7;
    el.style.cssText = `left:${cx}px;top:${cy}px;--tx:${tx}px;--ty:${ty}px;--rot:${rot}deg;--dur:${dur}ms;--delay:${delay}ms;--fs:${fs}rem;`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ── 물리 / 토크 ────────────────────────────────────────
function computeTorque() {
  let tx=0, ty=0;
  items.forEach(it=>{
    tx += (it.sx - TRAY_CX) / TRAY_RX * it.w;
    ty += (it.sy - TRAY_CY) / TRAY_RY * it.w;
  });
  return {tx,ty};
}

// ── 그리기 ─────────────────────────────────────────────
const DROP_ANIM_DUR = 500; // 바운스 애니메이션 길이 (ms)
function dropBounce(t) {
  // t: 0~1 진행도 → 위에서 떨어지며 말랑하게 착지
  if(t >= 1) return {scX:1, scY:1, offY:0};
  // 낙하 (0~0.35): 위에서 내려옴
  if(t < 0.35) {
    const p = t / 0.35;
    const ease = p * p; // ease-in
    return {scX: 1 - 0.1*ease, scY: 1 + 0.15*ease, offY: -60*(1-ease)};
  }
  // 착지 찌그러짐 (0.35~0.55): 납작하게 눌림
  if(t < 0.55) {
    const p = (t - 0.35) / 0.2;
    const squash = Math.sin(p * Math.PI);
    return {scX: 1 + 0.25*squash, scY: 1 - 0.3*squash, offY: 0};
  }
  // 1차 튀어오름 (0.55~0.75)
  if(t < 0.75) {
    const p = (t - 0.55) / 0.2;
    const bounce = Math.sin(p * Math.PI);
    return {scX: 1 - 0.08*bounce, scY: 1 + 0.12*bounce, offY: -15*bounce};
  }
  // 2차 미세 바운스 (0.75~1.0)
  const p = (t - 0.75) / 0.25;
  const bounce = Math.sin(p * Math.PI);
  return {scX: 1 + 0.05*bounce, scY: 1 - 0.06*bounce, offY: 0};
}

function drawEmojis() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const now = performance.now();
  // 골든 별은 sizeScale 무시 (원래 크기 유지)
  const sceneW = scene.getBoundingClientRect().width;
  const goldenFs = Math.round(sceneW * 0.068);
  items.forEach(it=>{
    const fs = it.golden ? goldenFs : emojiSize(it.w);
    const sc = svgToScene(it.sx, it.sy);

    // 바운스 애니메이션
    const elapsed = it.dropT ? (now - it.dropT) : DROP_ANIM_DUR;
    const t = Math.min(1, elapsed / DROP_ANIM_DUR);
    const {scX, scY, offY} = dropBounce(t);

    ctx.save();
    ctx.translate(sc.x, sc.y + offY);
    ctx.scale(scX, scY);
    ctx.font=`${fs}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    // 골든 별 글로우 + 탭 횟수에 따른 성장
    if(it.golden) {
      const GROW = [1.0, 3.0];
      ctx.scale(GROW[it.tapCount || 0], GROW[it.tapCount || 0]);
      const glow = 0.7 + 0.3 * Math.sin(now * 0.008);
      const isHot = (it.tapCount || 0) >= 1;
      ctx.shadowColor = isHot ? `rgba(255,60,60,${glow})` : `rgba(255,215,0,${glow})`;
      ctx.shadowBlur=fs*0.8;
      ctx.shadowOffsetY=0;
      // 1번 탭 이후 빨간 글로우 + filter
      if(isHot) ctx.filter = 'hue-rotate(140deg) saturate(3)';
      ctx.fillText(it.e, 0, 0);
      ctx.filter = 'none';
      ctx.shadowBlur=fs*1.5;
      ctx.shadowColor = isHot ? `rgba(255,60,60,${glow*0.5})` : `rgba(255,200,0,${glow*0.4})`;
    } else {
      ctx.shadowColor='rgba(0,0,0,.6)';
      ctx.shadowBlur=Math.max(6,fs*.22);
      ctx.shadowOffsetY=Math.max(2,fs*.07);
    }
    ctx.fillText(it.e, 0, 0);
    ctx.restore();
  });
}

// ── 가이드 모션 ─────────────────────────────────────────
function showGuideMotion() {
  const shelf = document.getElementById('floorShelf');
  const tray = document.getElementById('trayGroup');
  if(!shelf || !tray) return;
  const sr = shelf.getBoundingClientRect();
  const tr = tray.getBoundingClientRect();
  const startX = sr.left + sr.width / 2;
  const startY = sr.top + sr.height * 0.3;
  const dx = (tr.left + tr.width / 2) - startX;
  const dy = (tr.top + tr.height / 2) - startY;

  let count = 0;
  function spawn() {
    if(count >= 2) return;
    const el = document.createElement('div');
    el.className = 'guide-finger' + (count > 0 ? ' repeat' : '');
    el.textContent = '👆';
    el.style.left = startX + 'px';
    el.style.top = startY + 'px';
    el.style.setProperty('--gx', dx + 'px');
    el.style.setProperty('--gy', dy + 'px');
    document.body.appendChild(el);
    el.addEventListener('animationend', () => { el.remove(); count++; spawn(); });
  }
  spawn();
}
function hideGuideMotion() {
  document.querySelectorAll('.guide-finger').forEach(el => el.remove());
}

// ── 게임 루프 ──────────────────────────────────────────
function init() {
  hideBannerAd();
  syncCanvas();
  paused=false; _pauseData=null;
  level = 1;
  applyLevel(level);
  missionEffects = { sizeScale:1.0, scoreMulti:1, noAutoDrop:false };
  itemCounts = { shuffle:3, clean:3 };
  updateItemBtns();
  currentMissionIndex = 0;
  levelMissions = [];
  const doneList = document.getElementById('missionDoneList');
  if(doneList) doneList.innerHTML = '';
  items=[]; tiltX=0; tiltY=0; shakeTimer=0; score=0; running=true; lastDropTime=performance.now();
  frozen=false; if(frozenTimer){clearTimeout(frozenTimer);frozenTimer=null;}
  criticalZone=0; if(criticalTimer){clearTimeout(criticalTimer);criticalTimer=null;}
  frostFlakes.forEach(el=>el.remove()); frostFlakes=[];
  document.getElementById('frostOverlay').classList.remove('active');
  goldenTime=false; if(goldenTimer){clearTimeout(goldenTimer);goldenTimer=null;}
  floorShelf.classList.remove('golden-time');
  stopBGM(); stopGoldenBGM();
  playBGM();
  startOverlay.style.display='none';
  goOverlay.classList.remove('show');
  document.getElementById('levelClearOverlay').classList.remove('show');
  document.body.classList.remove('no-scroll');
  trayGroup.style.transition='';
  trayGroup.style.transform='';
  initFloor(); updateHUD(0,0);
  initLevelMissions();
  if(rafId) cancelAnimationFrame(rafId);
  showGuideMotion();
  loop();
}

const SLIDE_THRESHOLD = 0.15; // 기울기 비율이 이 이상이면 미끄러지기 시작
const SLIDE_SPEED = 0.35;     // 미끄러짐 속도 계수

function slideEmojis(danger) {
  if(danger < SLIDE_THRESHOLD) return;
  const slideFactor = (danger - SLIDE_THRESHOLD) / (1 - SLIDE_THRESHOLD); // 0~1
  const force = slideFactor * slideFactor * SLIDE_SPEED; // 가속도 느낌

  // 기울기 방향 (tiltY → X축 이동, tiltX → Y축 이동)
  const mag = Math.sqrt(tiltX**2 + tiltY**2) || 1;
  const dirX = tiltY / mag; // rotateY가 양수면 오른쪽으로 기울어짐
  const dirY = tiltX / mag; // rotateX가 양수면 앞으로 기울어짐

  for(let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.sx += dirX * force * TRAY_RX * 0.02;
    it.sy += dirY * force * TRAY_RY * 0.02;

    // 쟁반 밖으로 나갔는지 체크
    const dx = (it.sx - TRAY_CX) / TRAY_RX;
    const dy = (it.sy - TRAY_CY) / TRAY_RY;
    if(dx*dx + dy*dy > 1.05) {
      // 이모지가 바닥에 떨어지면 게임오버
      spawnFallingEmoji(it);
      items.splice(i, 1);
      gameOver();
      return;
    }
  }
}

function spawnFallingEmoji(it) {
  const sceneRect = scene.getBoundingClientRect();
  const sc = svgToScene(it.sx, it.sy);
  const startX = sceneRect.left + sc.x;
  const startY = sceneRect.top + sc.y;
  const fs = emojiSize(it.w);

  const el = document.createElement('div');
  el.className = 'falling-emoji';
  el.textContent = it.e;
  el.style.cssText = `left:${startX}px;top:${startY}px;font-size:${fs}px;line-height:1;will-change:transform,opacity;`;
  document.body.appendChild(el);

  const dirX = (it.sx - TRAY_CX) / TRAY_RX;
  const dirY = (it.sy - TRAY_CY) / TRAY_RY;
  let vx = dirX * 6 + (Math.random()-.5)*2;
  let vy = -2 + dirY * 4;
  let px=0, py=0, rot=0, rotV=(Math.random()-.5)*20, opacity=1;

  function animFrame() {
    vy += 0.5;
    vx *= 0.98;
    px += vx; py += vy;
    rot += rotV;
    opacity -= 0.015;
    el.style.transform = `translate(${px}px,${py}px) rotate(${rot}deg)`;
    el.style.opacity = Math.max(0, opacity);
    if(opacity > 0) requestAnimationFrame(animFrame);
    else el.remove();
  }
  requestAnimationFrame(animFrame);
}

// ── 자동 드롭 (10초 무행동 시) ────────────────────────
function autoDrop() {
  if(!running || dragging || goldenCountdownActive || goldenTime || missionEffects.noAutoDrop || floorItems.length===0) return;
  const normalItems = floorItems.filter(f => !f.special && f.w < 10);
  if(normalItems.length === 0) return;
  const fi = normalItems[Math.floor(Math.random()*normalItems.length)];
  // 쟁반 타원 안 랜덤 위치 (겹침 피해서 최대 20회 시도)
  let sx, sy;
  for(let attempt=0; attempt<20; attempt++){
    const angle = Math.random()*Math.PI*2;
    const r = Math.sqrt(Math.random())*0.75;
    sx = TRAY_CX + Math.cos(angle)*TRAY_RX*r;
    sy = TRAY_CY + Math.sin(angle)*TRAY_RY*r;
    if(countNearby(sx, sy) < MAX_OVERLAP) break;
  }
  items.push({sx, sy, e:fi.e, w:fi.w, dropT:performance.now()});
  const autoPts = toPoints(fi.w);
  score += autoPts;
  trackMissionEmoji(fi.e);
  // 드롭 위치를 화면 좌표로 변환해서 반짝이 효과
  const sc = svgToScene(sx, sy);
  const sceneRect = scene.getBoundingClientRect();
  const dropX = sceneRect.left + sc.x, dropY = sceneRect.top + sc.y;
  spawnDropBurst(dropX, dropY);
  spawnScoreStars(dropX, dropY, autoPts);
  spawnScorePopup(dropX, dropY, autoPts);
  removeFloorItem(fi.el);
  lastDropTime = performance.now();
}

function updateCountdown() {
  // 골든타임/카운트다운/자동드롭OFF 중 타이머 숨김
  if(goldenTime || goldenCountdownActive || missionEffects.noAutoDrop) {
    countdownTimer.classList.remove('active');
    return;
  }

  const elapsed = performance.now() - lastDropTime;
  const remaining = Math.max(0, AUTO_DROP_DELAY - elapsed);
  const secs = Math.ceil(remaining / 1000);
  const ratio = remaining / AUTO_DROP_DELAY; // 1→0

  // 10초부터 항상 표시
  if(secs <= 10) {
    countdownTimer.classList.add('active');
    countdownText.textContent = secs;
    countdownRing.style.strokeDashoffset = ((1 - ratio) * RING_CIRCUM).toFixed(1);
    const warn = secs <= 3;
    countdownRing.classList.toggle('warn', warn);
    countdownText.classList.toggle('warn', warn);
  } else {
    countdownTimer.classList.remove('active');
  }
}

function loop() {
  if(!running || paused) return;
  // 자동 드롭 체크
  if(performance.now() - lastDropTime > AUTO_DROP_DELAY) autoDrop();

  let danger = 0;
  if(frozen || goldenTime || goldenCountdownActive) {
    // 동결/골든타임 중: 기울기 변화 없음, 미끄러짐 없음, 게임오버 없음
    trayGroup.style.transform = `rotateX(${-tiltX}deg) rotateY(${tiltY}deg)`;
    const mag = Math.sqrt(tiltX**2+tiltY**2);
    danger = Math.min(1, mag/TILT_LIMIT);
  } else {
    const {tx,ty} = computeTorque();
    // 토크 계수를 높여 무게 차이가 시각적으로 잘 보이도록
    tiltX += (ty*12 - tiltX) * .10;
    tiltY += (tx*12 - tiltY) * .10;

    const clX = Math.max(-TILT_LIMIT*1.1, Math.min(TILT_LIMIT*1.1, tiltX));
    const clY = Math.max(-TILT_LIMIT*1.1, Math.min(TILT_LIMIT*1.1, tiltY));

    const mag = Math.sqrt(tiltX**2+tiltY**2);
    danger = Math.min(1, mag/TILT_LIMIT);

    // 구간 결정: 0=안전 1=90~95% 2=95~99% 3=100%+
    const newZone = danger >= 1.0 ? 3 : danger >= 0.95 ? 2 : danger >= 0.9 ? 1 : 0;
    if(newZone === 0) {
      if(criticalZone > 0) { criticalZone=0; clearTimeout(criticalTimer); criticalTimer=null; }
    } else if(newZone > criticalZone) {
      // 더 위험한 구간 진입 → 타이머 재시작
      if(criticalTimer) clearTimeout(criticalTimer);
      criticalZone = newZone;
      criticalStart = performance.now();
      criticalTimer = setTimeout(() => { criticalZone=0; criticalTimer=null; gameOver(); }, CRITICAL_DURATIONS[criticalZone]);
    } else if(newZone < criticalZone) {
      criticalZone = newZone; // 타이머는 유지 (관대하게)
    }

    // 흔들림: zone에 따라 강도 차등
    if(criticalZone > 0) {
      const dur = CRITICAL_DURATIONS[criticalZone];
      const elapsed = Math.min(1, (performance.now() - criticalStart) / dur);
      const amp = criticalZone === 3 ? 4 + elapsed * 18
                : criticalZone === 2 ? 2 + elapsed * 8
                :                      0.5 + elapsed * 3;
      const freq = criticalZone === 3 ? 0.012 + elapsed * 0.018
                 : criticalZone === 2 ? 0.008 + elapsed * 0.010
                 :                      0.005 + elapsed * 0.006;
      const shake = amp * Math.sin(performance.now() * freq);
      trayGroup.style.transform = `rotateX(${-(clX + shake * 0.5)}deg) rotateY(${clY + shake}deg)`;
    } else {
      trayGroup.style.transform = `rotateX(${-clX}deg) rotateY(${clY}deg)`;
    }

    // 비네팅: 90% 이상부터 점점 붉어짐
    const vignette = document.getElementById('vignetteOverlay');
    if(danger >= 0.9) {
      const intensity = (danger - 0.9) / 0.1; // 0~1
      vignette.style.background = `radial-gradient(ellipse at center, transparent 35%, rgba(220,30,30,${intensity * 0.7}) 100%)`;
      vignette.style.opacity = '1';
    } else {
      vignette.style.opacity = '0';
    }
  }

  updateHUD(score, danger);
  updateCountdown();
  drawEmojis();

  // 레벨 클리어 판정
  if(score >= currentGoal) { levelClear(); return; }

  if(!frozen && criticalZone === 0 && danger > DANGER_WARN) {
    shakeTimer++;
    if(shakeTimer%6<3) trayGroup.style.transform += ` translateX(${(Math.random()-.5)*5}px)`;
  } else if(criticalZone === 0) { shakeTimer=0; }

  rafId = requestAnimationFrame(loop);
}


// ── HUD 업데이트 ────────────────────────────────────────
function updateHUD(sc, danger) {
  const pct = Math.round(danger*100);
  const countValEl = document.getElementById('countVal');
  if(countValEl.textContent !== String(sc)) {
    countValEl.textContent = sc;
    countValEl.classList.remove('score-pop');
    void countValEl.offsetWidth;
    countValEl.classList.add('score-pop');
  }
  document.getElementById('levelVal').textContent = level >= LEVELS.length ? 'MAX' : level;
  document.getElementById('goalVal').textContent = currentGoal === Infinity ? '∞' : currentGoal;
  const de = document.getElementById('dangerVal');
  de.textContent=pct+'%'; de.className='danger-pct'+(danger>DANGER_WARN?' danger':'');

  const mag=Math.sqrt(tiltX**2+tiltY**2);
  const angle=Math.atan2(tiltY,tiltX);
  const ratio=Math.min(1,mag/TILT_LIMIT);
  const needle=document.getElementById('tiltNeedle');
  const fill=document.getElementById('tiltFill');
  const npos=50+Math.sin(angle)*ratio*44;
  needle.style.left=npos+'%';
  const col=danger<.4?'#40C870':danger<.7?'#F4A535':'#E84040';
  needle.style.background=col;
  if(tiltY>0){fill.style.left='50%';fill.style.width=(ratio*44)+'%';}
  else{fill.style.left=(50-ratio*44)+'%';fill.style.width=(ratio*44)+'%';}
  fill.style.background=col;
  const df=document.getElementById('dangerFill');
  df.style.width=pct+'%';
  df.style.background=danger<.4?'linear-gradient(90deg,#40C870,#80e8a0)':danger<.7?'linear-gradient(90deg,#F4A535,#f8c070)':'linear-gradient(90deg,#E84040,#ff8080)';

  // 기울기 방향 화살표 (균형 복원 방향 = 기울기 반대)
  const tiltArrow = document.getElementById('tiltArrow');
  const tiltArrowSvg = document.getElementById('tiltArrowSvg');
  if(running && mag > TILT_LIMIT * 0.1) {
    tiltArrow.classList.add('active');
    // 화살표는 기울어진 반대 방향(무게를 추가해야 할 방향)을 가리킴
    // SVG 폴리곤이 위(0°)를 기본 방향으로 그려져 있음
    // tiltY>0 = 오른쪽 무거움 → 왼쪽을 가리켜야 → rotate(-90deg)
    // tiltX>0 = 아래쪽 무거움 → 위쪽을 가리켜야 → rotate(0deg)
    const arrowAngle = Math.atan2(tiltY, -tiltX) * 180 / Math.PI;
    tiltArrowSvg.style.transform = `rotate(${arrowAngle}deg)`;
    // 위험도에 따라 색상 변경
    const arrowColor = danger < .4 ? '#40C870' : danger < .7 ? '#F4A535' : '#E84040';
    tiltArrowSvg.querySelector('polygon').setAttribute('fill', arrowColor);
  } else {
    tiltArrow.classList.remove('active');
  }

  // 위험도 80% 이상이면 😱 깜빡
  const dangerEmoji = document.getElementById('dangerEmoji');
  if(running && danger >= 0.7) {
    dangerEmoji.classList.add('active');
  } else {
    dangerEmoji.classList.remove('active');
  }
}

// ── 레벨 클리어 ─────────────────────────────────────────
let _lcInterval = null; // 레벨 클리어 카운트다운 interval (일시정지용)
function levelClear() {
  running = false;
  cancelAnimationFrame(rafId);
  criticalZone=0; if(criticalTimer){clearTimeout(criticalTimer);criticalTimer=null;}
  document.getElementById('vignetteOverlay').style.opacity='0';
  countdownTimer.classList.remove('active');
  document.getElementById('tiltArrow').classList.remove('active');
  document.getElementById('dangerEmoji').classList.remove('active');
  stopGoldenBGM();
  playSFX('levelup');

  const lcOverlay = document.getElementById('levelClearOverlay');
  const isAllClear = level >= LEVELS.length;

  if(isAllClear) {
    document.getElementById('lcIcon').textContent = '🎊';
    document.getElementById('lcTitle').textContent = 'ALL CLEAR!';
    document.getElementById('lcSub').textContent = '최종 점수: ' + score + '점';
    document.getElementById('lcNext').textContent = '';
    document.getElementById('lcCountdown').textContent = '';
    lcOverlay.classList.add('show');
    document.body.classList.add('no-scroll');
    spawnConfetti();

    // 올클리어 → 3초 후 게임오버 화면 (랭킹 등록)
    setTimeout(() => {
      lcOverlay.classList.remove('show');
      document.body.classList.remove('no-scroll');
      // 랭킹 등록을 위해 gameOver 로직 재활용
      showGameOverScreen();
    }, 3000);
    return;
  }

  // 일반 레벨 클리어
  document.getElementById('lcIcon').textContent = '⭐'.repeat(level);
  document.getElementById('lcTitle').textContent = 'Level ' + level + ' Clear!';
  document.getElementById('lcSub').textContent = '현재 점수: ' + score + '점';
  lcOverlay.classList.add('show');
  document.body.classList.add('no-scroll');
  spawnConfetti();

  let countdown = 3;
  document.getElementById('lcCountdown').textContent = countdown;
  document.getElementById('lcNext').textContent = 'Level ' + (level+1) + ' 시작까지...';

  const cdInterval = setInterval(() => {
    countdown--;
    if(countdown > 0) {
      document.getElementById('lcCountdown').textContent = countdown;
    } else {
      clearInterval(cdInterval);
      _lcInterval = null;
      lcOverlay.classList.remove('show');
      document.body.classList.remove('no-scroll');
      // 다음 레벨 시작 (미션 효과 보존)
      const savedMissionEffects = {...missionEffects};
      level++;
      applyLevel(level);
      missionEffects = savedMissionEffects;
      updateItemBtns();
      items = [];
      tiltX = 0; tiltY = 0; shakeTimer = 0;
      frozen=false; if(frozenTimer){clearTimeout(frozenTimer);frozenTimer=null;}
      frostFlakes.forEach(el=>el.remove()); frostFlakes=[];
      document.getElementById('frostOverlay').classList.remove('active');
      goldenTime=false; if(goldenTimer){clearTimeout(goldenTimer);goldenTimer=null;}
      floorShelf.classList.remove('golden-time');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      trayGroup.style.transition = '';
      trayGroup.style.transform = '';
      lastDropTime = performance.now();
      initFloor();
      running = true;
      loop();
    }
  }, 1000);
  _lcInterval = cdInterval;
}

function showGameOverScreen() {
  if(score > best) {
    best = score;
    localStorage.setItem('trayBest5', best);
    document.getElementById('bestVal').textContent = best;
  }
  const finalScore = score;
  (async () => {
    const goLevelBadge = document.getElementById('goLevelBadge');
    const goCount = document.getElementById('goCount');
    const goBest = document.getElementById('goBest');
    const goSubTitle = document.getElementById('goSubTitle');
    const lvlText = level >= LEVELS.length ? 'Level MAX' : 'Level ' + level;
    if(goLevelBadge) goLevelBadge.textContent = lvlText;
    if(goCount) goCount.textContent = finalScore;
    if(goBest) goBest.textContent = best;

    const nickArea = document.getElementById('goNickname');
    const lbArea = document.getElementById('goLeaderboard');
    const retryBtn = document.getElementById('retryBtn');
    nickArea.classList.remove('show');
    lbArea.classList.remove('show');
    document.getElementById('goNickInput').value = '';

    const topTen = await isTopTen(finalScore);
    if(topTen && finalScore > 0) {
      document.querySelector('.go-emoji').textContent = '🎉';
      document.querySelector('.go-title').textContent = '축하합니다!';
      if(goSubTitle) goSubTitle.textContent = '';
      document.getElementById('goNickSub').textContent = 'TOP 10 순위권에 진입했어요!';
      nickArea.classList.add('show');
      retryBtn.style.display = 'none';
      spawnConfetti();
      playSFX('winner');
      document.getElementById('goNickInput').focus();
    } else {
      document.querySelector('.go-emoji').textContent = '💥';
      document.querySelector('.go-title').textContent = '쏟아졌다!';
      if(goSubTitle) goSubTitle.textContent = lvlText + '에서 실패';
      playSFX('end');
      const board = await loadLeaderboard();
      renderLeaderboard(board, finalScore, '');
      lbArea.classList.add('show');
      retryBtn.style.display = '';
    }
    goOverlay.classList.add('show');
    document.body.classList.add('no-scroll');
    // 하단 배너 광고 표시
    showBannerAd();
  })();
}

// ── 게임오버 ───────────────────────────────────────────
function gameOver() {
  running=false; cancelAnimationFrame(rafId);
  criticalZone=0; if(criticalTimer){clearTimeout(criticalTimer);criticalTimer=null;}
  document.getElementById('vignetteOverlay').style.opacity='0';
  countdownTimer.classList.remove('active');
  document.getElementById('tiltArrow').classList.remove('active');
  document.getElementById('dangerEmoji').classList.remove('active');
  stopBGM(); stopGoldenBGM();
  playSFX('drop');

  // 1. 캔버스의 이모지를 즉시 지움 (쟁반 위 이모지 제거)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. 쟁반 뒤집기
  trayGroup.style.transition='transform .65s cubic-bezier(.4,0,.6,1)';
  trayGroup.style.transform='rotateX(180deg) rotateY(18deg)';

  // 3. 이모지를 실제 화면 위치에서 물리 기반으로 떨어뜨리기
  //    기울기 방향으로 초기 속도 부여
  const sceneRect = scene.getBoundingClientRect();
  const flipDirX = tiltY > 0 ? 1 : -1; // rotateY → 좌우 방향

  items.forEach((it, idx) => {
    // 씬 픽셀 위치 계산
    const sc = svgToScene(it.sx, it.sy);
    const startX = sceneRect.left + sc.x;
    const startY = sceneRect.top  + sc.y;
    const fs = emojiSize(it.w);

    const el = document.createElement('div');
    el.className = 'falling-emoji';
    el.textContent = it.e;
    el.style.cssText = `
      left:${startX}px; top:${startY}px;
      font-size:${fs}px; line-height:1;
      will-change:transform,opacity;
    `;
    document.body.appendChild(el);

    // 물리: 기울기 방향으로 날아가다가 중력으로 떨어짐
    const delay = idx * 30 + Math.random()*80; // 순차 딜레이
    const vx0 = flipDirX * (4 + Math.random()*6) + (Math.random()-.5)*4;
    const vy0 = -4 - Math.random()*6; // 처음엔 위로 튀어오름
    let vx=vx0, vy=vy0, px=0, py=0;
    let rot=0, rotV=(Math.random()-.5)*25;
    let opacity=1;
    let startTime=null;

    function animFrame(ts) {
      if(!startTime) startTime=ts;
      if(ts-startTime < delay) { requestAnimationFrame(animFrame); return; }

      vy += 0.55; // 중력
      vx *= 0.98; // 공기 저항
      px += vx; py += vy;
      rot += rotV;
      opacity -= 0.012;

      el.style.transform = `translate(${px}px, ${py}px) rotate(${rot}deg)`;
      el.style.opacity = Math.max(0, opacity);

      if(opacity > 0) requestAnimationFrame(animFrame);
      else el.remove();
    }
    requestAnimationFrame(animFrame);
  });

  setTimeout(() => showGameOverScreen(), 1100);
}

// ── 쟁반 클릭(골든타임 별 수확) ─────────────────────────
// 골든타임 중 캔버스에서 직접 이벤트를 받아 렌더링 좌표와 100% 일치하는 히트 판정
let tapStartX = 0, tapStartY = 0;
dropZone.addEventListener('mousemove', () => {
  dropZone.style.cursor = (goldenTime && running) ? 'pointer' : '';
});
dropZone.addEventListener('mousedown', e => {
  tapStartX = e.clientX; tapStartY = e.clientY;
});
dropZone.addEventListener('mouseup', e => {
  if(!goldenTime || dragging) return;
  const dx = e.clientX - tapStartX, dy = e.clientY - tapStartY;
  if(dx*dx + dy*dy < 100) {
    harvestGoldenStar(e.clientX, e.clientY);
  }
});
dropZone.addEventListener('touchstart', e => {
  tapStartX = e.touches[0].clientX; tapStartY = e.touches[0].clientY;
  if(goldenTime && running) e.preventDefault();
}, {passive:false});
dropZone.addEventListener('touchend', e => {
  if(!goldenTime || dragging) return;
  const cx = e.changedTouches[0].clientX, cy = e.changedTouches[0].clientY;
  const dx = cx - tapStartX, dy = cy - tapStartY;
  if(dx*dx + dy*dy < 100) {
    e.preventDefault();
    harvestGoldenStar(cx, cy);
  }
});

// ── 이벤트 ─────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', () => { playSFX('start'); init(); });

// 닉네임 저장
document.getElementById('goNickSave').addEventListener('click', async ()=>{
  const input = document.getElementById('goNickInput');
  const name = input.value.trim();
  if(!name) { alert('닉네임을 입력해주세요.'); input.focus(); return; }

  const btn = document.getElementById('goNickSave');
  btn.textContent = '저장 중...';
  btn.disabled = true;

  const finalScore = parseInt(document.getElementById('goCount').textContent) || 0;
  await saveScore(name, finalScore);

  document.getElementById('goNickname').classList.remove('show');

  const board = await loadLeaderboard();
  renderLeaderboard(board, finalScore, name);
  document.getElementById('goLeaderboard').classList.add('show');
  document.getElementById('retryBtn').style.display = '';

  btn.textContent = '저장';
  btn.disabled = false;
});

// Enter 키로도 저장
document.getElementById('goNickInput').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') document.getElementById('goNickSave').click();
});

// 건너뛰기 (저장 않고 랭킹만 보기)
document.getElementById('goNickSkip').addEventListener('click', async ()=>{
  document.getElementById('goNickname').classList.remove('show');
  const board = await loadLeaderboard();
  renderLeaderboard(board, 0, '');
  document.getElementById('goLeaderboard').classList.add('show');
  document.getElementById('retryBtn').style.display = '';
});

// ── AdMob 광고 ──────────────────────────────────────────
const INTERSTITIAL_AD_ID = 'ca-app-pub-2816580799508764/1762104656';
const BANNER_AD_ID = 'ca-app-pub-2816580799508764/2870504283';
let adMobReady = false;

(async function initAdMob(){
  try {
    if(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob){
      const { AdMob } = window.Capacitor.Plugins;
      await AdMob.initialize({});
      adMobReady = true;
      // 미리 전면 광고 로드
      await AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_ID });
    }
  } catch(e){ console.log('AdMob init skip:', e); }
})();

// 배너 광고 표시 (게임오버 화면)
async function showBannerAd(){
  if(!adMobReady) return;
  try {
    const { AdMob } = window.Capacitor.Plugins;
    await AdMob.showBanner({
      adId: BANNER_AD_ID,
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: 0,
    });
  } catch(e){ console.log('Banner show fail:', e); }
}

async function hideBannerAd(){
  if(!adMobReady) return;
  try {
    const { AdMob } = window.Capacitor.Plugins;
    await AdMob.removeBanner();
  } catch(e){ console.log('Banner hide fail:', e); }
}

// 전면 광고를 표시하고, 광고가 닫힐 때 콜백 실행
async function showInterstitialAd(onDismissed){
  if(!adMobReady) { onDismissed(); return; }
  try {
    const { AdMob } = window.Capacitor.Plugins;

    // 광고 닫힘 → 즉시 콜백
    AdMob.addListener('interstitialAdDismissed', () => {
      AdMob.removeAllListeners();
      onDismissed();
      // 다음 광고 미리 로드 (백그라운드)
      AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_ID }).catch(()=>{});
    });

    AdMob.addListener('interstitialAdFailedToShow', () => {
      AdMob.removeAllListeners();
      onDismissed();
    });

    await AdMob.showInterstitial();
  } catch(e){
    console.log('Ad show fail:', e);
    onDismissed();
    try {
      const { AdMob } = window.Capacitor.Plugins;
      await AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_ID });
    } catch(ignore){}
  }
}

const cleaningDim = document.getElementById('cleaningDim');
document.getElementById('retryBtn').addEventListener('click', ()=>{
  // 즉시 게임오버 오버레이 닫기 + 쟁반 상태 초기화
  document.querySelectorAll('.falling-emoji').forEach(el=>el.remove());
  document.getElementById('goNickname').classList.remove('show');
  document.getElementById('goLeaderboard').classList.remove('show');
  document.getElementById('retryBtn').style.display = '';
  goOverlay.classList.remove('show');
  trayGroup.style.transition = '';
  trayGroup.style.transform = '';
  items = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 청소중 딤 표시
  cleaningDim.classList.add('show');
  // 전면 광고 표시 → 닫히면 딤 제거 + 게임 시작
  showInterstitialAd(() => {
    cleaningDim.classList.remove('show');
    init();
  });
});
window.addEventListener('resize', ()=>{ if(running) syncCanvas(); });