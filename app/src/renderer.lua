-- src/renderer.lua  ─  모든 렌더링 담당
local emojis  = require("src.emojis")
local effects = require("src.effects")

-- Lua 5.1 / 5.2+ 호환
local unpack = unpack or table.unpack

local R = {}

-- ── 상수 ─────────────────────────────────────────────────
local VW, VH = 540, 960

local TRAY_CX = 270
local TRAY_CY = 370
local TRAY_RX = 200
local TRAY_RY = 92
local TRAY_VRX = 215   -- 시각적 반경 (테두리 포함)
local TRAY_VRY = 105

local FLOOR_TOP  = 635
local FLOOR_COLS = 5
local FLOOR_ROWS = 2
local CELL_W     = VW / FLOOR_COLS    -- 108
local CELL_H     = (VH - FLOOR_TOP) / FLOOR_ROWS  -- 162.5

local DROP_ANIM_DUR = 0.5

-- 색상
local COL_BG      = {0.102, 0.071, 0.031}
local COL_ACCENT  = {0.957, 0.647, 0.208}
local COL_WOOD    = {0.54,  0.37,  0.14}
local COL_WOOD_D  = {0.38,  0.24,  0.07}
local COL_STAND   = {0.30,  0.18,  0.05}
local COL_HUD_BG  = {0.15,  0.10,  0.04}
local COL_WHITE   = {1, 1, 1}
local COL_SCORE   = {1.0,   0.87,  0.2}
local COL_DANGER  = {0.91,  0.25,  0.25}
local COL_GREEN   = {0.25,  0.78,  0.43}
local COL_YELLOW  = {0.957, 0.647, 0.208}
local COL_RED     = {0.91,  0.25,  0.25}
local COL_FLOOR   = {0.12,  0.08,  0.03}

-- ── 폰트 캐시 ─────────────────────────────────────────────
local emojiCache = {}   -- size → Font
local uiCache    = {}   -- size → Font
local emojiPath  = "assets/fonts/NotoColorEmoji.ttf"
local uiPath     = "assets/fonts/NotoSansKR-Regular.ttf"

function R.getEmojiFont(size)
    size = math.max(8, math.floor(size))
    if not emojiCache[size] then
        local ok, f = pcall(love.graphics.newFont, emojiPath, size)
        if not ok then
            f = love.graphics.newFont(size)
        end
        emojiCache[size] = f
    end
    return emojiCache[size]
end

function R.getUIFont(size)
    size = math.max(8, math.floor(size))
    if not uiCache[size] then
        local ok, f = pcall(love.graphics.newFont, uiPath, size)
        if not ok then
            f = love.graphics.newFont(size)
        end
        uiCache[size] = f
    end
    return uiCache[size]
end

-- ── 히트박스 테이블 (버튼 클릭 판정) ─────────────────────
local hitBoxes = {}
local function setHit(name, x, y, w, h)
    hitBoxes[name] = {x=x, y=y, w=w, h=h}
end
function R.hitTest(px, py, name)
    local b = hitBoxes[name]
    if not b then return false end
    return px >= b.x and px <= b.x+b.w and py >= b.y and py <= b.y+b.h
end

-- ── 색상 세팅 헬퍼 ────────────────────────────────────────
local function setC(t, a)
    love.graphics.setColor(t[1], t[2], t[3], a or 1)
end
local function darken(t, f)
    return {t[1]*f, t[2]*f, t[3]*f}
end

-- ── 둥근 사각형 (Love2D 11.x 호환) ───────────────────────
local function rrect(mode, x, y, w, h, r)
    love.graphics.rectangle(mode, x, y, w, h, r or 8, r or 8)
end

-- ── 텍스트 출력 헬퍼 ──────────────────────────────────────
local function drawText(font, text, x, y, w, align, r, g, b, a)
    love.graphics.setColor(r or 1, g or 1, b or 1, a or 1)
    love.graphics.setFont(font)
    if w then
        love.graphics.printf(text, x, y, w, align or "center")
    else
        love.graphics.print(text, x, y)
    end
end

-- ── 드롭 바운스 ───────────────────────────────────────────
local function dropBounce(t)
    if t >= 1 then return 1, 1, 0 end
    if t < 0.35 then
        local p = t / 0.35
        local e = p * p
        return 1 - 0.1*e, 1 + 0.15*e, -60*(1-e)
    end
    if t < 0.55 then
        local p  = (t - 0.35) / 0.2
        local sq = math.sin(p * math.pi)
        return 1 + 0.25*sq, 1 - 0.3*sq, 0
    end
    if t < 0.75 then
        local p  = (t - 0.55) / 0.2
        local bn = math.sin(p * math.pi)
        return 1 - 0.08*bn, 1 + 0.12*bn, -15*bn
    end
    local p  = (t - 0.75) / 0.25
    local bn = math.sin(p * math.pi)
    return 1 + 0.05*bn, 1 - 0.06*bn, 0
end

-- ── 쟁반 위 이모지 화면 좌표 ──────────────────────────────
local function itemScreenPos(ix, iy, tiltX, tiltY)
    local scX = math.cos(math.rad(tiltY))
    local scY = math.cos(math.rad(tiltX))
    -- 원근 기울기에 따른 위치 보정
    local pX  = math.sin(math.rad(tiltY)) * iy * 0.3
    local pY  = math.sin(math.rad(tiltX)) * ix * 0.3
    return TRAY_CX + ix * scX + pX,
           TRAY_CY + iy * scY + pY
end

-- ── 1. 배경 ───────────────────────────────────────────────
local function drawBackground()
    setC(COL_BG)
    love.graphics.rectangle("fill", 0, 0, VW, VH)
end

-- ── 2. HUD ────────────────────────────────────────────────
local function drawHUD(level, score, best, cfg, tiltX, tiltY, frozen, frozenTimer, goldenTime, autoDropTimer)
    local f16 = R.getUIFont(16)
    local f20 = R.getUIFont(20)
    local f24 = R.getUIFont(24)

    -- HUD 배경
    setC(COL_HUD_BG)
    rrect("fill", 0, 0, VW, 100)

    -- 4개 박스: Level / Score / Goal / Best
    local goal = cfg and cfg.goal or 100
    local goalStr = (goal >= 1e8) and "∞" or tostring(goal)
    local boxes = {
        {label="레벨", value=tostring(level),     col=COL_WHITE},
        {label="점수", value=tostring(score),      col=COL_SCORE},
        {label="목표", value=goalStr,              col=COL_WHITE},
        {label="최고", value=tostring(best),       col={0.7,0.7,0.7}},
    }
    local bw = VW / 4
    for i, b in ipairs(boxes) do
        local bx = (i-1) * bw
        setC(COL_HUD_BG)
        rrect("fill", bx+4, 6, bw-8, 62, 6)
        setC({0.25,0.17,0.06})
        rrect("line", bx+4, 6, bw-8, 62, 6)

        drawText(f16, b.label, bx, 14, bw, "center", 0.6, 0.5, 0.3)
        love.graphics.setFont(f24)
        love.graphics.setColor(b.col[1], b.col[2], b.col[3], 1)
        love.graphics.printf(b.value, bx, 38, bw, "center")
    end

    -- 균형 바 (y=74)
    local barY = 74
    local barW = VW - 40
    local barX = 20

    setC({0.08, 0.05, 0.02})
    rrect("fill", barX, barY, barW, 14, 4)

    -- 기울기 계산
    local mag   = math.sqrt(tiltX^2 + tiltY^2)
    local angle = math.atan2(tiltY, tiltX)
    local danger= cfg and math.min(1, mag / cfg.tiltLimit) or 0
    local ratio = math.min(1, mag / (cfg and cfg.tiltLimit or 46))
    local col   = danger < 0.4 and COL_GREEN or (danger < 0.7 and COL_YELLOW or COL_RED)

    -- fill bar
    local needlePos = 0.5 + math.sin(angle) * ratio * 0.44
    local fillL, fillW
    if tiltY > 0 then
        fillL = 0.5; fillW = ratio * 0.44
    else
        fillL = 0.5 - ratio*0.44; fillW = ratio * 0.44
    end
    setC(col, 0.7)
    rrect("fill", barX + fillL*barW, barY, fillW*barW, 14, 4)

    -- 중심선
    setC({0.5, 0.5, 0.5})
    love.graphics.rectangle("fill", barX + barW*0.5 - 1, barY, 2, 14)

    -- 바늘
    local nx = barX + needlePos * barW
    setC(col)
    love.graphics.circle("fill", nx, barY + 7, 7)

    -- 위험도 바 (y=91)
    local dbarY = 91
    setC({0.08, 0.05, 0.02})
    rrect("fill", barX, dbarY, barW, 8, 3)
    setC(col)
    rrect("fill", barX, dbarY, barW * danger, 8, 3)

    -- 카운트다운 타이머 (자동드롭 경고)
    if cfg and autoDropTimer < cfg.autoDrop and autoDropTimer <= 10 then
        local secs = math.ceil(autoDropTimer)
        local warn = secs <= 3
        love.graphics.setFont(f20)
        love.graphics.setColor(warn and 1 or 0.957, warn and 0.3 or 0.647, warn and 0.3 or 0.208, 1)
        love.graphics.printf("⏱ " .. secs, VW - 80, 74, 70, "right")
    end

    -- 얼음 동결 상태 표시
    if frozen and frozenTimer then
        love.graphics.setFont(f16)
        love.graphics.setColor(0.5, 0.9, 1, 1)
        love.graphics.printf("❄ " .. string.format("%.1f", frozenTimer), 10, 74, 100, "left")
    end

    -- 골든타임 표시
    if goldenTime then
        love.graphics.setFont(f16)
        love.graphics.setColor(1, 0.9, 0.1, 1)
        love.graphics.printf("⭐ GOLDEN!", 10, 74, 150, "left")
    end
end

-- ── 3. 쟁반 씬 ────────────────────────────────────────────
local function drawScene(tiltX, tiltY, items, dragging, shakeTimer)
    -- 흔들림
    local shakeX, shakeY = 0, 0
    if shakeTimer > 0 then
        shakeX = (math.random() - 0.5) * 8
        shakeY = (math.random() - 0.5) * 4
    end

    love.graphics.push()
    love.graphics.translate(shakeX, shakeY)

    -- 원근 변환 값
    local scX = math.cos(math.rad(tiltY))
    local scY = math.cos(math.rad(tiltX))
    local vrx = math.max(30, TRAY_VRX * scX)
    local vry = math.max(15, TRAY_VRY * scY)
    local shiftX = math.sin(math.rad(tiltY)) * 18
    local shiftY = math.sin(math.rad(tiltX)) * 8

    local cx = TRAY_CX + shiftX
    local cy = TRAY_CY + shiftY

    -- 받침대 (사다리꼴)
    setC(COL_STAND)
    love.graphics.polygon("fill",
        cx - 30, cy + vry,
        cx + 30, cy + vry,
        cx + 22, cy + vry + 120,
        cx - 22, cy + vry + 120
    )
    -- 받침대 베이스
    setC(darken(COL_STAND, 0.7))
    love.graphics.ellipse("fill", cx, cy + vry + 120, 60, 12)

    -- 그림자
    love.graphics.setColor(0, 0, 0, 0.25)
    love.graphics.ellipse("fill", cx + 6, cy + 10, vrx + 10, vry * 0.35)

    -- 쟁반 본체 (목재 색)
    setC(COL_WOOD)
    love.graphics.ellipse("fill", cx, cy, vrx, vry)

    -- 목재 무늬 (타원형 내부 선)
    love.graphics.setColor(0.60, 0.42, 0.16, 0.4)
    love.graphics.setLineWidth(1.5)
    for k = 1, 3 do
        love.graphics.ellipse("line", cx, cy, vrx * (0.3 + k*0.22), vry * (0.3 + k*0.22))
    end

    -- 쟁반 테두리
    setC(COL_WOOD_D)
    love.graphics.setLineWidth(4)
    love.graphics.ellipse("line", cx, cy, vrx, vry)
    love.graphics.setLineWidth(1)

    -- 쟁반 위 이모지들
    for _, it in ipairs(items) do
        local sx, sy = itemScreenPos(it.x, it.y, tiltX, tiltY)
        local fs     = emojis.fontSize(it.w)
        local t_norm = math.min(1, it.dropT / DROP_ANIM_DUR)
        local scW, scH, offY = dropBounce(t_norm)

        love.graphics.setColor(1, 1, 1, 1)
        love.graphics.push()
        love.graphics.translate(sx + shakeX, sy + shiftY + offY)
        love.graphics.scale(scW, scH)
        local f = R.getEmojiFont(fs)
        love.graphics.setFont(f)
        -- 그림자
        love.graphics.setColor(0, 0, 0, 0.5)
        love.graphics.printf(it.e, -fs, fs * 0.1, fs * 2, "center")
        love.graphics.setColor(1, 1, 1, 1)
        love.graphics.printf(it.e, -fs, -fs, fs * 2, "center")
        love.graphics.pop()
    end

    -- 드래그 중인 이모지 (고스트)
    if dragging then
        local fs = dragging.data.w >= 10 and 60 or 40
        love.graphics.setColor(1, 1, 1, 0.75)
        love.graphics.push()
        love.graphics.translate(dragging.gx, dragging.gy)
        local f = R.getEmojiFont(fs)
        love.graphics.setFont(f)
        love.graphics.printf(dragging.data.e, -fs, -fs, fs*2, "center")
        love.graphics.pop()
    end

    love.graphics.pop()
end

-- ── 4. 창고 ───────────────────────────────────────────────
local function drawFloor(floorItems, goldenTime, dragging)
    -- 구분선
    setC(COL_ACCENT)
    love.graphics.setLineWidth(1.5)
    love.graphics.line(10, FLOOR_TOP - 1, VW - 10, FLOOR_TOP - 1)
    love.graphics.setLineWidth(1)

    -- 배경
    setC(COL_FLOOR)
    love.graphics.rectangle("fill", 0, FLOOR_TOP, VW, VH - FLOOR_TOP)

    -- 제목
    local f14 = R.getUIFont(14)
    love.graphics.setFont(f14)
    love.graphics.setColor(0.5, 0.38, 0.16, 1)
    -- love.graphics.printf("창 고", 0, FLOOR_TOP - 18, VW, "center")

    if not floorItems then return end

    local f12 = R.getUIFont(12)
    for _, fi in ipairs(floorItems) do
        local fx, fy = fi.col * CELL_W, FLOOR_TOP + fi.row * CELL_H
        local cx, cy = fx + CELL_W * 0.5, fy + CELL_H * 0.5

        -- 칩 배경
        local isActive = dragging and dragging.src == fi

        if fi.giant then
            love.graphics.setColor(0.55, 0.08, 0.08, isActive and 0.5 or 0.9)
        elseif fi.golden then
            love.graphics.setColor(0.4, 0.3, 0.02, isActive and 0.5 or 0.9)
        elseif fi.special or fi.mystery then
            love.graphics.setColor(0.15, 0.08, 0.25, isActive and 0.5 or 0.9)
        else
            love.graphics.setColor(0.18, 0.12, 0.05, isActive and 0.5 or 0.9)
        end
        rrect("fill", fx + 5, fy + 5, CELL_W - 10, CELL_H - 10, 10)

        -- 테두리
        if fi.golden then
            love.graphics.setColor(1, 0.85, 0.1, 0.9)
        elseif fi.giant then
            love.graphics.setColor(0.9, 0.2, 0.2, 0.9)
        elseif fi.special or fi.mystery then
            love.graphics.setColor(0.6, 0.3, 0.9, 0.9)
        else
            love.graphics.setColor(0.35, 0.23, 0.08, 0.7)
        end
        love.graphics.setLineWidth(1.5)
        rrect("line", fx + 5, fy + 5, CELL_W - 10, CELL_H - 10, 10)
        love.graphics.setLineWidth(1)

        -- 이모지
        if not isActive then
            local fs = math.min(48, emojis.fontSize(fi.w) + 8)
            love.graphics.setColor(1, 1, 1, 1)
            local ef = R.getEmojiFont(fs)
            love.graphics.setFont(ef)
            love.graphics.printf(fi.e, cx - fs, cy - fs * 0.6, fs * 2, "center")
        end

        -- 점수 배지
        local ptsStr
        if fi.golden then
            ptsStr = "100"
        elseif fi.mystery then
            ptsStr = "?"
        elseif fi.special then
            ptsStr = "★"
        else
            ptsStr = tostring(emojis.toPoints(fi.w))
        end
        love.graphics.setFont(f12)
        love.graphics.setColor(1, 1, 1, 0.85)
        love.graphics.printf(ptsStr, fx + CELL_W - 36, fy + 10, 30, "right")
    end
end

-- ── 5. 시작 화면 ──────────────────────────────────────────
local function drawStartOverlay()
    -- 반투명 배경
    love.graphics.setColor(0.07, 0.05, 0.02, 0.95)
    love.graphics.rectangle("fill", 0, 0, VW, VH)

    local f30 = R.getUIFont(30)
    local f18 = R.getUIFont(18)
    local f14 = R.getUIFont(14)
    local fe60 = R.getEmojiFont(60)

    -- 타이틀 이모지
    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.setFont(fe60)
    love.graphics.printf("🍽️", 0, 160, VW, "center")

    -- 제목
    love.graphics.setFont(f30)
    love.graphics.setColor(unpack(COL_ACCENT))
    love.graphics.printf("쟁반 균형 게임", 20, 250, VW - 40, "center")

    -- 부제
    love.graphics.setFont(f14)
    love.graphics.setColor(0.75, 0.60, 0.35, 1)
    love.graphics.printf("무게균형과 순발력으로\n랭킹 10위 주인공이 되어보세요!", 20, 300, VW - 40, "center")

    -- 시작 버튼
    local bx, by, bw, bh = VW/2 - 120, 490, 240, 64
    setHit("start", bx, by, bw, bh)
    love.graphics.setColor(unpack(COL_ACCENT))
    rrect("fill", bx, by, bw, bh, 14)
    love.graphics.setColor(0.1, 0.06, 0.02)
    love.graphics.setFont(R.getUIFont(22))
    love.graphics.printf("게임 시작", bx, by + 18, bw, "center")

    -- 게임 방법 요약
    love.graphics.setFont(f14)
    love.graphics.setColor(0.65, 0.52, 0.28, 1)
    love.graphics.printf(
        "창고에서 이모지를 드래그해 쟁반에 올려놓으세요\n" ..
        "무거울수록 점수가 높지만 쟁반이 기울 수 있어요!\n" ..
        "기울기가 한계를 넘으면 전부 쏟아집니다 💥",
        30, 580, VW - 60, "center"
    )
end

-- ── 6. 레벨 클리어 오버레이 ───────────────────────────────
local function drawLevelClear(level, score, lcTimer, isAllClear)
    love.graphics.setColor(0, 0, 0, 0.75)
    love.graphics.rectangle("fill", 0, 0, VW, VH)

    love.graphics.setColor(0.12, 0.08, 0.03, 0.97)
    rrect("fill", 40, 280, VW - 80, 400, 20)
    love.graphics.setColor(unpack(COL_ACCENT))
    rrect("line", 40, 280, VW - 80, 400, 20)

    local f36 = R.getUIFont(36)
    local f22 = R.getUIFont(22)
    local f18 = R.getUIFont(18)

    -- 아이콘
    local fe48 = R.getEmojiFont(48)
    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.setFont(fe48)
    local icon = isAllClear and "🎊" or string.rep("⭐", math.min(level, 5))
    love.graphics.printf(icon, 40, 300, VW - 80, "center")

    -- 제목
    love.graphics.setFont(f36)
    love.graphics.setColor(unpack(COL_ACCENT))
    local title = isAllClear and "ALL CLEAR!" or ("Level " .. level .. " Clear!")
    love.graphics.printf(title, 40, 360, VW - 80, "center")

    -- 현재 점수
    love.graphics.setFont(f22)
    love.graphics.setColor(unpack(COL_SCORE))
    love.graphics.printf("점수: " .. score, 40, 410, VW - 80, "center")

    -- 카운트다운
    if lcTimer and lcTimer > 0 then
        love.graphics.setFont(f18)
        love.graphics.setColor(0.7, 0.6, 0.4, 1)
        local secs = math.ceil(lcTimer)
        local nextStr = isAllClear and "" or ("Level " .. (level+1) .. " 시작까지...")
        love.graphics.printf(nextStr .. " " .. secs, 40, 450, VW - 80, "center")
    end
end

-- ── 7. 게임 오버 오버레이 ─────────────────────────────────
local function drawGameOver(level, score, best, lbState, leaderboard, topTen,
                             nickname, nicknameActive)
    -- 어두운 오버레이
    love.graphics.setColor(0, 0, 0, 0.82)
    love.graphics.rectangle("fill", 0, 0, VW, VH)

    local panelY = 60
    local panelH = VH - 120
    love.graphics.setColor(0.10, 0.07, 0.03, 0.97)
    rrect("fill", 20, panelY, VW - 40, panelH, 18)
    love.graphics.setColor(unpack(COL_ACCENT))
    love.graphics.setLineWidth(2)
    rrect("line", 20, panelY, VW - 40, panelH, 18)
    love.graphics.setLineWidth(1)

    local f28 = R.getUIFont(28)
    local f20 = R.getUIFont(20)
    local f18 = R.getUIFont(18)
    local f16 = R.getUIFont(16)
    local f14 = R.getUIFont(14)

    -- 이모지 + 제목
    local fe48 = R.getEmojiFont(48)
    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.setFont(fe48)
    love.graphics.printf(topTen and score > 0 and "🎉" or "💥", 20, panelY + 20, VW - 40, "center")

    love.graphics.setFont(f28)
    love.graphics.setColor(unpack(COL_ACCENT))
    love.graphics.printf(topTen and score > 0 and "축하합니다!" or "쏟아졌다!", 20, panelY + 80, VW - 40, "center")

    -- 점수
    love.graphics.setFont(f20)
    love.graphics.setColor(unpack(COL_SCORE))
    love.graphics.printf("점수: " .. score, 20, panelY + 120, VW - 40, "center")
    love.graphics.setColor(0.6, 0.6, 0.6)
    love.graphics.setFont(f16)
    love.graphics.printf("최고: " .. best, 20, panelY + 150, VW - 40, "center")

    local curY = panelY + 185

    -- 닉네임 입력 (Top 10 진입 시)
    if nicknameActive then
        love.graphics.setFont(f16)
        love.graphics.setColor(1, 0.9, 0.4, 1)
        love.graphics.printf("TOP 10 진입! 닉네임을 입력하세요", 30, curY, VW - 60, "center")
        curY = curY + 30

        -- 입력 박스
        local ibx, iby, ibw, ibh = 60, curY, VW - 120, 50
        love.graphics.setColor(0.15, 0.10, 0.04)
        rrect("fill", ibx, iby, ibw, ibh, 8)
        love.graphics.setColor(unpack(COL_ACCENT))
        rrect("line", ibx, iby, ibw, ibh, 8)
        love.graphics.setFont(f20)
        love.graphics.setColor(1, 1, 1, 1)
        local displayNick = #nickname > 0 and nickname or " "
        local cursor = love.timer.getTime() % 1.0 < 0.5 and "|" or ""
        love.graphics.printf(displayNick .. cursor, ibx + 10, iby + 12, ibw - 20, "left")
        curY = curY + 58

        -- 저장 / 건너뛰기 버튼
        local sbx, sby, sbw, sbh = 60, curY, (VW - 140) / 2, 48
        setHit("goSave", sbx, sby, sbw, sbh)
        love.graphics.setColor(unpack(COL_ACCENT))
        rrect("fill", sbx, sby, sbw, sbh, 10)
        love.graphics.setColor(0.1, 0.06, 0.02)
        love.graphics.setFont(f18)
        love.graphics.printf("저장", sbx, sby + 13, sbw, "center")

        local skipX = sbx + sbw + 20
        setHit("goSkip", skipX, sby, sbw, sbh)
        love.graphics.setColor(0.28, 0.20, 0.08)
        rrect("fill", skipX, sby, sbw, sbh, 10)
        love.graphics.setColor(0.7, 0.6, 0.4)
        love.graphics.printf("건너뛰기", skipX, sby + 13, sbw, "center")
        curY = curY + 58

        love.keyboard.setTextInput(true)
    else
        love.keyboard.setTextInput(false)

        -- 리더보드
        if lbState == "loading" then
            love.graphics.setFont(f16)
            love.graphics.setColor(0.6, 0.6, 0.6, 1)
            love.graphics.printf("랭킹 로딩중...", 20, curY, VW - 40, "center")
            curY = curY + 30
        elseif lbState == "loaded" then
            love.graphics.setFont(f16)
            love.graphics.setColor(unpack(COL_ACCENT))
            love.graphics.printf("🏆 TOP 10", 20, curY, VW - 40, "center")
            curY = curY + 28

            if #leaderboard == 0 then
                love.graphics.setColor(0.5, 0.5, 0.5, 1)
                love.graphics.printf("아직 기록이 없습니다", 20, curY, VW - 40, "center")
                curY = curY + 26
            else
                local medals = {"🥇","🥈","🥉"}
                for i, entry in ipairs(leaderboard) do
                    local rowY = curY + (i-1) * 32
                    if rowY > panelY + panelH - 80 then break end
                    local isMe = (entry.score == score and not nicknameActive)

                    if isMe then
                        love.graphics.setColor(1, 0.85, 0.1, 0.2)
                        rrect("fill", 30, rowY - 2, VW - 60, 28, 4)
                    end

                    -- 순위
                    local rank = medals[i] and (medals[i] .. " " .. i) or tostring(i)
                    love.graphics.setFont(R.getEmojiFont(20))
                    love.graphics.setColor(1, 1, 1, isMe and 1 or 0.75)
                    love.graphics.printf(rank, 30, rowY, 80, "left")

                    -- 닉네임
                    love.graphics.setFont(f16)
                    love.graphics.printf(entry.name, 110, rowY, 200, "left")

                    -- 점수
                    love.graphics.setFont(f16)
                    love.graphics.setColor(unpack(COL_SCORE))
                    love.graphics.printf(entry.score .. "점", VW - 140, rowY, 110, "right")
                end
                curY = curY + math.min(#leaderboard, 8) * 32 + 8
            end
        end

        -- 다시 도전 버튼
        local rbx = VW/2 - 110
        local rby = math.max(curY, panelY + panelH - 80)
        local rbw, rbh = 220, 52
        setHit("goRetry", rbx, rby, rbw, rbh)
        love.graphics.setColor(unpack(COL_ACCENT))
        rrect("fill", rbx, rby, rbw, rbh, 12)
        love.graphics.setColor(0.1, 0.06, 0.02)
        love.graphics.setFont(f20)
        love.graphics.printf("다시 도전", rbx, rby + 14, rbw, "center")
    end
end

-- ── 메인 드로우 ───────────────────────────────────────────
function R.draw(
    state, level, score, best, cfg,
    tiltX, tiltY, frozen, frozenTimer, goldenTime,
    items, floorItems, dragging,
    particles, falling, confetti, frostFlakes,
    autoDropTimer, shakeTimer,
    lbState, leaderboard, topTen,
    nickname, nicknameActive,
    lcTimer
)
    drawBackground()

    if state == "start" then
        drawStartOverlay()
        return
    end

    local dangerVal = 0
    if cfg then
        local mag = math.sqrt((tiltX or 0)^2 + (tiltY or 0)^2)
        dangerVal = math.min(1, mag / cfg.tiltLimit)
    end

    drawHUD(level, score, best, cfg, tiltX or 0, tiltY or 0, frozen, frozenTimer, goldenTime, autoDropTimer)
    drawScene(tiltX or 0, tiltY or 0, items or {}, dragging, shakeTimer or 0)
    drawFloor(floorItems, goldenTime, dragging)

    -- 이펙트
    effects.draw(particles or {}, falling or {}, confetti or {}, frostFlakes)

    -- 오버레이
    if state == "levelclear" then
        drawLevelClear(level, score, lcTimer, false)
    elseif state == "allclear" then
        drawLevelClear(level, score, lcTimer, true)
    elseif state == "gameover" then
        drawGameOver(level, score, best, lbState, leaderboard or {}, topTen,
                     nickname or "", nicknameActive)
    end

    love.graphics.setColor(1, 1, 1, 1)
end

return R
