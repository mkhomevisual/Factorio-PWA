import { inflateSync } from 'node:zlib';
import type { BlueprintInspection } from '@hal/contracts';

type BlueprintEntity = { name?: unknown; position?: { x?: unknown; y?: unknown }; connections?: unknown };
type BlueprintTile = { name?: unknown; position?: { x?: unknown; y?: unknown } };
type Blueprint = {
  label?: unknown; description?: unknown; version?: unknown; icons?: Array<{ signal?: { type?: unknown; name?: unknown } }>;
  entities?: BlueprintEntity[]; tiles?: BlueprintTile[]; wires?: unknown[];
};
type BlueprintEnvelope = {
  blueprint?: Blueprint;
  blueprint_book?: Blueprint & { blueprints?: BlueprintEnvelope[] };
  deconstruction_planner?: Blueprint;
  upgrade_planner?: Blueprint;
};

function text(value: unknown) { return typeof value === 'string' ? value : null; }
function factorioVersion(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  const encoded = BigInt(value);
  return `${Number(encoded >> 48n & 0xffffn)}.${Number(encoded >> 32n & 0xffffn)}.${Number(encoded >> 16n & 0xffffn)}.${Number(encoded & 0xffffn)}`;
}

function flattenBlueprints(envelope: BlueprintEnvelope): Blueprint[] {
  if (envelope.blueprint) return [envelope.blueprint];
  if (!envelope.blueprint_book) return [];
  return (envelope.blueprint_book.blueprints ?? []).flatMap(flattenBlueprints);
}

function counts(values: Array<{ name?: unknown }>) {
  const result = new Map<string, number>();
  for (const value of values) if (typeof value.name === 'string') result.set(value.name, (result.get(value.name) ?? 0) + 1);
  return [...result].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

export function inspectBlueprintString(encoded: string): BlueprintInspection {
  const source = encoded.trim();
  if (!source.startsWith('0') || source.length < 2 || source.length > 100_000) throw new Error('Neplatný nebo příliš velký blueprint string.');
  let envelope: BlueprintEnvelope;
  try {
    const compressed = Buffer.from(source.slice(1), 'base64');
    if (!compressed.length) throw new Error('empty');
    envelope = JSON.parse(inflateSync(compressed, { maxOutputLength: 8 * 1024 * 1024 }).toString('utf8')) as BlueprintEnvelope;
  } catch {
    throw new Error('Blueprint string se nepodařilo rozbalit.');
  }

  const entries: Array<[BlueprintInspection['kind'], Blueprint | undefined]> = [
    ['blueprint', envelope.blueprint], ['blueprint-book', envelope.blueprint_book],
    ['deconstruction-planner', envelope.deconstruction_planner], ['upgrade-planner', envelope.upgrade_planner]
  ];
  const selected = entries.find((entry) => entry[1]);
  if (!selected?.[1]) throw new Error('Řetězec neobsahuje podporovaný Factorio blueprint.');
  const [kind, root] = selected;
  const blueprints = flattenBlueprints(envelope);
  const entities = blueprints.flatMap((blueprint) => Array.isArray(blueprint.entities) ? blueprint.entities : []);
  const tiles = blueprints.flatMap((blueprint) => Array.isArray(blueprint.tiles) ? blueprint.tiles : []);
  const positions = [...entities, ...tiles].flatMap((entry) => {
    const x = entry.position?.x; const y = entry.position?.y;
    return typeof x === 'number' && typeof y === 'number' ? [{ x, y }] : [];
  });
  const bounds = positions.length ? {
    width: Math.round((Math.max(...positions.map((point) => point.x)) - Math.min(...positions.map((point) => point.x)) + 1) * 10) / 10,
    height: Math.round((Math.max(...positions.map((point) => point.y)) - Math.min(...positions.map((point) => point.y)) + 1) * 10) / 10
  } : null;
  const icons = (root.icons ?? []).flatMap((icon) => {
    const type = text(icon.signal?.type); const name = text(icon.signal?.name);
    return type && name ? [{ type, name }] : [];
  }).slice(0, 4);
  return {
    kind, label: text(root.label), description: text(root.description), version: factorioVersion(root.version),
    entityCount: entities.length, tileCount: tiles.length,
    wireCount: blueprints.reduce((sum, blueprint) => sum + (Array.isArray(blueprint.wires) ? blueprint.wires.length : 0), 0),
    entities: counts(entities), tiles: counts(tiles), icons, bounds,
    bookEntries: kind === 'blueprint-book' ? blueprints.length : 0,
    preview: entities.flatMap((entity) => typeof entity.name === 'string' && typeof entity.position?.x === 'number' && typeof entity.position?.y === 'number'
      ? [{ name: entity.name, x: entity.position.x, y: entity.position.y }] : []).slice(0, 500)
  };
}
