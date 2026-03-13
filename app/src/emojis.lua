-- src/emojis.lua  ─  이모지 데이터 테이블 + 랜덤 선택 헬퍼
local M = {}

M.DATA = {
    -- 1점 (w:0.1)
    {e="🦋",w=0.1},{e="🌈",w=0.1},{e="💫",w=0.1},{e="🌸",w=0.1},
    -- 5점 (w:0.5)
    {e="🍒",w=0.5},{e="🍓",w=0.5},{e="🔥",w=0.5},
    {e="🍪",w=0.5},{e="🍦",w=0.5},{e="🥝",w=0.5},{e="🍄",w=0.5},
    -- 10점 (w:1.0)
    {e="🍎",w=1.0},{e="🍊",w=1.0},{e="🍋",w=1.0},{e="🍑",w=1.0},
    {e="🍣",w=1.0},{e="🧁",w=1.0},{e="🎲",w=1.0},{e="🌵",w=1.0},
    {e="🍩",w=1.0},{e="🎯",w=1.0},{e="🪄",w=1.0},{e="🌮",w=1.0},
    {e="🍇",w=1.0},{e="🐸",w=1.0},
    -- 20점 (w:2.0)
    {e="🍕",w=2.0},{e="🏀",w=2.0},{e="🥭",w=2.0},
    {e="🍔",w=2.0},{e="🍜",w=2.0},{e="🧸",w=2.0},{e="🍍",w=2.0},
    {e="🦊",w=2.0},{e="👑",w=2.0},
    -- 30점 (w:3.0)
    {e="🎸",w=3.0},{e="🦄",w=3.0},{e="🎂",w=3.0},
    {e="🛸",w=3.0},{e="🏆",w=3.0},{e="🎁",w=3.0},{e="🐧",w=3.0},
    -- 50점 (w:5.0)
    {e="💎",w=5.0},{e="🚀",w=5.0},{e="🦁",w=5.0},{e="🐳",w=5.0},
}

M.GIANT = {
    {e="🐘",w=10},{e="🦛",w=10},{e="🗿",w=10},{e="⚓",w=10},
    {e="🧱",w=10},{e="🛢️",w=10},{e="🪨",w=10},{e="🏋️",w=10},
}

M.SPECIAL = {
    {e="💣",w=0,special=true},   -- 폭탄
    {e="🧊",w=0,special=true},   -- 얼음
    {e="🧲",w=0,special=true},   -- 자석
    {e="⭐",w=0,special=true},   -- 골든타임
}

M.MYSTERY   = {e="❓",w=0,special=true,mystery=true}
M.GOLDEN    = {e="⭐",w=0,special=true,golden=true}

M.SPECIAL_RATE = 0.15
M.MYSTERY_RATE = 0.08

-- 점수 계산
function M.toPoints(w)
    return math.floor(w * 10 + 0.5)
end

-- 이모지 폰트 크기 (무게 비례, 웹 버전과 동일 공식)
function M.fontSize(w)
    local base = 37  -- 540 * 0.068
    local eff  = math.max(w, 0.1)
    local t    = math.sqrt((math.min(eff, 10) - 0.1) / 9.9)
    return math.floor(base * (1 + t * 3.5))
end

-- 창고용 랜덤 이모지 생성
function M.randED(maxWeight, giantRate, level, isGolden)
    -- 골든타임: 모두 골든 별
    if isGolden then
        return {e="⭐", w=0, special=true, golden=true}
    end

    -- 거대 이모지
    if giantRate > 0 and math.random() < giantRate then
        local d = M.GIANT[math.random(#M.GIANT)]
        return {e=d.e, w=d.w, giant=true}
    end

    -- 랜덤박스
    if math.random() < M.MYSTERY_RATE then
        return {e="❓", w=0, special=true, mystery=true}
    end

    -- 특수 이모지
    if math.random() < M.SPECIAL_RATE then
        local pool = {}
        for _, s in ipairs(M.SPECIAL) do
            if s.e ~= "⭐" or level >= 3 then
                pool[#pool+1] = s
            end
        end
        if #pool > 0 then
            local s = pool[math.random(#pool)]
            return {e=s.e, w=s.w, special=true}
        end
    end

    -- 일반 이모지 (maxWeight 이하)
    local pool = {}
    for _, d in ipairs(M.DATA) do
        if d.w <= maxWeight then pool[#pool+1] = d end
    end
    local d = pool[math.random(#pool)]
    return {e=d.e, w=d.w}
end

return M
