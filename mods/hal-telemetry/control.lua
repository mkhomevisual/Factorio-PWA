-- HAL Factory Control telemetry bridge. No gameplay commands are registered.
local CONTRACT_VERSION = 1
local PREFIX = "HAL_TELEMETRY_V1:"

local function escape(value)
  return tostring(value):gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r')
end
local function quote(value) return '"' .. escape(value) .. '"' end
local function json(value)
  local kind = type(value)
  if kind == 'string' then return quote(value) end
  if kind == 'number' or kind == 'boolean' then return tostring(value) end
  if value == nil then return 'null' end
  local parts, array = {}, (#value > 0)
  if array then for _, item in ipairs(value) do table.insert(parts, json(item)) end else for key, item in pairs(value) do table.insert(parts, quote(key) .. ':' .. json(item)) end end
  return (array and '[' or '{') .. table.concat(parts, ',') .. (array and ']' or '}')
end

local function json_array(values)
  local parts = {}
  for _, value in ipairs(values) do table.insert(parts, json(value)) end
  return '[' .. table.concat(parts, ',') .. ']'
end

local function initialize()
  global.hal = global.hal or { next_event_id = 1, events = {}, personal = {} }
end
script.on_init(initialize)
script.on_configuration_changed(initialize)

local function record(kind, player_index, detail)
  initialize()
  local event = { id = tostring(global.hal.next_event_id), type = kind, tick = game.tick, player_index = player_index, detail = detail or {} }
  global.hal.next_event_id = global.hal.next_event_id + 1
  table.insert(global.hal.events, event)
  if #global.hal.events > 10000 then table.remove(global.hal.events, 1) end
end

local function personal(index)
  global.hal.personal[index] = global.hal.personal[index] or { handCrafted = 0, mined = 0, built = 0, deaths = 0 }
  return global.hal.personal[index]
end

script.on_event(defines.events.on_player_joined_game, function(e) record('player.joined', e.player_index) end)
script.on_event(defines.events.on_player_left_game, function(e) record('player.left', e.player_index) end)
script.on_event(defines.events.on_player_died, function(e) personal(e.player_index).deaths = personal(e.player_index).deaths + 1; record('player.died', e.player_index) end)
script.on_event(defines.events.on_research_finished, function(e) record('research.finished', nil, { research = e.research.name, force = e.research.force.name }) end)
script.on_event(defines.events.on_rocket_launched, function(e) record('rocket.launched', e.rocket_silo.last_user and e.rocket_silo.last_user.index or nil) end)
script.on_event(defines.events.on_player_crafted_item, function(e) personal(e.player_index).handCrafted = personal(e.player_index).handCrafted + e.item_stack.count end)
script.on_event(defines.events.on_player_mined_entity, function(e) personal(e.player_index).mined = personal(e.player_index).mined + 1 end)
script.on_event(defines.events.on_built_entity, function(e) personal(e.player_index).built = personal(e.player_index).built + 1 end)
script.on_event(defines.events.on_robot_built_entity, function(e) if e.player_index then personal(e.player_index).built = personal(e.player_index).built + 1 end end)

local function make_players()
  local players = {}
  for _, player in pairs(game.players) do
    local metrics = global.hal.personal[player.index] or { handCrafted = 0, mined = 0, built = 0, deaths = 0 }
    table.insert(players, { factorioName = player.name, online = player.connected, playtimeSeconds = math.floor(player.online_time / 60), personalActivity = metrics })
  end
  return players
end

local function make_factory()
  local result = {}
  -- Current UI consumes the player's common force. Multi-force support is retained by force name in later contract fields.
  local force = game.forces.player
  if not force then return result end
  local output, input = force.item_production_statistics.get_output_counts(), force.item_production_statistics.get_input_counts()
  local keys = {}; for item, _ in pairs(output) do keys[item] = true end; for item, _ in pairs(input) do keys[item] = true end
  for item, _ in pairs(keys) do table.insert(result, { item = item, produced = output[item] or 0, consumed = input[item] or 0 }) end
  return result
end

commands.add_command('hal-telemetry', 'HAL Factory Control telemetry; usage: /hal-telemetry snapshot <after-event-id>', function(command)
  initialize()
  local _, after = string.match(command.parameter or '', '^(%S+)%s*(.*)$')
  local after_id = tonumber(after) or 0
  local events = {}
  for _, event in ipairs(global.hal.events) do
    if tonumber(event.id) > after_id then
      local player = event.player_index and game.players[event.player_index] or nil
      table.insert(events, { id = event.id, type = event.type, tick = event.tick, playerName = player and player.name or nil, detail = event.detail })
    end
  end
  local server = { online = true, version = game.active_mods.base, gameState = game.tick_paused and 'paused' or 'running', uptimeSeconds = math.floor(game.tick / 60) }
  -- Explicit array encoding keeps an empty player/event/factory list valid JSON ([] rather than {}).
  local payload = '{' ..
    '"contractVersion":' .. json(CONTRACT_VERSION) .. ',' ..
    '"generatedAtTick":' .. json(game.tick) .. ',' ..
    '"server":' .. json(server) .. ',' ..
    '"players":' .. json_array(make_players()) .. ',' ..
    '"sharedFactory":' .. json_array(make_factory()) .. ',' ..
    '"events":{"afterId":' .. json(tostring(after_id)) .. ',"highWatermark":' .. json(tostring(global.hal.next_event_id - 1)) .. ',"items":' .. json_array(events) .. '}' ..
  '}'
  rcon.print(PREFIX .. payload)
end)
