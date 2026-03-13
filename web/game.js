// ── 이모지 데이터 ──────────────────────────────────────
const EMOJI_DATA = [
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
  {e:'⭐',w:0}, // 별: 골든타임 (창고 전체 별 변환, 100점)
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
  { goal:100,  autoDrop:10000, floorCount:10, tiltLimit:46,   maxWeight:1.0, giantRate:0    },
  { goal:300,  autoDrop:10000, floorCount:10, tiltLimit:38,   maxWeight:2.0, giantRate:0    },
  { goal:600,  autoDrop:10000, floorCount:10, tiltLimit:32, maxWeight:3.0, giantRate:0.05 },
  { goal:1000, autoDrop:5000,  floorCount:10, tiltLimit:32, maxWeight:5.0, giantRate:0.10 },
  { goal:Infinity, autoDrop:5000, floorCount:10, tiltLimit:32, maxWeight:10,  giantRate:0.15 },
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
let items=[], tiltX=0, tiltY=0, running=false, rafId=null, shakeTimer=0;
let frozen=false, frozenTimer=null;
let goldenTime=false, goldenTimer=null, savedFloorData=[];
let score=0, best = parseInt(localStorage.getItem('trayBest5')||'0');
let floorItems=[], nextId=0, dragging=null;

function toPoints(w){ return Math.round(w * 10); }

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
  return Math.round(base * (1 + t * 3.5));
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
  let d = randED();
  // 골든타임 중이면 새 아이템도 별로 변환
  if(goldenTime) {
    savedFloorData.push({e:d.e, w:d.w, special:d.special});
    d = {...GOLDEN_DATA};
  }
  const id = nextId++;
  const el = document.createElement('div');
  const isStar = d.e === '⭐' && d.special;
  el.className = 'e-chip' + (d.w>=10?' giant':'') + (d.special?' special':'') + ((d.golden||isStar)?' golden':'') + (d.mystery?' mystery':'');
  el.dataset.id = id;
  const emojiSpan = document.createTextNode(d.e);
  el.appendChild(emojiSpan);
  const badge = document.createElement('span');
  badge.className = 'pts';
  badge.textContent = d.golden ? '100' : d.mystery ? '?' : (d.special ? '★' : toPoints(d.w));
  el.appendChild(badge);
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

// ── 드래그 ─────────────────────────────────────────────
function startDrag(e, data, sourceEl) {
  if(!running) return; e.preventDefault();
  dragging={data,sourceEl};
  sourceEl.classList.add('dragging');
  ghost.textContent = data.e;
  ghost.style.fontSize = data.w>=10 ? '3.6rem' : '2.4rem';
  ghost.style.display = 'block';
  moveGhost(e.clientX, e.clientY);
}
function startDragTouch(e, data, sourceEl) {
  if(!running) return; e.preventDefault();
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
    mysteryActivate(cx, cy, sv.x, sv.y);
    return true;
  }
  // 폭탄: 쟁반에 추가하지 않고 바로 폭발
  if(dragging.data.e === '💣') {
    removeFloorItem(dragging.sourceEl);
    bombExplode();
    return true;
  }
  // 얼음: 쟁반에 추가하지 않고 동결 효과
  if(dragging.data.e === '🧊') {
    removeFloorItem(dragging.sourceEl);
    iceFreeze(cx, cy);
    return true;
  }
  // 자석: 쟁반에 추가하지 않고 주변 이모지 끌어당기기
  if(dragging.data.e === '🧲') {
    removeFloorItem(dragging.sourceEl);
    magnetPull(sv.x, sv.y, cx, cy);
    return true;
  }
  // 골든타임 별: 쟁반에 남지 않고 100점 획득 (골든타임 발동보다 먼저 체크)
  if(dragging.data.golden) {
    score += 100;
    removeFloorItem(dragging.sourceEl);
    spawnDropBurst(cx, cy);
    spawnScoreStars(cx, cy, 100);
    lastDropTime = performance.now();
    return true;
  }
  // 별: 쟁반에 추가하지 않고 골든타임 발동
  if(dragging.data.e === '⭐') {
    removeFloorItem(dragging.sourceEl);
    starGoldenTime(cx, cy);
    return true;
  }
  items.push({sx:sv.x, sy:sv.y, e:dragging.data.e, w:dragging.data.w, dropT:performance.now()});
  score += toPoints(dragging.data.w);
  removeFloorItem(dragging.sourceEl);
  spawnDropBurst(cx, cy);
  spawnScoreStars(cx, cy, toPoints(dragging.data.w));
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

// ── 별 골든타임: 5초간 창고 전체 별 변환 ─────────────────
const GOLDEN_DURATION = 5000;
const GOLDEN_DATA = {e:'⭐', w:0, special:true, golden:true};

function starGoldenTime(screenCx, screenCy) {
  // 이미 골든타임 중이면 타이머 리셋
  if(goldenTimer) { clearTimeout(goldenTimer); }

  goldenTime = true;

  // 별 퍼지기 이펙트
  spawnGoldenBurst(screenCx, screenCy);

  // 현재 창고 데이터 저장 후 골든 별로 재구성
  savedFloorData = floorItems.map(f => ({e:f.e, w:f.w, special:f.special}));
  rebuildFloorGolden();

  // 창고 골든 테두리
  floorShelf.classList.add('golden-time');

  // 자동드롭 타이머 리셋 (골든타임 동안 여유 확보)
  lastDropTime = performance.now();

  // 5초 후 해제
  goldenTimer = setTimeout(() => {
    endGoldenTime();
  }, GOLDEN_DURATION);
}

function rebuildFloorGolden() {
  floorShelf.innerHTML = ''; floorItems = [];
  const count = FLOOR_COUNT;
  for(let i = 0; i < count; i++) {
    const d = {e:'⭐', w:0, special:true, golden:true};
    const id = nextId++;
    const el = document.createElement('div');
    el.className = 'e-chip special golden';
    el.dataset.id = id;
    el.appendChild(document.createTextNode('⭐'));
    const badge = document.createElement('span');
    badge.className = 'pts';
    badge.textContent = '100';
    el.appendChild(badge);
    el.addEventListener('mousedown', ev => startDrag(ev, d, el));
    el.addEventListener('touchstart', ev => startDragTouch(ev, d, el), {passive:false});
    floorShelf.appendChild(el);
    floorItems.push({...d, id, el});
  }
}

function endGoldenTime() {
  goldenTime = false;
  goldenTimer = null;
  floorShelf.classList.remove('golden-time');

  // 창고를 일반 이모지로 재구성
  floorShelf.innerHTML = ''; floorItems = [];
  for(let i = 0; i < FLOOR_COUNT; i++) {
    addFloorItem();
  }
  savedFloorData = [];
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
  items.forEach(it=>{
    const fs = emojiSize(it.w);
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
    ctx.shadowColor='rgba(0,0,0,.6)';
    ctx.shadowBlur=Math.max(6,fs*.22);
    ctx.shadowOffsetY=Math.max(2,fs*.07);
    ctx.fillText(it.e, 0, 0);
    ctx.restore();
  });
}

// ── 게임 루프 ──────────────────────────────────────────
function init() {
  syncCanvas();
  level = 1;
  applyLevel(level);
  items=[]; tiltX=0; tiltY=0; shakeTimer=0; score=0; running=true; lastDropTime=performance.now();
  frozen=false; if(frozenTimer){clearTimeout(frozenTimer);frozenTimer=null;}
  frostFlakes.forEach(el=>el.remove()); frostFlakes=[];
  document.getElementById('frostOverlay').classList.remove('active');
  goldenTime=false; if(goldenTimer){clearTimeout(goldenTimer);goldenTimer=null;}
  savedFloorData=[]; floorShelf.classList.remove('golden-time');
  startOverlay.style.display='none';
  goOverlay.classList.remove('show');
  document.getElementById('levelClearOverlay').classList.remove('show');
  document.body.classList.remove('no-scroll');
  trayGroup.style.transition='';
  trayGroup.style.transform='';
  initFloor(); updateHUD(0,0);
  if(rafId) cancelAnimationFrame(rafId);
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
      // 화면에서 떨어지는 애니메이션
      spawnFallingEmoji(it);
      items.splice(i, 1);
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
  if(!running || dragging || floorItems.length===0) return;
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
  score += toPoints(fi.w);
  // 드롭 위치를 화면 좌표로 변환해서 반짝이 효과
  const sc = svgToScene(sx, sy);
  const sceneRect = scene.getBoundingClientRect();
  spawnDropBurst(sceneRect.left + sc.x, sceneRect.top + sc.y);
  spawnScoreStars(sceneRect.left + sc.x, sceneRect.top + sc.y, toPoints(fi.w));
  removeFloorItem(fi.el);
  lastDropTime = performance.now();
}

function updateCountdown() {
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
  if(!running) return;
  // 자동 드롭 체크
  if(performance.now() - lastDropTime > AUTO_DROP_DELAY) autoDrop();

  let danger = 0;
  if(frozen) {
    // 동결 중: 기울기 변화 없음, 미끄러짐 없음, 게임오버 없음
    trayGroup.style.transform = `rotateX(${-tiltX}deg) rotateY(${tiltY}deg)`;
    const mag = Math.sqrt(tiltX**2+tiltY**2);
    danger = Math.min(1, mag/TILT_LIMIT);
  } else {
    const {tx,ty} = computeTorque();
    tiltX += (ty*4  - tiltX) * .08;
    tiltY += (tx*6  - tiltY) * .08;

    const clX = Math.max(-TILT_LIMIT*1.1, Math.min(TILT_LIMIT*1.1, tiltX));
    const clY = Math.max(-TILT_LIMIT*1.1, Math.min(TILT_LIMIT*1.1, tiltY));
    trayGroup.style.transform = `rotateX(${-clX}deg) rotateY(${clY}deg)`;

    const mag = Math.sqrt(tiltX**2+tiltY**2);
    danger = Math.min(1, mag/TILT_LIMIT);

    if(mag >= TILT_LIMIT){ gameOver(); return; }

    // 이모지 미끄러짐 처리
    slideEmojis(danger);
  }

  updateHUD(score, danger);
  updateCountdown();
  drawEmojis();

  // 레벨 클리어 판정
  if(score >= currentGoal) { levelClear(); return; }

  if(!frozen && danger > DANGER_WARN){
    shakeTimer++;
    if(shakeTimer%6<3) trayGroup.style.transform += ` translateX(${(Math.random()-.5)*5}px)`;
  } else { shakeTimer=0; }

  rafId = requestAnimationFrame(loop);
}

// ── HUD 업데이트 ────────────────────────────────────────
function updateHUD(sc, danger) {
  const pct = Math.round(danger*100);
  document.getElementById('countVal').textContent = sc;
  document.getElementById('levelVal').textContent = level;
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
}

// ── 레벨 클리어 ─────────────────────────────────────────
function levelClear() {
  running = false;
  cancelAnimationFrame(rafId);
  countdownTimer.classList.remove('active');

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
      lcOverlay.classList.remove('show');
      document.body.classList.remove('no-scroll');
      // 다음 레벨 시작
      level++;
      applyLevel(level);
      items = [];
      tiltX = 0; tiltY = 0; shakeTimer = 0;
      frozen=false; if(frozenTimer){clearTimeout(frozenTimer);frozenTimer=null;}
      frostFlakes.forEach(el=>el.remove()); frostFlakes=[];
      document.getElementById('frostOverlay').classList.remove('active');
      goldenTime=false; if(goldenTimer){clearTimeout(goldenTimer);goldenTimer=null;}
      savedFloorData=[]; floorShelf.classList.remove('golden-time');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      trayGroup.style.transition = '';
      trayGroup.style.transform = '';
      lastDropTime = performance.now();
      initFloor();
      running = true;
      loop();
    }
  }, 1000);
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
    if(goLevelBadge) goLevelBadge.textContent = 'Level ' + level;
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
      document.getElementById('goNickInput').focus();
    } else {
      document.querySelector('.go-emoji').textContent = '💥';
      document.querySelector('.go-title').textContent = '쏟아졌다!';
      if(goSubTitle) goSubTitle.textContent = 'Level ' + level + '에서 실패';
      const board = await loadLeaderboard();
      renderLeaderboard(board, finalScore, '');
      lbArea.classList.add('show');
      retryBtn.style.display = '';
    }
    goOverlay.classList.add('show');
    document.body.classList.add('no-scroll');
  })();
}

// ── 게임오버 ───────────────────────────────────────────
function gameOver() {
  running=false; cancelAnimationFrame(rafId);
  countdownTimer.classList.remove('active');

  // 1. 캔버스의 이모지를 즉시 지움 (쟁반 위 이모지 제거)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. 쟁반 뒤집기
  trayGroup.style.transition='transform .65s cubic-bezier(.4,0,.6,1)';
  trayGroup.style.transform='rotateX(180deg) rotateY(18deg)';

  // 3. 이모지를 실제 화면 위치에서 물리 기반으로 떨어뜨리기
  //    기울기 방향으로 초기 속도 부여
  const sceneRect = scene.getBoundingClientRect();
  const flipDirX = tiltY > 0 ? 1 : -1; // rotateY → 좌우 방향
  const flipDirY = tiltX > 0 ? 1 : -1; // rotateX → 앞뒤 방향

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

// ── 이벤트 ─────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', init);

// 닉네임 저장
document.getElementById('goNickSave').addEventListener('click', async ()=>{
  const input = document.getElementById('goNickInput');
  const name = input.value.trim();
  if(!name) { input.focus(); return; }

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

// Enter 키로도 닉네임 저장
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

document.getElementById('retryBtn').addEventListener('click', ()=>{
  // 낙하 중인 이모지 제거
  document.querySelectorAll('.falling-emoji').forEach(el=>el.remove());
  // 랭킹 UI 초기화
  document.getElementById('goNickname').classList.remove('show');
  document.getElementById('goLeaderboard').classList.remove('show');
  document.getElementById('retryBtn').style.display = '';
  init();
});
window.addEventListener('resize', ()=>{ if(running) syncCanvas(); });