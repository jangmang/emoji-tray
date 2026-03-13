-- firestore_thread.lua  ─  네트워크 전용 스레드
-- main.lua에서 thread:start(reqCh, resCh, baseDoc, apiKey) 로 실행됨

local reqCh, resCh, BASE_DOC, API_KEY = ...

-- lua-https 로드 시도 (lua-https: https://github.com/leafo/lua-https)
local https
local ok, h = pcall(require, "https")
if ok then
    https = h
else
    -- fallback: luasocket http (HTTPS 미지원, 개발 테스트용)
    local ok2, sh = pcall(require, "socket.http")
    if ok2 then
        https = {
            request = function(url, body, headers, method)
                local ltn12 = require("ltn12")
                local resp  = {}
                local _, code = sh.request({
                    url    = url,
                    method = method or "GET",
                    headers= headers or {},
                    source = body and ltn12.source.string(body) or nil,
                    sink   = ltn12.sink.table(resp),
                })
                return table.concat(resp), code
            end
        }
    end
end

if not https then
    -- 네트워크 불가 신호
    resCh:push({type="error", msg="https library not available"})
    return
end

-- JSON (스레드 내부에서 직접 로드)
local json = require("src.json")

local function post(url, body)
    local headers = {
        ["Content-Type"]   = "application/json",
        ["Content-Length"] = tostring(#body),
    }
    local ok2, result = pcall(https.request, url, body, headers, "POST")
    if not ok2 then return nil, tostring(result) end
    return result
end

-- ── 메인 루프 ─────────────────────────────────────────────
while true do
    local req = reqCh:demand()   -- 요청 올 때까지 블로킹

    if req == "quit" then break end

    local ok3, err = pcall(function()
        if req.type == "query" then
            -- Firestore runQuery → leaderboard
            local body, code = post(req.url, req.body)
            if not body then error(tostring(code)) end
            local rankings = {}
            local data = json.decode(body) or {}
            for _, item in ipairs(data) do
                if item.document and item.document.fields then
                    local f  = item.document.fields
                    local sc = 0
                    if f.score then
                        sc = tonumber(f.score.integerValue)
                            or tonumber(f.score.doubleValue) or 0
                    end
                    rankings[#rankings+1] = {
                        name  = f.name  and f.name.stringValue  or "?",
                        score = sc,
                        date  = f.date  and f.date.stringValue  or "",
                    }
                end
            end
            resCh:push({type="leaderboard", data=rankings})

        elseif req.type == "post" then
            -- 점수 저장
            local body, code = post(req.url, req.body)
            resCh:push({type="saved", code=code})
        end
    end)

    if not ok3 then
        resCh:push({type="error", msg=tostring(err)})
    end
end
