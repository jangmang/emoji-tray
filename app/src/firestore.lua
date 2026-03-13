-- src/firestore.lua  ─  Firestore REST API 클라이언트 (lua-https + love.thread)
--
-- 의존성: lua-https (https://github.com/leafo/lua-https)
--   → Love2D Android APK 빌드 시 lua-https 네이티브 라이브러리 포함 필요
--   → PC 테스트 시 luasec(luarocks install luasec) 으로 대체 가능
--
-- 통신 방식: love.thread 로 비동기 처리
--   요청 → requestChannel 에 push
--   응답 ← responseChannel 에서 poll()

local json = require("src.json")

local M = {}

local PROJECT  = "emoji-tray"
local API_KEY  = "AIzaSyBVFJ0hSgE_Ah3zzo5AypNxRYtis-ec7TI"
local BASE_DOC = "https://firestore.googleapis.com/v1/projects/"
              .. PROJECT .. "/databases/(default)/documents"

-- ── 채널 / 스레드 ─────────────────────────────────────────
local reqCh   -- love.Channel : main → thread
local resCh   -- love.Channel : thread → main
local thread

function M.init()
    reqCh  = love.thread.newChannel()
    resCh  = love.thread.newChannel()
    thread = love.thread.newThread("firestore_thread.lua")
    thread:start(reqCh, resCh, BASE_DOC, API_KEY)
end

-- ── 공개 API ──────────────────────────────────────────────
function M.loadLeaderboard()
    if not reqCh then return end
    local query = {
        structuredQuery = {
            from     = {{collectionId = "rankings"}},
            orderBy  = {{field = {fieldPath = "score"}, direction = "DESCENDING"}},
            limit    = 10,
        }
    }
    reqCh:push({
        type = "query",
        url  = BASE_DOC .. ":runQuery?key=" .. API_KEY,
        body = json.encode(query),
    })
end

function M.saveScore(name, score)
    if not reqCh then return end
    local doc = {
        fields = {
            name  = {stringValue  = name},
            score = {integerValue = tostring(math.floor(score))},
            date  = {stringValue  = os.date("!%Y-%m-%dT%H:%M:%SZ")},
        }
    }
    reqCh:push({
        type = "post",
        url  = BASE_DOC .. "/rankings?key=" .. API_KEY,
        body = json.encode(doc),
    })
end

-- Top-10 여부 판단
function M.isTopTen(score, board)
    if #board < 10 then return true end
    return score > board[#board].score
end

-- Firestore runQuery 응답 파싱
function M.parseRankings(body)
    local data = json.decode(body)
    if not data then return {} end
    local out = {}
    for _, item in ipairs(data) do
        if item.document and item.document.fields then
            local f = item.document.fields
            local sc = 0
            if f.score then
                sc = tonumber(f.score.integerValue)
                 or tonumber(f.score.doubleValue) or 0
            end
            out[#out+1] = {
                name  = f.name and f.name.stringValue or "?",
                score = sc,
                date  = f.date and f.date.stringValue or "",
            }
        end
    end
    return out
end

-- 매 프레임 응답 폴링 (non-blocking)
function M.poll()
    if not resCh then return nil end
    return resCh:pop()
end

function M.quit()
    if reqCh then reqCh:push("quit") end
end

return M
