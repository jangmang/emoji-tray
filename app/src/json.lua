-- src/json.lua  ─  경량 JSON 인코더/디코더 (rxi/json.lua 기반, MIT)
local json = {}

-- ── 인코더 ────────────────────────────────────────────────
local encode

local ESC_MAP = {
    ["\\"] = "\\\\", ['"'] = '\\"', ["\b"] = "\\b",
    ["\f"] = "\\f",  ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t",
}
local function escape(s)
    return s:gsub('[\\"\b\f\n\r\t]', ESC_MAP)
          :gsub("[\0-\31]", function(c) return string.format("\\u%04x", c:byte()) end)
end

local function enc_table(val, stack)
    stack = stack or {}
    if stack[val] then error("circular ref") end
    stack[val] = true
    local res = {}
    if rawget(val, 1) ~= nil or next(val) == nil then
        for i = 1, #val do res[i] = encode(val[i], stack) end
        stack[val] = nil
        return "[" .. table.concat(res, ",") .. "]"
    else
        for k, v in pairs(val) do
            if type(k) ~= "string" then error("key must be string") end
            res[#res+1] = '"' .. escape(k) .. '":' .. encode(v, stack)
        end
        stack[val] = nil
        return "{" .. table.concat(res, ",") .. "}"
    end
end

encode = function(val, stack)
    local t = type(val)
    if     t == "string"  then return '"' .. escape(val) .. '"'
    elseif t == "number"  then return (val ~= val) and "null" or tostring(val)
    elseif t == "boolean" then return val and "true" or "false"
    elseif t == "nil"     then return "null"
    elseif t == "table"   then return enc_table(val, stack)
    else error("cannot encode type: " .. t)
    end
end

json.encode = encode

-- ── 디코더 ────────────────────────────────────────────────
local function skip_ws(s, i)
    return s:match("^%s*()", i)
end

local function decode_value(s, i)
    i = skip_ws(s, i)
    local c = s:sub(i, i)

    -- string
    if c == '"' then
        local res, j = "", i + 1
        while j <= #s do
            local ch = s:sub(j, j)
            if ch == '"' then return res, j + 1
            elseif ch == '\\' then
                local nx = s:sub(j+1, j+1)
                local MAP = {['"']='"',['\\']='\\',['/']='',[b]='\b',[f]='\f',[n]='\n',[r]='\r',[t]='\t'}
                -- inline decode
                if nx == '"' or nx == '\\' or nx == '/' then
                    res = res .. nx; j = j + 2
                elseif nx == 'b' then res = res .. '\b'; j = j + 2
                elseif nx == 'f' then res = res .. '\f'; j = j + 2
                elseif nx == 'n' then res = res .. '\n'; j = j + 2
                elseif nx == 'r' then res = res .. '\r'; j = j + 2
                elseif nx == 't' then res = res .. '\t'; j = j + 2
                elseif nx == 'u' then
                    local hex = s:sub(j+2, j+5)
                    local n = tonumber(hex, 16) or 0
                    -- surrogate pair
                    if n >= 0xD800 and n <= 0xDBFF then
                        local hex2 = s:sub(j+8, j+11)
                        local n2 = tonumber(hex2, 16) or 0
                        n = (n - 0xD800) * 0x400 + (n2 - 0xDC00) + 0x10000
                        j = j + 12
                    else
                        j = j + 6
                    end
                    -- UTF-8 encode
                    if n <= 0x7F then res = res .. string.char(n)
                    elseif n <= 0x7FF then
                        res = res .. string.char(0xC0 + math.floor(n/64), 0x80 + n%64)
                    elseif n <= 0xFFFF then
                        res = res .. string.char(0xE0+math.floor(n/4096), 0x80+math.floor(n%4096/64), 0x80+n%64)
                    else
                        res = res .. string.char(0xF0+math.floor(n/262144), 0x80+math.floor(n%262144/4096), 0x80+math.floor(n%4096/64), 0x80+n%64)
                    end
                else
                    res = res .. nx; j = j + 2
                end
            else
                res = res .. ch; j = j + 1
            end
        end
        error("unterminated string")

    -- object
    elseif c == '{' then
        local obj = {}; i = skip_ws(s, i + 1)
        if s:sub(i,i) == '}' then return obj, i+1 end
        while true do
            i = skip_ws(s, i)
            local key; key, i = decode_value(s, i)
            i = skip_ws(s, i)
            assert(s:sub(i,i) == ':', "expected ':'"); i = i + 1
            local val; val, i = decode_value(s, i)
            obj[key] = val
            i = skip_ws(s, i)
            local sep = s:sub(i,i); i = i + 1
            if sep == '}' then return obj, i
            elseif sep ~= ',' then error("expected ',' or '}'") end
        end

    -- array
    elseif c == '[' then
        local arr = {}; i = skip_ws(s, i + 1)
        if s:sub(i,i) == ']' then return arr, i+1 end
        while true do
            local val; val, i = decode_value(s, i)
            arr[#arr+1] = val
            i = skip_ws(s, i)
            local sep = s:sub(i,i); i = i + 1
            if sep == ']' then return arr, i
            elseif sep ~= ',' then error("expected ',' or ']'") end
        end

    -- number
    elseif c:match("[%-%d]") then
        local s2, e = s:match("^(-?%d+%.?%d*[eE]?[+%-]?%d*)()", i)
        return tonumber(s2), e

    -- true / false / null
    elseif s:sub(i, i+3) == "true"  then return true,  i + 4
    elseif s:sub(i, i+4) == "false" then return false, i + 5
    elseif s:sub(i, i+3) == "null"  then return nil,   i + 4

    else
        error("unexpected char: " .. c .. " at pos " .. i)
    end
end

function json.decode(str)
    if not str or str == "" then return nil end
    local ok, val = pcall(decode_value, str, 1)
    if not ok then return nil, val end
    return val
end

return json
