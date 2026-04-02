# 쟁반균형게임 Three.js 리마스터 계획

## 목적
SVG + Canvas 2D + CSS 파티클 → Three.js WebGL 전환
- 시각적 업그레이드 (3D 쟁반, 조명, 그림자, PBR 재질)
- 성능 개선 (DOM 파티클 100개+ → GPU 파티클, 오브젝트 풀링)

---

## 파일 구조

```
web/
├── index.html           (수정 - SVG 제거, Three.js 캔버스 추가)
├── style.css            (축소 - 파티클 CSS 제거, UI만 유지)
├── game.js              (기존 게임 로직 유지 + three-renderer 호출)
├── three-renderer.js    (신규 - Three.js 렌더링 전담)
└── sounds/              (변경 없음)

mobile/www/
├── (위와 동일 구조)
└── sounds/              (.ogg 유지)
```

---

## 파일별 역할

### game.js (기존 코드 수정)
유지하는 것:
- 오디오 시스템 (SND 객체, BGM/SFX)
- 물리 엔진 (computeTorque, slideEmojis, 스프링 감쇠)
- 게임 메카닉 (레벨, 점수, 특수 아이템 로직)
- 입력 시스템 (드래그 앤 드롭, 창고 UI)
- UI 오버레이 (시작, 게임오버, 레벨클리어, 리더보드)
- Firebase 연동
- HUD 업데이트

변경하는 것:
- `drawEmojis()` → `renderer.updateEmojis(items)` 호출
- `trayGroup.style.transform = rotateX/Y` → `renderer.setTilt(tiltX, tiltY)`
- `spawnSparkles()` 등 파티클 함수 → `renderer.spawnSparkles(x,y)` 호출
- `syncCanvas()` → `renderer.resize()`
- 좌표 변환: `clientToSvg()` 유지하되 렌더링은 renderer에 위임

### three-renderer.js (신규 생성)
담당하는 것:
- Three.js 씬, 카메라, 조명, 렌더러 초기화
- 3D 쟁반 메시 (CylinderGeometry → 타원 스케일, StandardMaterial)
- 3D 받침대 메시 (기둥 + 베이스)
- 이모지 빌보드 스프라이트 (CanvasTexture, 오브젝트 풀 50개)
- GPU 파티클 시스템 (Points + ShaderMaterial)
- 모든 이펙트 렌더링 (스파클, 폭발, 눈꽃, 컨페티, 골든타임 등)
- 모바일 품질 자동 조절

---

## Three.js로 전환하는 것

| 현재 | Three.js 전환 후 |
|------|-----------------|
| SVG 쟁반 (#trayGroup, 그라디언트) | 3D 메시 (StandardMaterial, roughness/metalness) |
| SVG 받침대 (#standSvg) | 3D Cylinder + 디스크 |
| Canvas 2D 이모지 (drawEmojis) | 빌보드 스프라이트 (CanvasTexture) |
| CSS transform rotateX/Y | trayGroup.rotation.x/z |
| DOM 파티클 23종 (createElement→remove) | GPU Points + ShaderMaterial |
| CSS drop highlight | emissive material 변경 |
| CSS frost overlay | 쟁반 material 셰이더 효과 |
| CSS tray shake (translateX) | 카메라 position 미세 변위 |

## HTML/CSS로 유지하는 것
- HUD (점수, 레벨, 위험도 바)
- 이모지 창고 (floor-shelf, 드래그 소스)
- 시작/게임오버/레벨클리어 오버레이
- 닉네임 입력 + 리더보드 테이블
- 음소거 버튼, 카운트다운 타이머
- 토스트 메시지 (overlap, mystery, golden)
- 골든타임 카운트다운 UI
- 드래그 고스트 (#dragGhost)

## 변경 없이 유지하는 것
- 오디오 시스템
- Firebase 연동
- 게임 물리 수학 (토크, 스프링, 슬라이드)
- 레벨/점수/특수아이템 로직
- 모바일 pause/resume 핸들러

---

## three-renderer.js 주요 API

```javascript
// 초기화
const renderer = new TrayRenderer(document.getElementById('scene'));

// 씬 관리
renderer.resize()                          // 화면 크기 변경
renderer.render()                          // 매 프레임 호출

// 쟁반
renderer.setTilt(tiltX, tiltY)             // 기울기 적용 (degrees)
renderer.setTrayHighlight(on)              // 드롭존 하이라이트
renderer.setGoldenFlash(on)                // 골든타임 섬광
renderer.shakeTray(intensity)              // 위험 시 흔들림

// 이모지
renderer.addEmoji(id, emoji, weight, sx, sy)   // 쟁반에 추가
renderer.removeEmoji(id)                       // 제거
renderer.removeAllEmojis()                     // 전체 제거 (폭탄)
renderer.updateEmojiPositions(items)           // 슬라이드 반영
renderer.setGoldenGlow(on)                     // 골든타임 이모지 발광

// 파티클 이펙트
renderer.spawnSparkles(x, y, color)            // 드래그 꼬리
renderer.spawnDropBurst(x, y)                  // 드롭 폭발
renderer.spawnScoreStars(x, y, count)          // 점수 별
renderer.spawnConfetti(count)                  // 컨페티
renderer.spawnBombCloud(x, y)                  // 폭탄 구름
renderer.spawnIceBurst(x, y)                   // 얼음 폭발
renderer.spawnFrostFlakes()                    // 서리 눈꽃
renderer.clearFrostFlakes()                    // 눈꽃 제거
renderer.spawnMagnetBurst(x, y)                // 자석 파티클
renderer.spawnGoldenBurst(x, y)                // 골든 폭발
renderer.spawnMysteryBurst(x, y)               // 미스터리 폭발
renderer.spawnFallingEmoji(emoji, x, y, vx, vy) // 떨어지는 이모지
```

---

## 3D 씬 설정

### 카메라
- PerspectiveCamera, FOV 45도
- position: (0, 5, 12), lookAt: (0, 0, 0)

### 조명
- AmbientLight: 0xffeedd, intensity 0.6
- DirectionalLight: 0xffffff, intensity 1.2, position(5,10,7), 그림자 ON(데스크톱만)
- RimLight: 0x8899ff, intensity 0.3, position(-4,3,-5)

### 쟁반 메시
- CylinderGeometry(2.28, 2.28, 0.15, 64) → z축 scale 0.474로 타원
- StandardMaterial: color #b07840, roughness 0.7, metalness 0.1
- TorusGeometry로 테두리 림 (color #5a3818)
- receiveShadow: true

### 받침대 메시
- 기둥: CylinderGeometry(0.09, 0.09, 0.8, 16), position.y = -0.8
- 베이스: CylinderGeometry(0.55, 0.55, 0.12, 32), z스케일 0.22

### 이모지 스프라이트
- SpriteMaterial + CanvasTexture (128x128)
- 오브젝트 풀 50개 사전 할당
- depthWrite: false, transparent: true
- SVG→월드 좌표 변환: x=(sx-280)/222*2.28, z=(sy-172)/102*1.08, y=0.08

### GPU 파티클
- BufferGeometry + ShaderMaterial
- attributes: position, velocity, lifetime, size, color
- AdditiveBlending
- setDrawRange(0, activeCount)로 비활성 건너뛰기
- 최대: 데스크톱 1000개, 모바일 500개

---

## 좌표 변환 참조

```
SVG 좌표계:
  ViewBox: 35 45 490 330
  쟁반 중심: (280, 172)
  쟁반 반경: RX=222, RY=102

3D 월드 좌표계:
  쟁반 중심: (0, 0, 0)
  쟁반 반경: RX=2.28, RZ=1.08

변환 공식:
  worldX = (svgX - 280) / 222 * 2.28
  worldZ = (svgY - 172) / 102 * 1.08
  worldY = 0.08 (쟁반 표면 높이)
```

---

## 모바일 최적화

| 설정 | 데스크톱 | 모바일 |
|------|---------|--------|
| Antialias | ON | OFF |
| 그림자 | PCF Soft | OFF |
| Pixel ratio | 2x | 1.5x |
| Render scale | 1.0 | 0.8 |
| 최대 파티클 | 1000 | 500 |

- Capacitor WebView 호환 (WebGL 지원)
- visibilitychange 시 렌더링 루프 정지
- Three.js는 로컬 번들로 포함 (CDN X)
- 빌드: 기존 `npx cap sync` → Android Studio 그대로

---

## 구현 순서

### 1단계: 하이브리드 모드
- three-renderer.js 생성, 씬/카메라/조명 초기화
- 3D 쟁반 + 받침대 렌더링 (기존 SVG 숨김)
- 이모지/파티클은 기존 방식 유지
- 검증: 쟁반 기울기가 기존과 동일한지

### 2단계: 이모지 전환
- Canvas 2D → 빌보드 스프라이트
- dropBounce 애니메이션 3D 적용
- 오브젝트 풀링 구현

### 3단계: 핵심 파티클 전환
- spawnSparkles, spawnDropBurst, spawnScoreStars → GPU 파티클
- DOM 노드 생성 50% 감소 확인

### 4단계: 특수 효과 전환
- BombEffect (폭발 + 구름 + 카메라 흔들림)
- IceEffect (서리 + 눈꽃)
- MagnetEffect, GoldenEffect

### 5단계: 나머지 + 모바일
- confetti, mystery, falling emoji 전환
- 모바일 품질 설정 적용
- Capacitor WebView 테스트

### 6단계: 정리
- style.css에서 파티클 keyframe 제거
- 미사용 SVG 코드 제거
- mobile/www에 동일 적용

---

## 예상 성능 개선

| 지표 | 현재 | Three.js 후 |
|------|------|------------|
| 피크 DOM 노드 | 100~150개 | 5~10개 |
| Paint 연산/초 | 60~120회 | 1~2회 |
| 파티클 메모리 | 5~8MB | 1~2MB |
| 프레임 시간 | 6~12ms | 3~6ms |
| 모바일 FPS | 20~40 | 30~60 |

---

## 기존 코드 참조 (game.js 핵심 상수)

```javascript
// 쟁반 좌표
const VB_X=35, VB_Y=45, SVG_W=490, SVG_H=330;
const TRAY_CX=280, TRAY_CY=172, TRAY_RX=222, TRAY_RY=102;

// 물리
const SLIDE_THRESHOLD=0.15, SLIDE_SPEED=0.35, DANGER_WARN=0.65;
const OVERLAP_RADIUS=35, MAX_OVERLAP=2, DROP_ANIM_DUR=500;

// 타이머
const AUTO_DROP_DELAY=10000/5000, ICE_DURATION=5000, GOLDEN_DURATION=10000;

// 스파클 색상
const SPARKLE_COLORS=['#FFD700','#FF6B35','#FF4444','#FF69B4','#00E5FF','#76FF03','#FFFFFF'];

// 레벨
const LEVELS = [
  { goal:100,   tiltLimit:46, maxWeight:1.0,  giantRate:0    },
  { goal:500,   tiltLimit:38, maxWeight:2.0,  giantRate:0    },
  { goal:1000,  tiltLimit:32, maxWeight:3.0,  giantRate:0.05 },
  { goal:5000,  tiltLimit:32, maxWeight:5.0,  giantRate:0.10 },
  { goal:10000, tiltLimit:30, maxWeight:7.0,  giantRate:0.12 },
  { goal:Infinity, tiltLimit:28, maxWeight:10, giantRate:0.15 },
];
```
