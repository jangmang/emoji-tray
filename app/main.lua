-- main.lua  ─  love 콜백 진입점 + 가상 해상도 좌표 변환
local Game = require("src.game")

local VW, VH   = 540, 960
local scale    = 1
local offX, offY = 0, 0

-- 실제 화면 크기가 바뀔 때 scale/offset 재계산
local function recalc()
    local sw, sh = love.graphics.getDimensions()
    scale = math.min(sw / VW, sh / VH)
    offX  = (sw - VW * scale) / 2
    offY  = (sh - VH * scale) / 2
end

-- 실제 좌표 → 가상 좌표
local function tv(x, y)
    return (x - offX) / scale, (y - offY) / scale
end

function love.load()
    love.graphics.setDefaultFilter("linear", "linear")
    recalc()
    Game.load(VW, VH)

    -- 이모지 폰트 로딩 진단
    local ok, f = pcall(love.graphics.newFont, "assets/fonts/NotoColorEmoji.ttf", 40)
    if ok then
        print("[FONT] NotoColorEmoji 로딩 성공: " .. tostring(f))
        print("[FONT] hasGlyphs(🍽️): " .. tostring(f:hasGlyphs("🍽️")))
    else
        print("[FONT] NotoColorEmoji 로딩 실패: " .. tostring(f))
    end
end

function love.update(dt)
    Game.update(dt)
end

function love.draw()
    -- 레터박스 배경
    love.graphics.clear(0.05, 0.04, 0.02)
    love.graphics.push()
    love.graphics.translate(offX, offY)
    love.graphics.scale(scale, scale)
    Game.draw()
    love.graphics.pop()
end

function love.resize(w, h)
    recalc()
end

-- ── 터치 (Android) ────────────────────────────────────────
function love.touchpressed(id, x, y)
    Game.press(id, tv(x, y))
end
function love.touchmoved(id, x, y)
    Game.move(id, tv(x, y))
end
function love.touchreleased(id, x, y)
    Game.release(id, tv(x, y))
end

-- ── 마우스 (PC 테스트용) ──────────────────────────────────
function love.mousepressed(x, y, b)
    if b == 1 then Game.press("mouse", tv(x, y)) end
end
function love.mousemoved(x, y)
    Game.move("mouse", tv(x, y))
end
function love.mousereleased(x, y, b)
    if b == 1 then Game.release("mouse", tv(x, y)) end
end

-- ── 키보드 (닉네임 입력) ──────────────────────────────────
function love.textinput(t)
    Game.textinput(t)
end
function love.keypressed(k)
    if     k == "backspace"             then Game.backspace()
    elseif k == "return" or k == "kpenter" then Game.confirm()
    elseif k == "escape"                then Game.escape()
    end
end
