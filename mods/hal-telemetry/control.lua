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
  -- Factorio 2.0 replaces the legacy `global` table with `storage`.
  storage.hal = storage.hal or {}
  storage.hal.next_event_id = storage.hal.next_event_id or 1
  storage.hal.events = storage.hal.events or {}
  storage.hal.personal = storage.hal.personal or {}
end
script.on_init(initialize)
script.on_configuration_changed(initialize)

local function record(kind, player_index, detail)
  initialize()
  local event = { id = tostring(storage.hal.next_event_id), type = kind, tick = game.tick, player_index = player_index, detail = detail or {} }
  storage.hal.next_event_id = storage.hal.next_event_id + 1
  table.insert(storage.hal.events, event)
  if #storage.hal.events > 10000 then table.remove(storage.hal.events, 1) end
end

local function personal(index)
  initialize()
  storage.hal.personal[index] = storage.hal.personal[index] or { handCrafted = 0, mined = 0, built = 0, deaths = 0 }
  return storage.hal.personal[index]
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
    local metrics = storage.hal.personal[player.index] or { handCrafted = 0, mined = 0, built = 0, deaths = 0 }
    table.insert(players, { factorioName = player.name, online = player.connected, playtimeSeconds = math.floor(player.online_time / 60), personalActivity = metrics })
  end
  return players
end

local function make_factory()
  local result, totals = {}, {}
  -- Current UI consumes the player's common force. Multi-force support is retained by force name in later contract fields.
  local force = game.forces['player']
  if not force then return result end

  -- Factorio 2.0 stores production statistics per surface. Aggregate every
  -- surface so Space Age production is represented as one shared factory.
  for _, surface in pairs(game.surfaces) do
    local statistics = force.get_item_production_statistics(surface)
    for item, count in pairs(statistics.output_counts) do
      totals[item] = totals[item] or { produced = 0, consumed = 0 }
      totals[item].produced = totals[item].produced + count
    end
    for item, count in pairs(statistics.input_counts) do
      totals[item] = totals[item] or { produced = 0, consumed = 0 }
      totals[item].consumed = totals[item].consumed + count
    end
  end

  for item, counts in pairs(totals) do
    table.insert(result, { item = item, produced = counts.produced, consumed = counts.consumed })
  end
  table.sort(result, function(left, right) return left.item < right.item end)
  return result
end

local function make_snapshot(command)
  initialize()
  local _, after = string.match(command.parameter or '', '^(%S+)%s*(.*)$')
  local after_id = tonumber(after) or 0
  local events = {}
  for _, event in ipairs(storage.hal.events) do
    if tonumber(event.id) > after_id then
      local player = event.player_index and game.players[event.player_index] or nil
      table.insert(events, { id = event.id, type = event.type, tick = event.tick, playerName = player and player.name or nil, detail = event.detail })
    end
  end
  local server = { online = true, version = script.active_mods['base'], gameState = game.tick_paused and 'paused' or 'running', uptimeSeconds = math.floor(game.tick / 60) }
  -- Explicit array encoding keeps an empty player/event/factory list valid JSON ([] rather than {}).
  return '{' ..
    '"contractVersion":' .. json(CONTRACT_VERSION) .. ',' ..
    '"generatedAtTick":' .. json(game.tick) .. ',' ..
    '"server":' .. json(server) .. ',' ..
    '"players":' .. json_array(make_players()) .. ',' ..
    '"sharedFactory":' .. json_array(make_factory()) .. ',' ..
    '"events":{"afterId":' .. json(tostring(after_id)) .. ',"highWatermark":' .. json(tostring(storage.hal.next_event_id - 1)) .. ',"items":' .. json_array(events) .. '}' ..
    '}'
end

commands.add_command('hal-telemetry', 'HAL Factory Control telemetry; usage: /hal-telemetry snapshot <after-event-id>', function(command)
  -- A telemetry bug must never terminate the multiplayer server. Return a
  -- diagnostic response and keep the world running if snapshot creation fails.
  local ok, payload = pcall(make_snapshot, command)
  if not ok then
    local message = tostring(payload):gsub('[\r\n]', ' ')
    log('HAL telemetry snapshot failed: ' .. message)
    rcon.print('HAL_TELEMETRY_ERROR:' .. message)
    return
  end
  rcon.print(PREFIX .. payload)
end)
