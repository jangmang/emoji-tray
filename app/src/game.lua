-- src/game.lua  ─  게임 상태 머신 + 모든 게임 로직
local emojis    = require("src.emojis")
local effects   = require("src.effects")
local firestore = require("src.firestore")

local Game = {}

-- ── 레이아웃 상수 (가상 해상도 540×960 기준) ────────────────
local VW, VH = 540, 960

-- 쟁반
local TRAY_CX = 270   -- 쟁반 중심 X
local TRAY_CY = 370   -- 쟁반 중심 Y
local TRAY_RX = 200   -- 아이템 배치 반경 (픽셀)
local TRAY_RY = 92

-- 물리
local OVERLAP_R       = 31    -- 겹침 체크 반경
local MAX_OVERLAP     = 2
local SLIDE_THRESHOLD = 0.15
local SLIDE_SPEED     = 0.35
local DROP_ANIM_DUR   = 0.5
local DANGER_WARN     = 0.65
local ICE_DURATION    = 5.0
local GOLDEN_DURATION = 5.0

-- 창고 레이아웃
local FLOOR_TOP  = 635
local FLOOR_COLS = 5
local FLOOR_ROWS = 2
local CELL_W, CELL_H   -- load() 에서 계산

-- 레벨 설정
local LEVELS = {
    {goal=100,   autoDrop=10, tiltLimit=46, maxWeight=1.0, giantRate=0   },
    {goal=300,   autoDrop=10, tiltLimit=38, maxWeight=2.0, giantRate=0   },
    {goal=600,   autoDrop=10, tiltLimit=32, maxWeight=3.0, giantRate=0.05},
    {goal=1000,  autoDrop=5,  tiltLimit=32, maxWeight=5.0, giantRate=0.10},
    {goal=1e9,   autoDrop=5,  tiltLimit=32, maxWeight=10,  giantRate=0.15},
}

-- ── 게임 상태 ─────────────────────────────────────────────
local state   -- "start"|"playing"|"levelclear"|"allclear"|"gameover"
local level, score, best
local tiltX, tiltY
local cfg            -- 현재 레벨 설정
local items          -- [{x,y,e,w,dropT}]  (x,y = 쟁반 중심 기준 오프셋)
local floorItems     -- [{e,w,special,mystery,golden,giant,col,row}]
local dragging       -- nil | {data={e,w,...}, gx, gy}
local frozen, frozenTimer
local goldenTime, goldenTimer
local autoDropTimer
local shakeTimer     -- 화면 흔들림 잔여 시간
local lcTimer        -- 레벨클리어 카운트다운
local running

-- 이펙트 컨테이너
local particles, falling, confetti, frostFlakes

-- 자석 에니메이션 대기열
local magnetAnims    -- [{items, steps}]

-- Firestore / 게임오버 상태
local lbState        -- "idle"|"loading"|"loaded"
local leaderboard
local topTen
local nickname
local nicknameActive
local saveRequested

-- ── 헬퍼 ─────────────────────────────────────────────────
local function isOnTray(x, y)
    local dx = (x - TRAY_CX) / TRAY_RX
    local dy = (y - TRAY_CY) / TRAY_RY
    return dx*dx + dy*dy <= 1.0
end

local function countNearby(ix, iy)
    local n = 0
    for _, it in ipairs(items) do
        local dx, dy = it.x - ix, it.y - iy
        if math.sqrt(dx*dx + dy*dy) < OVERLAP_R then n = n + 1 end
    end
    return n
end

local function computeTorque()
    local tx, ty = 0, 0
    for _, it in ipairs(items) do
        tx = tx + (it.x / TRAY_RX) * it.w
        ty = ty + (it.y / TRAY_RY) * it.w
    end
    return tx, ty
end

local function floorCellCenter(col, row)
    return col * CELL_W + CELL_W * 0.5,
           FLOOR_TOP + row * CELL_H + CELL_H * 0.5
end

local function hitFloorItem(x, y)
    for _, fi in ipairs(floorItems) do
        local fx, fy = floorCellCenter(fi.col, fi.row)
        if math.abs(x - fx) < CELL_W * 0.5 and math.abs(y - fy) < CELL_H * 0.5 then
            return fi
        end
    end
    return nil
end

local function saveBest()
    love.filesystem.write("best.dat", tostring(best))
end

-- ── 창고 관리 ─────────────────────────────────────────────
local function randomFloorData()
    return emojis.randED(cfg.maxWeight, cfg.giantRate, level, goldenTime)
end

local function initFloor()
    floorItems = {}
    for row = 0, FLOOR_ROWS - 1 do
        for col = 0, FLOOR_COLS - 1 do
            local d = randomFloorData()
            floorItems[#floorItems+1] = {
                e=d.e, w=d.w,
                special=d.special, mystery=d.mystery,
                golden=d.golden,   giant=(d.w >= 10),
                col=col, row=row,
            }
        end
    end
end

local function replaceFloor(fi)
    local d = randomFloorData()
    fi.e=d.e; fi.w=d.w
    fi.special=d.special; fi.mystery=d.mystery
    fi.golden=d.golden;   fi.giant=(d.w >= 10)
end

local function convertFloorGolden()
    for _, fi in ipairs(floorItems) do
        fi.e="⭐"; fi.w=0; fi.special=true; fi.golden=true
        fi.mystery=false;  fi.giant=false
    end
end

local function restoreFloor()
    for _, fi in ipairs(floorItems) do
        replaceFloor(fi)
    end
end

-- ── 특수 효과 발동 ────────────────────────────────────────
local function bombExplode()
    for _, it in ipairs(items) do
        effects.spawnFallingEmoji(falling, TRAY_CX+it.x, TRAY_CY+it.y, it.e, it.w, tiltX, tiltY)
    end
    items = {}
    tiltX, tiltY = 0, 0
    effects.spawnBombBurst(particles, TRAY_CX, TRAY_CY)
    shakeTimer = 0.5
end

local function iceFreeze()
    frozen = true
    frozenTimer = ICE_DURATION
    frostFlakes = effects.spawnFrostFlakes({}, TRAY_CX, TRAY_CY, TRAY_RX, TRAY_RY)
    effects.spawnIceBurst(particles, TRAY_CX, TRAY_CY)
end

local function magnetPull(ix, iy)
    local radius = math.max(TRAY_RX, TRAY_RY) / 3
    local targets = {}
    for _, it in ipairs(items) do
        local dx, dy = ix - it.x, iy - it.y
        if math.sqrt(dx*dx + dy*dy) <= radius then
            targets[#targets+1] = it
        end
    end
    if #targets > 0 then
        magnetAnims[#magnetAnims+1] = {targets=targets, tx=ix, ty=iy, steps=15}
    end
    effects.spawnMagnetBurst(particles, TRAY_CX+ix, TRAY_CY+iy)
end

local function starGoldenTime()
    goldenTime  = true
    goldenTimer = GOLDEN_DURATION
    convertFloorGolden()
    effects.spawnGoldenBurst(particles, TRAY_CX, TRAY_CY)
end

local function endGoldenTime()
    goldenTime  = false
    goldenTimer = nil
    restoreFloor()
end

local function activateMystery(ix, iy)
    local choices = {"💣","🧊","🧲","⭐"}
    local choice  = choices[math.random(#choices)]
    effects.spawnMysteryBurst(particles, TRAY_CX+ix, TRAY_CY+iy)
    effects.spawnMysteryToast(particles, TRAY_CX+ix, TRAY_CY+iy-50, choice,
        ({["💣"]="폭탄",["🧊"]="얼음",["🧲"]="자석",["⭐"]="골든타임"})[choice])
    if     choice == "💣" then bombExplode()
    elseif choice == "🧊" then iceFreeze()
    elseif choice == "🧲" then magnetPull(ix, iy)
    elseif choice == "⭐" then starGoldenTime()
    end
end

-- ── 드롭 ─────────────────────────────────────────────────
local function tryDrop(x, y, data)
    if not isOnTray(x, y) then return false end

    local ix = x - TRAY_CX
    local iy = y - TRAY_CY

    local isSpecial = data.special or data.mystery or data.golden
    if not isSpecial and countNearby(ix, iy) >= MAX_OVERLAP then
        effects.spawnToast(particles, x, y - 40, "⚠ 3개 이상 놓을 수 없어요!")
        return false
    end

    if data.mystery then
        activateMystery(ix, iy)
        return true
    end
    if data.e == "💣" then bombExplode(); return true end
    if data.e == "🧊" then iceFreeze();   return true end
    if data.e == "🧲" then magnetPull(ix, iy); return true end

    if data.golden then
        score = score + 100
        effects.spawnDropBurst(particles, x, y)
        effects.spawnScoreStars(particles, x, y, 100)
        autoDropTimer = cfg.autoDrop
        return true
    end

    if data.e == "⭐" and data.special then
        starGoldenTime()
        return true
    end

    -- 일반 이모지 드롭
    local pts = emojis.toPoints(data.w)
    items[#items+1] = {x=ix, y=iy, e=data.e, w=data.w, dropT=0}
    score = score + pts
    effects.spawnDropBurst(particles, x, y)
    effects.spawnScoreStars(particles, x, y, pts)
    autoDropTimer = cfg.autoDrop
    return true
end

-- ── 자동 드롭 ─────────────────────────────────────────────
local function autoDrop()
    if dragging then return end
    local normal = {}
    for _, fi in ipairs(floorItems) do
        if not fi.special and fi.w < 10 then normal[#normal+1] = fi end
    end
    if #normal == 0 then return end

    local fi = normal[math.random(#normal)]
    local sx, sy
    for _ = 1, 20 do
        local a = math.random() * math.pi * 2
        local r = math.sqrt(math.random()) * 0.75
        sx = math.cos(a) * TRAY_RX * r
        sy = math.sin(a) * TRAY_RY * r
        if countNearby(sx, sy) < MAX_OVERLAP then break end
    end

    items[#items+1] = {x=sx, y=sy, e=fi.e, w=fi.w, dropT=0}
    score = score + emojis.toPoints(fi.w)
    effects.spawnDropBurst(particles, TRAY_CX+sx, TRAY_CY+sy)
    effects.spawnScoreStars(particles, TRAY_CX+sx, TRAY_CY+sy, emojis.toPoints(fi.w))
    replaceFloor(fi)
    autoDropTimer = cfg.autoDrop
end

-- ── 슬라이딩 ──────────────────────────────────────────────
local function slideEmojis(danger)
    if danger < SLIDE_THRESHOLD then return end
    local sf    = (danger - SLIDE_THRESHOLD) / (1 - SLIDE_THRESHOLD)
    local force = sf * sf * SLIDE_SPEED
    local mag   = math.sqrt(tiltX^2 + tiltY^2)
    if mag == 0 then return end
    local dirX = tiltY / mag
    local dirY = tiltX / mag

    for i = #items, 1, -1 do
        local it = items[i]
        it.x = it.x + dirX * force * TRAY_RX * 0.02
        it.y = it.y + dirY * force * TRAY_RY * 0.02
        local dx = it.x / TRAY_RX
        local dy = it.y / TRAY_RY
        if dx*dx + dy*dy > 1.05 then
            effects.spawnFallingEmoji(falling, TRAY_CX+it.x, TRAY_CY+it.y, it.e, it.w, tiltX, tiltY)
            table.remove(items, i)
        end
    end
end

-- ── 레벨 클리어 / 게임 오버 ───────────────────────────────
local function triggerGameOver()
    running = false
    state   = "gameover"

    if score > best then best = score; saveBest() end

    -- 쟁반 뒤집힘 이펙트
    for _, it in ipairs(items) do
        effects.spawnFallingEmoji(falling, TRAY_CX+it.x, TRAY_CY+it.y, it.e, it.w, tiltX, tiltY)
    end
    items = {}

    lbState   = "loading"
    leaderboard = {}
    topTen    = false
    firestore.loadLeaderboard()
end

local function nextLevel()
    level = level + 1
    if level > #LEVELS then level = #LEVELS end
    cfg = LEVELS[level]
    items = {}
    tiltX, tiltY = 0, 0
    frozen = false; frozenTimer = nil
    goldenTime = false; goldenTimer = nil
    frostFlakes = {}
    magnetAnims = {}
    autoDropTimer = cfg.autoDrop
    initFloor()
    state   = "playing"
    running = true
end

local function levelClear()
    running = false
    if level >= #LEVELS then
        state   = "allclear"
        lcTimer = 3.0
    else
        state   = "levelclear"
        lcTimer = 3.0
    end
    effects.spawnConfetti(confetti, VW, VH)
end

-- ── 게임 초기화 ────────────────────────────────────────────
local function startGame()
    level  = 1
    score  = 0
    tiltX, tiltY = 0, 0
    frozen = false; frozenTimer = nil
    goldenTime = false; goldenTimer = nil
    frostFlakes = {}
    magnetAnims = {}
    items   = {}
    dragging = nil
    particles = {}; falling = {}; confetti = {}
    shakeTimer = 0
    running    = true
    cfg        = LEVELS[level]
    autoDropTimer = cfg.autoDrop
    initFloor()
    state = "playing"
end

-- ── 공개 API ──────────────────────────────────────────────
function Game.load(vw, vh)
    VW, VH  = vw, vh
    CELL_W  = VW / FLOOR_COLS          -- 108
    CELL_H  = (VH - FLOOR_TOP) / FLOOR_ROWS  -- 162.5

    -- 저장된 베스트 로드
    local bs = love.filesystem.read("best.dat")
    best = bs and tonumber(bs) or 0

    -- Firestore 스레드 시작
    firestore.init()

    particles   = {}
    falling     = {}
    confetti    = {}
    frostFlakes = {}
    magnetAnims = {}

    nickname     = ""
    nicknameActive = false
    saveRequested  = false
    lbState        = "idle"
    leaderboard    = {}

    state = "start"
end

function Game.update(dt)
    -- Firestore 응답 폴링
    local resp = firestore.poll()
    if resp then
        if resp.type == "leaderboard" then
            leaderboard = resp.data or {}
            lbState     = "loaded"
            topTen      = firestore.isTopTen(score, leaderboard)
            nicknameActive = topTen and score > 0
        end
    end

    -- 이펙트 업데이트
    effects.update(dt, particles, falling, confetti, frostFlakes)

    -- 자석 에니메이션
    for i = #magnetAnims, 1, -1 do
        local ma = magnetAnims[i]
        ma.steps = ma.steps - 1
        for _, it in ipairs(ma.targets) do
            it.x = it.x + (ma.tx - it.x) * 0.15
            it.y = it.y + (ma.ty - it.y) * 0.15
        end
        if ma.steps <= 0 then table.remove(magnetAnims, i) end
    end

    if state == "playing" and running then
        -- 자동 드롭 타이머
        autoDropTimer = autoDropTimer - dt
        if autoDropTimer <= 0 then
            autoDrop()
            autoDropTimer = cfg.autoDrop
        end

        -- 얼음 타이머
        if frozenTimer then
            frozenTimer = frozenTimer - dt
            if frozenTimer <= 0 then
                frozen      = false
                frozenTimer = nil
                frostFlakes = {}
            end
        end

        -- 골든타임 타이머
        if goldenTimer then
            goldenTimer = goldenTimer - dt
            if goldenTimer <= 0 then endGoldenTime() end
        end

        -- 흔들림 타이머
        if shakeTimer > 0 then shakeTimer = shakeTimer - dt end

        -- 물리
        if not frozen then
            local torqueX, torqueY = computeTorque()
            tiltX = tiltX + (torqueY * 4 - tiltX) * 0.08
            tiltY = tiltY + (torqueX * 6 - tiltY) * 0.08

            local mag    = math.sqrt(tiltX^2 + tiltY^2)
            local danger = math.min(1, mag / cfg.tiltLimit)

            if mag >= cfg.tiltLimit then
                triggerGameOver()
                return
            end

            slideEmojis(danger)

            if danger > DANGER_WARN then
                shakeTimer = math.max(shakeTimer, 0.15)
            end
        end

        -- 드롭 애니메이션 진행
        for _, it in ipairs(items) do
            if it.dropT < DROP_ANIM_DUR then
                it.dropT = it.dropT + dt
            end
        end

        -- 레벨 클리어 판정
        if score >= cfg.goal then
            levelClear()
            return
        end
    end

    -- 레벨 클리어 카운트다운
    if state == "levelclear" or state == "allclear" then
        lcTimer = lcTimer - dt
        if lcTimer <= 0 then
            if state == "allclear" then
                -- All Clear → 게임오버 화면으로 (랭킹 등록)
                state = "gameover"
                if score > best then best = score; saveBest() end
                lbState = "loading"
                firestore.loadLeaderboard()
            else
                nextLevel()
            end
        end
    end
end

function Game.draw()
    require("src.renderer").draw(
        state, level, score, best, cfg,
        tiltX, tiltY, frozen, frozenTimer, goldenTime,
        items, floorItems, dragging,
        particles, falling, confetti, frostFlakes,
        autoDropTimer, shakeTimer,
        lbState, leaderboard, topTen,
        nickname, nicknameActive,
        lcTimer
    )
end

-- ── 입력 처리 ─────────────────────────────────────────────
function Game.press(id, x, y)
    if state == "start" then
        -- 시작 버튼 히트 테스트 (renderer 와 좌표 맞춰야 함)
        local bx, by, bw, bh = VW/2-120, 490, 240, 64
        if x >= bx and x <= bx+bw and y >= by and y <= by+bh then
            startGame()
        end
        return
    end

    if state == "gameover" then
        -- 닉네임 저장 버튼
        local R = require("src.renderer")
        if nicknameActive then
            -- 저장 버튼
            if R.hitTest(x, y, "goSave") then
                if #nickname > 0 then
                    firestore.saveScore(nickname, score)
                    saveRequested  = true
                    nicknameActive = false
                end
            end
            -- 건너뛰기 버튼
            if R.hitTest(x, y, "goSkip") then
                nicknameActive = false
            end
        end
        -- 다시 도전 버튼
        if R.hitTest(x, y, "goRetry") then
            startGame()
        end
        return
    end

    if state == "levelclear" or state == "allclear" then
        return  -- 화면 터치 무시
    end

    if state == "playing" and running then
        local fi = hitFloorItem(x, y)
        if fi then
            dragging = {data=fi, gx=x, gy=y, src=fi}
        end
    end
end

function Game.move(id, x, y)
    if dragging then
        dragging.gx = x
        dragging.gy = y
        if dragging.gx and effects.spawnSparkle then
            effects.spawnSparkle(particles, x, y)
        end
    end
end

function Game.release(id, x, y)
    if not dragging then return end
    if state == "playing" and running then
        local dropped = tryDrop(x, y, dragging.data)
        if dropped then
            replaceFloor(dragging.src)
        end
    end
    dragging = nil
end

-- ── 키보드 (닉네임 입력) ──────────────────────────────────
function Game.textinput(t)
    if not nicknameActive then return end
    if #nickname < 8 then
        nickname = nickname .. t
    end
end

function Game.backspace()
    if not nicknameActive then return end
    if #nickname > 0 then
        -- UTF-8 에서 마지막 문자 제거
        local bytes = {nickname:byte(1, -1)}
        local i = #bytes
        while i > 0 and (bytes[i] >= 0x80 and bytes[i] < 0xC0) do i = i - 1 end
        nickname = nickname:sub(1, i - 1)
    end
end

function Game.confirm()
    if nicknameActive and #nickname > 0 then
        firestore.saveScore(nickname, score)
        saveRequested  = true
        nicknameActive = false
    end
end

function Game.escape()
    if state == "gameover" then
        nicknameActive = false
    end
end

-- ── 외부에서 읽을 수 있는 상태 값 ─────────────────────────
function Game.getTiltXY()  return tiltX, tiltY end
function Game.getDanger()
    if not cfg then return 0 end
    local mag = math.sqrt(tiltX^2 + tiltY^2)
    return math.min(1, mag / cfg.tiltLimit)
end

return Game
