function love.conf(t)
    t.identity        = "emoji-tray"
    t.version         = "11.5"
    t.window.title    = "쟁반 균형 게임"
    t.window.width    = 540
    t.window.height   = 960
    t.window.fullscreen     = false
    t.window.fullscreentype = "desktop"
    t.window.resizable      = true
    t.modules.joystick = false
    t.modules.physics  = false
    t.modules.video    = false
    t.console          = false
end
