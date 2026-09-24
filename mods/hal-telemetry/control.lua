-- HAL Factory Control telemetry bridge. It reads game state and never mutates gameplay.
local CONTRACT_VERSION = 3
local PREFIX = "HAL_TELEMETRY_V3:"

local function escape(value)
  return tostring(value):gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r')
end

local function array(values) return { __hal_json_array = true, values = values or {} } end

local function json(value)
  local kind = type(value)
  if kind == 'string' then return '"' .. escape(value) .. '"' end
  if kind == 'number' then
    if value ~= value or value == math.huge or value == -math.huge then return 'null' end
    return tostring(value)
  end
  if kind == 'boolean' then return tostring(value) end
  if value == nil then return 'null' end
  if kind ~= 'table' then return 'null' end
  local parts = {}
  if value.__hal_json_array then
    for _, item in ipairs(value.values) do table.insert(parts, json(item)) end
    return '[' .. table.concat(parts, ',') .. ']'
  end
  for key, item in pairs(value) do table.insert(parts, '"' .. escape(key) .. '":' .. json(item)) end
  return '{' .. table.concat(parts, ',') .. '}'
end

local function initialize()
  storage.hal = storage.hal or {}
  storage.hal.next_event_id = storage.hal.next_event_id or 1
  storage.hal.events = storage.hal.events or {}
  storage.hal.personal = storage.hal.personal or {}
  storage.hal.last_seen_tick = storage.hal.last_seen_tick or {}
  storage.hal.probes = storage.hal.probes or {}
end

script.on_init(initialize)
script.on_configuration_changed(initialize)

local function instance_id()
  initialize()
  if not storage.hal.instance_id then
    local first_surface = game.surfaces[1]
    local seed = first_surface and first_surface.map_gen_settings.seed or 0
    storage.hal.instance_id = 'save-' .. tostring(seed) .. '-' .. tostring(game.tick)
  end
  return storage.hal.instance_id
end

local function enum_name(values, selected)
  for name, value in pairs(values) do if value == selected then return name end end
  return tostring(selected)
end

local function record(kind, player_index, detail)
  initialize()
  local event = {
    id = tostring(storage.hal.next_event_id),
    type = kind,
    tick = game.tick,
    player_index = player_index,
    detail = detail or {}
  }
  storage.hal.next_event_id = storage.hal.next_event_id + 1
  table.insert(storage.hal.events, event)
  if #storage.hal.events > 10000 then table.remove(storage.hal.events, 1) end
end

local function personal(index)
  initialize()
  storage.hal.personal[index] = storage.hal.personal[index] or { handCrafted = 0, mined = 0, built = 0, deaths = 0 }
  return storage.hal.personal[index]
end

script.on_event(defines.events.on_player_joined_game, function(e)
  storage.hal.last_seen_tick[e.player_index] = game.tick
  record('player.joined', e.player_index)
end)
script.on_event(defines.events.on_player_left_game, function(e)
  storage.hal.last_seen_tick[e.player_index] = game.tick
  record('player.left', e.player_index)
end)
script.on_event(defines.events.on_player_changed_surface, function(e)
  local player = game.get_player(e.player_index)
  record('player.surface-changed', e.player_index, { surface = player and player.surface.name or 'unknown' })
end)
script.on_event(defines.events.on_player_died, function(e)
  personal(e.player_index).deaths = personal(e.player_index).deaths + 1
  record('player.died', e.player_index)
end)
script.on_event(defines.events.on_research_started, function(e)
  record('research.started', nil, { research = e.research.name, force = e.research.force.name })
end)
script.on_event(defines.events.on_research_finished, function(e)
  record('research.finished', nil, { research = e.research.name, force = e.research.force.name })
end)
script.on_event(defines.events.on_rocket_launched, function(e)
  record('rocket.launched', e.rocket_silo.last_user and e.rocket_silo.last_user.index or nil)
end)
script.on_event(defines.events.on_space_platform_changed_state, function(e)
  record('space-platform.state-changed', nil, {
    platform = e.platform.name,
    platformId = tostring(e.platform.index),
    oldState = enum_name(defines.space_platform_state, e.old_state),
    state = enum_name(defines.space_platform_state, e.platform.state)
  })
end)
script.on_event(defines.events.on_player_crafted_item, function(e)
  personal(e.player_index).handCrafted = personal(e.player_index).handCrafted + e.item_stack.count
end)
script.on_event(defines.events.on_player_mined_entity, function(e)
  personal(e.player_index).mined = personal(e.player_index).mined + 1
end)
script.on_event(defines.events.on_built_entity, function(e)
  if e.player_index then personal(e.player_index).built = personal(e.player_index).built + 1 end
end)

local function make_players()
  local players = {}
  for _, player in pairs(game.players) do
    local metrics = storage.hal.personal[player.index] or { handCrafted = 0, mined = 0, built = 0, deaths = 0 }
    table.insert(players, {
      factorioName = player.name,
      forceName = player.force.name,
      online = player.connected,
      lastOnlineAtTick = storage.hal.last_seen_tick[player.index],
      playtimeSeconds = math.floor(player.online_time / 60),
      surfaceName = player.surface and player.surface.name or nil,
      personalActivity = metrics
    })
  end
  return players
end

local function make_flow(statistics)
  local totals = {}
  for prototype, count in pairs(statistics.input_counts) do
    totals[prototype] = totals[prototype] or { item = prototype, produced = 0, consumed = 0, productionRate = 0, consumptionRate = 0 }
    totals[prototype].produced = count
    totals[prototype].productionRate = statistics.get_flow_count {
      name = prototype,
      category = 'input',
      precision_index = defines.flow_precision_index.one_minute
    }
  end
  for prototype, count in pairs(statistics.output_counts) do
    totals[prototype] = totals[prototype] or { item = prototype, produced = 0, consumed = 0, productionRate = 0, consumptionRate = 0 }
    totals[prototype].consumed = count
    totals[prototype].consumptionRate = statistics.get_flow_count {
      name = prototype,
      category = 'output',
      precision_index = defines.flow_precision_index.one_minute
    }
  end
  local result = {}
  for _, counts in pairs(totals) do table.insert(result, counts) end
  table.sort(result, function(left, right) return left.item < right.item end)
  return result
end

local function make_quality_flow(statistics)
  local prototypes_seen = {}
  for prototype, _ in pairs(statistics.input_counts) do prototypes_seen[prototype] = true end
  for prototype, _ in pairs(statistics.output_counts) do prototypes_seen[prototype] = true end
  local result = {}
  for prototype, _ in pairs(prototypes_seen) do
    for quality_name, _ in pairs(prototypes.quality) do
      if quality_name ~= 'normal' then
        local id = { name = prototype, quality = quality_name }
        local produced = statistics.get_input_count(id)
        local consumed = statistics.get_output_count(id)
        if produced > 0 or consumed > 0 then
          table.insert(result, {
            item = prototype,
            quality = quality_name,
            produced = produced,
            consumed = consumed,
            productionRate = statistics.get_flow_count {
              name = id,
              category = 'input',
              precision_index = defines.flow_precision_index.one_minute
            },
            consumptionRate = statistics.get_flow_count {
              name = id,
              category = 'output',
              precision_index = defines.flow_precision_index.one_minute
            }
          })
        end
      end
    end
  end
  table.sort(result, function(left, right)
    if left.item == right.item then return left.quality < right.quality end
    return left.item < right.item
  end)
  return result
end

local function flow_rate(statistics, category)
  if not statistics or not statistics.valid then return 0 end
  local counts = category == 'input' and statistics.input_counts or statistics.output_counts
  local total = 0
  for prototype, _ in pairs(counts) do
    total = total + statistics.get_flow_count {
      name = prototype,
      category = category,
      precision_index = defines.flow_precision_index.one_minute
    }
  end
  -- Electric flow statistics are normalized to joules/tick; convert to watts.
  return total * 60
end

local function flow_breakdown(statistics, category)
  local result = {}
  if not statistics or not statistics.valid then return result end
  local counts = category == 'input' and statistics.input_counts or statistics.output_counts
  for prototype, _ in pairs(counts) do
    local prototype_name = type(prototype) == 'string' and prototype or prototype.name
    local watts = statistics.get_flow_count {
      name = prototype,
      category = category,
      precision_index = defines.flow_precision_index.one_minute
    } * 60
    if prototype_name and watts > 0 then result[prototype_name] = (result[prototype_name] or 0) + watts end
  end
  return result
end

local function merge_power_breakdown(target, source)
  for prototype, watts in pairs(source) do target[prototype] = (target[prototype] or 0) + watts end
end

local function power_breakdown_list(values)
  local result = {}
  for prototype, watts in pairs(values) do table.insert(result, { prototype = prototype, watts = watts }) end
  table.sort(result, function(left, right) return left.watts > right.watts end)
  while #result > 12 do table.remove(result) end
  return result
end

local function power_from_statistics(statistics)
  if not statistics or not statistics.valid then
    return { available = false, networkCount = 0, productionWatts = 0, consumptionWatts = 0, accumulatorChargeJoules = 0, accumulatorCapacityJoules = 0, producers = array(), consumers = array() }
  end
  return {
    available = true,
    networkCount = 1,
    productionWatts = flow_rate(statistics, 'output'),
    consumptionWatts = flow_rate(statistics, 'input'),
    accumulatorChargeJoules = 0,
    accumulatorCapacityJoules = 0,
    producers = array(power_breakdown_list(flow_breakdown(statistics, 'output'))),
    consumers = array(power_breakdown_list(flow_breakdown(statistics, 'input')))
  }
end

local function make_power(surface, force)
  local network_statistics = {}
  -- Keep the safe snapshot bounded. Walking every electric pole and
  -- accumulator caused full entity scans and visible UPS spikes.
  if surface.has_global_electric_network and surface.global_electric_network_statistics then
    table.insert(network_statistics, surface.global_electric_network_statistics)
  end

  local production, consumption = 0, 0
  local producers, consumers = {}, {}
  for _, statistics in ipairs(network_statistics) do
    production = production + flow_rate(statistics, 'output')
    consumption = consumption + flow_rate(statistics, 'input')
    merge_power_breakdown(producers, flow_breakdown(statistics, 'output'))
    merge_power_breakdown(consumers, flow_breakdown(statistics, 'input'))
  end

  return {
    available = #network_statistics > 0,
    networkCount = #network_statistics,
    productionWatts = production,
    consumptionWatts = consumption,
    -- Exact accumulator totals need an entity scan and are intentionally not
    -- part of the normal refresh anymore.
    accumulatorChargeJoules = 0,
    accumulatorCapacityJoules = 0,
    producers = array(power_breakdown_list(producers)),
    consumers = array(power_breakdown_list(consumers))
  }
end

local function production_forces()
  local result = {}
  for _, player in pairs(game.players) do result[player.force.name] = player.force end
  if next(result) == nil and game.forces['player'] then result.player = game.forces['player'] end
  return result
end

local function make_scopes(forces)
  local scopes = {}
  for _, force in pairs(forces) do
    for _, surface in pairs(game.surfaces) do
      local platform = surface.platform
      local planet = surface.planet
      if not platform or platform.force.name == force.name then
      local kind = platform and 'platform' or (planet and 'planet' or 'other')
      local pollution = nil
      local evolution = nil
      if planet then
        pollution = surface.get_total_pollution()
        if game.forces.enemy then evolution = game.forces.enemy.get_evolution_factor(surface) end
      end
      local item_statistics = force.get_item_production_statistics(surface)
      local fluid_statistics = force.get_fluid_production_statistics(surface)
      table.insert(scopes, {
        forceName = force.name,
        surface = {
          name = surface.name,
          index = surface.index,
          kind = kind,
          planetName = planet and planet.name or nil,
          platformId = platform and tostring(platform.index) or nil
        },
        items = array(make_flow(item_statistics)),
        itemQualities = array(make_quality_flow(item_statistics)),
        fluids = array(make_flow(fluid_statistics)),
        pollution = pollution,
        evolutionFactor = evolution,
        power = make_power(surface, force)
      })
      end
    end
  end
  table.sort(scopes, function(left, right)
    if left.forceName == right.forceName then return left.surface.index < right.surface.index end
    return left.forceName < right.forceName
  end)
  return scopes
end

local function make_research(forces)
  local result = {}
  for _, force in pairs(forces) do
    local current = force.current_research
    local current_data = nil
    if current then
      local ingredients = {}
      for _, ingredient in ipairs(current.research_unit_ingredients) do
        table.insert(ingredients, { item = ingredient.name, amount = ingredient.amount })
      end
      current_data = {
        technology = current.name,
        level = current.level,
        progress = force.research_progress,
        unitCount = current.research_unit_count,
        unitEnergy = current.research_unit_energy,
        ingredients = array(ingredients)
      }
    end
    local queue = {}
    for _, technology in ipairs(force.research_queue) do table.insert(queue, technology) end
    table.insert(result, { forceName = force.name, current = current_data, queue = array(queue) })
  end
  return result
end

local function sorted_contents(contents)
  local result = {}
  local total = 0
  for _, entry in pairs(contents or {}) do
    table.insert(result, { item = entry.name, quality = entry.quality or 'normal', count = entry.count })
    total = total + entry.count
  end
  table.sort(result, function(left, right)
    if left.count == right.count then return left.item < right.item end
    return left.count > right.count
  end)
  return result, total
end

local function make_logistic_networks(forces)
  local result = {}
  for _, force in pairs(forces) do
    for surface_name, networks in pairs(force.logistic_networks) do
      for _, network in pairs(networks) do
        if network.valid then
          local contents, total = sorted_contents(network.get_contents())
          local first_cell = network.cells[1]
          local owner = first_cell and first_cell.owner or nil
          local charging, waiting = 0, 0
          for _, cell in pairs(network.cells) do
            charging = charging + cell.charging_robot_count
            waiting = waiting + cell.to_charge_robot_count
          end
          table.insert(result, {
            id = force.name .. ':' .. surface_name .. ':' .. tostring(network.network_id),
            forceName = force.name,
            surfaceName = surface_name,
            name = network.custom_name,
            x = owner and owner.position.x or nil,
            y = owner and owner.position.y or nil,
            totalItems = total,
            contents = array(contents),
            logisticRobots = { available = network.available_logistic_robots, total = network.all_logistic_robots },
            constructionRobots = { available = network.available_construction_robots, total = network.all_construction_robots },
            chargingRobots = charging,
            waitingToChargeRobots = waiting
          })
        end
      end
    end
  end
  table.sort(result, function(left, right) return left.id < right.id end)
  return result
end

local function inventory_contents(entity)
  local inventories = {}
  if entity.type == 'container' or entity.type == 'logistic-container' then
    table.insert(inventories, entity.get_inventory(defines.inventory.chest))
  elseif entity.type == 'roboport' then
    table.insert(inventories, entity.get_inventory(defines.inventory.roboport_robot))
    table.insert(inventories, entity.get_inventory(defines.inventory.roboport_material))
  end
  local merged = {}
  for _, inventory in pairs(inventories) do
    if inventory and inventory.valid then
      for _, entry in pairs(inventory.get_contents()) do
        local key = entry.name .. ':' .. (entry.quality or 'normal')
        merged[key] = merged[key] or { name = entry.name, quality = entry.quality or 'normal', count = 0 }
        merged[key].count = merged[key].count + entry.count
      end
    end
  end
  return sorted_contents(merged)
end

local function probe_signals(entity)
  local merged = {}
  for _, connector in pairs { defines.wire_connector_id.circuit_red, defines.wire_connector_id.circuit_green } do
    local ok, signals = pcall(function() return entity.get_signals(connector) end)
    if ok and signals then
      for _, entry in pairs(signals) do
        local signal = entry.signal
        local key = signal.type .. ':' .. signal.name .. ':' .. (signal.quality or 'normal')
        merged[key] = merged[key] or { type = signal.type, name = signal.name, quality = signal.quality, count = 0 }
        merged[key].count = merged[key].count + entry.count
      end
    end
  end
  local result = {}
  for _, entry in pairs(merged) do table.insert(result, entry) end
  table.sort(result, function(left, right) return math.abs(left.count) > math.abs(right.count) end)
  return result
end

local function make_probes()
  local result = {}
  for id, probe in pairs(storage.hal.probes) do
    local entity = game.get_entity_by_unit_number(probe.unit_number)
    if not entity or not entity.valid then
      table.insert(result, {
        id = id, name = probe.name, entityName = probe.entity_name, entityType = probe.entity_type,
        forceName = probe.force_name, surfaceName = probe.surface_name, x = probe.x, y = probe.y,
        valid = false, status = nil, items = array(), fluids = array(), signals = array(), power = nil,
        logisticRobots = nil, constructionRobots = nil
      })
    else
      local items = inventory_contents(entity)
      local fluids = {}
      for fluid_name, amount in pairs(entity.get_fluid_contents()) do table.insert(fluids, { name = fluid_name, amount = amount }) end
      table.sort(fluids, function(left, right) return left.amount > right.amount end)
      local logistic_cell = entity.logistic_cell
      local power = nil
      if entity.type == 'electric-pole' then power = power_from_statistics(entity.electric_network_statistics) end
      table.insert(result, {
        id = id, name = probe.name, entityName = entity.name, entityType = entity.type,
        forceName = entity.force.name, surfaceName = entity.surface.name, x = entity.position.x, y = entity.position.y,
        valid = true, status = entity.status and enum_name(defines.entity_status, entity.status) or nil,
        items = array(items), fluids = array(fluids), signals = array(probe_signals(entity)),
        power = power,
        logisticRobots = logistic_cell and { available = logistic_cell.logistic_network.available_logistic_robots, total = logistic_cell.logistic_network.all_logistic_robots } or nil,
        constructionRobots = logistic_cell and { available = logistic_cell.logistic_network.available_construction_robots, total = logistic_cell.logistic_network.all_construction_robots } or nil
      })
    end
  end
  table.sort(result, function(left, right) return left.name < right.name end)
  return result
end

local function platform_cargo(platform)
  local result = {}
  if not platform.hub then return result end
  local inventory = platform.hub.get_inventory(defines.inventory.hub_main)
  if not inventory then return result end
  for _, entry in ipairs(inventory.get_contents()) do
    table.insert(result, { item = entry.name, quality = entry.quality, count = entry.count })
  end
  table.sort(result, function(left, right)
    if left.count == right.count then return left.item < right.item end
    return left.count > right.count
  end)
  return result
end

local function make_platforms(forces)
  local result = {}
  for _, force in pairs(forces) do
    for _, platform in pairs(force.platforms) do
      local schedule = platform.schedule
      local active_record = schedule and schedule.records and schedule.records[schedule.current] or nil
      table.insert(result, {
        id = tostring(platform.index),
        name = platform.name,
        forceName = force.name,
        state = enum_name(defines.space_platform_state, platform.state),
        paused = platform.paused,
        location = platform.space_location and platform.space_location.name or nil,
        lastLocation = platform.last_visited_space_location and platform.last_visited_space_location.name or nil,
        destination = active_record and active_record.station or nil,
        connection = platform.space_connection and platform.space_connection.name or nil,
        distance = platform.distance,
        speed = platform.speed,
        weight = platform.weight,
        damagedTiles = #platform.damaged_tiles,
        cargo = array(platform_cargo(platform))
      })
    end
  end
  table.sort(result, function(left, right) return left.name < right.name end)
  return result
end

local function make_snapshot(command)
  initialize()
  local current_instance = instance_id()
  local _, requested_cursor = string.match(command.parameter or '', '^(%S+)%s*(.*)$')
  local requested_instance, after = string.match(requested_cursor or '', '^([^:]+):(%d+)$')
  local after_id = tonumber(after) or tonumber(requested_cursor) or 0
  if requested_instance and requested_instance ~= current_instance then after_id = 0 end

  local events = {}
  for _, event in ipairs(storage.hal.events) do
    if tonumber(event.id) > after_id then
      local player = event.player_index and game.players[event.player_index] or nil
      table.insert(events, {
        id = event.id,
        type = event.type,
        tick = event.tick,
        playerName = player and player.name or nil,
        detail = event.detail
      })
    end
  end

  local forces = production_forces()
  return json {
    contractVersion = CONTRACT_VERSION,
    capabilities = array { 'item-flow', 'fluid-flow', 'quality-flow', 'surface-flow', 'research', 'space-platforms', 'power', 'pollution', 'event-ticks', 'logistics', 'probes', 'game-tasks' },
    instanceId = current_instance,
    generatedAtTick = game.tick,
    server = {
      online = true,
      version = script.active_mods.base,
      gameState = game.tick_paused and 'paused' or 'running',
      uptimeSeconds = math.floor(game.tick / 60)
    },
    players = array(make_players()),
    scopes = array(make_scopes(forces)),
    research = array(make_research(forces)),
    platforms = array(make_platforms(forces)),
    logisticNetworks = array(make_logistic_networks(forces)),
    probes = array(make_probes()),
    events = {
      afterId = tostring(after_id),
      highWatermark = current_instance .. ':' .. tostring(storage.hal.next_event_id - 1),
      items = array(events)
    }
  }
end

commands.add_command('hal-telemetry', 'HAL Factory Control telemetry; usage: /hal-telemetry snapshot <cursor>', function(command)
  local ok, payload = pcall(make_snapshot, command)
  if not ok then
    local message = tostring(payload):gsub('[\r\n]', ' ')
    log('HAL telemetry snapshot failed: ' .. message)
    rcon.print('HAL_TELEMETRY_ERROR:' .. message)
    return
  end
  rcon.print(PREFIX .. payload)
end)

local function command_player(command)
  if not command.player_index then return nil end
  return game.get_player(command.player_index)
end

commands.add_command('hal-task', 'Create a HAL task; usage: /hal-task <description>', function(command)
  local player = command_player(command)
  if not player then return end
  local title = (command.parameter or ''):match('^%s*(.-)%s*$')
  if title == '' then player.print('[HAL] Použití: /hal-task <popis>'); return end
  title = string.sub(title, 1, 180)
  record('task.create-requested', player.index, {
    title = title,
    surface = player.surface.name,
    x = player.position.x,
    y = player.position.y
  })
  player.print('[HAL] Úkol byl zařazen ke zpracování.')
end)

commands.add_command('hal-done', 'Complete a HAL task; usage: /hal-done <task code>', function(command)
  local player = command_player(command)
  if not player then return end
  local code = string.upper((command.parameter or ''):match('^%s*(.-)%s*$'))
  if not string.match(code, '^[A-F0-9][A-F0-9][A-F0-9][A-F0-9]+$') then player.print('[HAL] Použití: /hal-done <kód úkolu>'); return end
  record('task.complete-requested', player.index, { code = string.sub(code, 1, 12) })
  player.print('[HAL] Dokončení úkolu bylo zařazeno ke zpracování.')
end)

local allowed_probe_types = {
  ['container'] = true, ['logistic-container'] = true, ['storage-tank'] = true, ['roboport'] = true,
  ['electric-pole'] = true, ['constant-combinator'] = true, ['decider-combinator'] = true,
  ['arithmetic-combinator'] = true, ['selector-combinator'] = true
}

commands.add_command('hal-probe', 'Watch selected entity in HAL; usage: /hal-probe <name>', function(command)
  local player = command_player(command)
  if not player then return end
  local name = (command.parameter or ''):match('^%s*(.-)%s*$')
  local entity = player.selected
  if name == '' then player.print('[HAL] Použití: vyber entitu kurzorem a napiš /hal-probe <název>'); return end
  if not entity or not entity.valid or not allowed_probe_types[entity.type] or not entity.unit_number then
    player.print('[HAL] Vyber chest, tank, roboport, elektrický sloup nebo combinator.'); return
  end
  local id = 'probe-' .. tostring(entity.unit_number)
  storage.hal.probes[id] = {
    name = string.sub(name, 1, 80), unit_number = entity.unit_number, entity_name = entity.name, entity_type = entity.type,
    force_name = entity.force.name, surface_name = entity.surface.name, x = entity.position.x, y = entity.position.y
  }
  record('probe.created', player.index, { probeId = id, name = storage.hal.probes[id].name, entity = entity.name })
  player.print('[HAL] Sonda „' .. storage.hal.probes[id].name .. '“ byla vytvořena.')
end)

commands.add_command('hal-unprobe', 'Remove a HAL probe; usage: /hal-unprobe <name>', function(command)
  local player = command_player(command)
  if not player then return end
  local requested = (command.parameter or ''):match('^%s*(.-)%s*$')
  local selected_id = player.selected and player.selected.unit_number and ('probe-' .. tostring(player.selected.unit_number)) or nil
  local removed_id, removed_name = nil, nil
  for id, probe in pairs(storage.hal.probes) do
    if id == selected_id or (requested ~= '' and string.lower(probe.name) == string.lower(requested)) then
      removed_id, removed_name = id, probe.name
      storage.hal.probes[id] = nil
      break
    end
  end
  if not removed_id then player.print('[HAL] Sonda nebyla nalezena. Vyber její entitu nebo zadej přesný název.'); return end
  record('probe.removed', player.index, { probeId = removed_id, name = removed_name })
  player.print('[HAL] Sonda „' .. removed_name .. '“ byla odebrána.')
end)
