-- src/effects.lua  ─  파티클 효과 / 낙하 이모지 / 컨페티 관리
local M = {}

local emojis = require("src.emojis")

-- ── 색상 팔레트 ────────────────────────────────────────────
local SPARKLE_COLS = {
    {1,0.84,0},{1,0.65,0},{1,0.39,0.28},{1,0.41,0.71},
    {0.53,0.81,0.98},{0.68,1,0.18},{1,1,1},
}
local CONFETTI_COLS = {
    {1,0.85,0},{1,0.42,0.42},{0.31,0.8,0.77},{0.27,0.72,0.82},
    {0.957,0.647,0.208},{0.91,0.25,0.25},{0.25,0.78,0.43},{1,0.62,0.95},
}

local function rc(t) local c=t[math.random(#t)]; return c[1],c[2],c[3] end

-- ── 파티클 생성 헬퍼 ──────────────────────────────────────
-- 파티클 타입:
--   sparkle   : 작은 빛 점
--   star      : 이모지 텍스트 날아가기
--   confetti  : 사각형 / 원 떨어지기
--   toast     : 텍스트 메시지 (위로 떠오름)
--   frost     : 서리 이모지 (쟁반 주변 고정)

function M.spawnSparkle(particles, x, y)
    local count = math.random(2, 4)
    for _ = 1, count do
        local r, g, b = rc(SPARKLE_COLS)
        local sz = 4 + math.random() * 8
        local a  = (math.random() - 0.5) * math.pi * 2
        local spd = 60 + math.random() * 80
        particles[#particles+1] = {
            type="sparkle", x=x+(math.random()-0.5)*24, y=y+(math.random()-0.5)*24,
            vx=math.cos(a)*spd, vy=math.sin(a)*spd,
            life=0.6+math.random()*0.5, maxLife=0,
            r=r,g=g,b=b, sz=sz,
        }
        particles[#particles].maxLife = particles[#particles].life
    end
end

local function spawnBurst(particles, x, y, icons, count, distMin, distMax, sizeMin, sizeMax)
    for i = 1, count do
        local e   = icons[math.random(#icons)]
        local a   = (math.pi*2 / count) * (i-1) + (math.random()-0.5)*0.5
        local d   = distMin + math.random() * (distMax - distMin)
        local dur = 0.6 + math.random() * 0.5
        local fs  = sizeMin + math.random() * (sizeMax - sizeMin)
        particles[#particles+1] = {
            type="star", e=e,
            x=x, y=y,
            tx=math.cos(a)*d, ty=math.sin(a)*d,
            rot=0, rotV=(math.random()-0.5)*400,
            life=dur, maxLife=dur,
            fs=fs,
        }
    end
end

function M.spawnDropBurst(particles, x, y)
    local count = math.random(12, 17)
    for i = 1, count do
        local r, g, b = rc(SPARKLE_COLS)
        local a = (math.pi*2/count)*(i-1) + (math.random()-0.5)*0.5
        local d = 20 + math.random() * 40
        local dur = 0.35 + math.random() * 0.45
        local sz = 5 + math.random() * 10
        particles[#particles+1] = {
            type="burst", x=x, y=y,
            tx=math.cos(a)*d, ty=math.sin(a)*d,
            life=dur, maxLife=dur,
            r=r,g=g,b=b, sz=sz,
        }
    end
end

function M.spawnScoreStars(particles, x, y, pts)
    local stars = {"⭐","🌟","✨","💫","⚡"}
    local count = math.min(5 + math.floor(pts/5), 14)
    spawnBurst(particles, x, y, stars, count, 70, 150, 14, 22)
end

function M.spawnBombBurst(particles, x, y)
    local icons = {"💥","💥","🔥","🔥","💨","✨"}
    spawnBurst(particles, x, y, icons, 16, 80, 160, 24, 40)
end

function M.spawnIceBurst(particles, x, y)
    local icons = {"❄️","🧊","💎","✨","❄️"}
    spawnBurst(particles, x, y, icons, 14, 60, 130, 18, 34)
end

function M.spawnMagnetBurst(particles, x, y)
    -- 바깥에서 안으로 들어오는 방향
    local icons = {"🧲","⚡","✨","💫"}
    local count = 12
    for i = 1, count do
        local a   = (math.pi*2/count)*(i-1) + (math.random()-0.5)*0.5
        local d   = 80 + math.random() * 90
        local dur = 0.5 + math.random() * 0.4
        local sx  = x + math.cos(a)*d
        local sy  = y + math.sin(a)*d
        particles[#particles+1] = {
            type="star", e=icons[math.random(#icons)],
            x=sx, y=sy,
            tx=-math.cos(a)*d, ty=-math.sin(a)*d,
            rot=0, rotV=0,
            life=dur, maxLife=dur, fs=18,
        }
    end
end

function M.spawnGoldenBurst(particles, x, y)
    local icons = {"⭐","🌟","✨","💛","⭐"}
    spawnBurst(particles, x, y, icons, 16, 80, 160, 18, 26)
end

function M.spawnMysteryBurst(particles, x, y)
    local icons = {"❓","❗","✨","🎲","💫"}
    spawnBurst(particles, x, y, icons, 14, 70, 140, 18, 28)
end

function M.spawnToast(particles, x, y, text)
    particles[#particles+1] = {
        type="toast", text=text,
        x=x, y=y, vy=-40,
        life=1.5, maxLife=1.5,
    }
end

function M.spawnMysteryToast(particles, x, y, emoji, name)
    M.spawnToast(particles, x, y, emoji .. " " .. name .. "!")
end

-- ── 서리 이모지 (쟁반 주변) ───────────────────────────────
function M.spawnFrostFlakes(frostFlakes, trayCX, trayCY, trayRX, trayRY)
    frostFlakes = {}
    local count = 12
    for i = 1, count do
        local a  = (math.pi*2/count)*(i-1) + (math.random()-0.5)*0.4
        local rx = (0.9 + math.random()*0.3)
        local ry = (0.9 + math.random()*0.4)
        local x  = trayCX + math.cos(a) * trayRX * rx
        local y  = trayCY + math.sin(a) * trayRY * ry
        local fs = 14 + math.random()*12
        local rot= math.random()*360
        frostFlakes[#frostFlakes+1] = {
            e="❄️", x=x, y=y, fs=fs, rot=rot,
            rotV=(math.random()-0.5)*60,
            pulse=math.random()*math.pi*2,
        }
    end
    return frostFlakes
end

-- ── 낙하 이모지 (게임오버 / 폭탄 / 슬라이딩 이탈) ──────────
function M.spawnFallingEmoji(falling, x, y, e, w, tiltX, tiltY)
    tiltX = tiltX or 0; tiltY = tiltY or 0
    local flipDirX = tiltY > 0 and 1 or -1
    local flipDirY = tiltX > 0 and 1 or -1
    local fs = emojis.fontSize(w)
    falling[#falling+1] = {
        e=e, x=x, y=y, fs=fs,
        vx = flipDirX*4 + (math.random()-0.5)*3,
        vy = -3 + flipDirY*3,
        rot=0, rotV=(math.random()-0.5)*15,
        life=1.0,
    }
end

-- ── 컨페티 ────────────────────────────────────────────────
function M.spawnConfetti(confetti, vw, vh)
    local count = 60
    for _ = 1, count do
        local r,g,b = rc(CONFETTI_COLS)
        local isRect = math.random() < 0.4
        local sz = 6 + math.random() * 8
        confetti[#confetti+1] = {
            x = math.random() * vw,
            y = -10 - math.random() * 40,
            vx= (math.random()-0.5) * 60,
            vy= 120 + math.random() * 180,
            rot=math.random()*360, rotV=(math.random()-0.5)*360,
            r=r,g=g,b=b,
            w = isRect and sz*2.5 or sz,
            h = sz,
            isCircle = not isRect and math.random()<0.5,
            life = 2 + math.random() * 2,
            maxLife = 0,
            vh = vh,
        }
        confetti[#confetti].maxLife = confetti[#confetti].life
    end
end

-- ── 업데이트 ──────────────────────────────────────────────
function M.update(dt, particles, falling, confetti, frostFlakes)
    -- particles
    for i = #particles, 1, -1 do
        local p = particles[i]
        p.life = p.life - dt
        if p.life <= 0 then
            table.remove(particles, i)
        else
            if p.type == "sparkle" then
                p.x  = p.x  + p.vx * dt
                p.y  = p.y  + p.vy * dt
                p.vy = p.vy + 60 * dt  -- gravity
            elseif p.type == "star" then
                local prog = 1 - p.life / p.maxLife
                p.rot = p.rot + p.rotV * dt
                -- pos interpolated
            elseif p.type == "burst" then
                -- pos interpolated
            elseif p.type == "toast" then
                p.y = p.y + p.vy * dt
            end
        end
    end

    -- falling emojis
    for i = #falling, 1, -1 do
        local f = falling[i]
        f.vy   = f.vy + 600 * dt
        f.vx   = f.vx * 0.98
        f.x    = f.x  + f.vx * dt
        f.y    = f.y  + f.vy * dt
        f.rot  = f.rot + f.rotV
        f.life = f.life - dt
        if f.life <= 0 then table.remove(falling, i) end
    end

    -- confetti
    for i = #confetti, 1, -1 do
        local c = confetti[i]
        c.x   = c.x + c.vx * dt
        c.y   = c.y + c.vy * dt
        c.rot = c.rot + c.rotV * dt
        c.life= c.life - dt
        if c.life <= 0 or c.y > c.vh + 60 then
            table.remove(confetti, i)
        end
    end

    -- frost flakes (pulse spin)
    if frostFlakes then
        for _, f in ipairs(frostFlakes) do
            f.pulse = f.pulse + dt * 2
            f.rot   = f.rot + f.rotV * dt
        end
    end
end

-- ── 드로우 ────────────────────────────────────────────────
local function getFont(size)
    -- renderer가 관리하는 폰트 캐시 사용 (순환참조 방지용 lazy require)
    return require("src.renderer").getEmojiFont(size)
end

function M.draw(particles, falling, confetti, frostFlakes)
    -- particles
    for _, p in ipairs(particles) do
        if p.type == "sparkle" then
            local alpha = p.life / p.maxLife
            love.graphics.setColor(p.r, p.g, p.b, alpha)
            love.graphics.circle("fill", p.x, p.y, p.sz * alpha)

        elseif p.type == "star" then
            local prog  = 1 - p.life / p.maxLife
            local alpha = p.life / p.maxLife
            local x = p.x + p.tx * prog
            local y = p.y + p.ty * prog
            love.graphics.setColor(1,1,1,alpha)
            love.graphics.push()
            love.graphics.translate(x, y)
            love.graphics.rotate(math.rad(p.rot))
            local f = getFont(p.fs)
            love.graphics.setFont(f)
            love.graphics.printf(p.e, -p.fs, -p.fs, p.fs*2, "center")
            love.graphics.pop()

        elseif p.type == "burst" then
            local prog  = 1 - p.life / p.maxLife
            local alpha = p.life / p.maxLife
            local x = p.x + p.tx * prog
            local y = p.y + p.ty * prog
            love.graphics.setColor(p.r, p.g, p.b, alpha)
            love.graphics.circle("fill", x, y, p.sz * (0.5 + alpha*0.5))

        elseif p.type == "toast" then
            local alpha = math.min(1, p.life / p.maxLife * 2)
            love.graphics.setColor(0.1,0.07,0.03, alpha*0.85)
            local W = 280
            love.graphics.rectangle("fill", p.x - W/2, p.y - 18, W, 36, 8, 8)
            love.graphics.setColor(1,1,1,alpha)
            local rf = require("src.renderer").getUIFont(16)
            love.graphics.setFont(rf)
            love.graphics.printf(p.text, p.x - W/2, p.y - 10, W, "center")
        end
    end

    -- falling emojis
    for _, f in ipairs(falling) do
        local alpha = math.max(0, f.life)
        love.graphics.setColor(1, 1, 1, alpha)
        love.graphics.push()
        love.graphics.translate(f.x, f.y)
        love.graphics.rotate(math.rad(f.rot))
        local font = getFont(f.fs)
        love.graphics.setFont(font)
        love.graphics.printf(f.e, -f.fs, -f.fs, f.fs*2, "center")
        love.graphics.pop()
    end

    -- confetti
    for _, c in ipairs(confetti) do
        local alpha = math.min(1, c.life / c.maxLife * 3)
        love.graphics.setColor(c.r, c.g, c.b, alpha)
        love.graphics.push()
        love.graphics.translate(c.x, c.y)
        love.graphics.rotate(math.rad(c.rot))
        if c.isCircle then
            love.graphics.ellipse("fill", 0, 0, c.w/2, c.h/2)
        else
            love.graphics.rectangle("fill", -c.w/2, -c.h/2, c.w, c.h, 2, 2)
        end
        love.graphics.pop()
    end

    -- frost flakes
    if frostFlakes then
        for _, f in ipairs(frostFlakes) do
            local pulse = 0.7 + math.sin(f.pulse) * 0.3
            love.graphics.setColor(1, 1, 1, pulse)
            love.graphics.push()
            love.graphics.translate(f.x, f.y)
            love.graphics.rotate(math.rad(f.rot))
            local font = getFont(math.floor(f.fs))
            love.graphics.setFont(font)
            love.graphics.printf(f.e, -f.fs, -f.fs, f.fs*2, "center")
            love.graphics.pop()
        end
    end

    love.graphics.setColor(1, 1, 1, 1)
end

return M
