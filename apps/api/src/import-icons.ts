import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { config } from './config.js';

const sourceOption = process.argv.find((value) => value.startsWith('--source='));
if (!sourceOption) {
  console.error('Usage: icons:import --source=/input/icons');
  process.exit(1);
}
const source = resolve(sourceOption.slice('--source='.length));
const destination = resolve(config.FACTORIO_ICON_DIR);
await mkdir(destination, { recursive: true });

let copied = 0;
const importedIcons = new Set<string>();
async function visit(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.png') {
      const name = basename(entry.name, '.png');
      // Prototype names are the Factorio filenames for base item icons. Ignore
      // decorations and unusual files rather than exposing arbitrary paths.
      if (/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
        await cp(path, join(destination, `${name}.png`), { force: true });
        importedIcons.add(name);
        copied += 1;
      }
    }
  }
}
// Factorio's full data tree contains enormous entity textures. Only a mod's
// graphics/icons directory contains the prototype icon PNGs this application
// serves, so never recursively scan all game assets.
const preferredOrder = ['core', 'base', 'elevated-rails', 'quality', 'space-age'];
const mods = await readdir(source, { withFileTypes: true });
mods.sort((a, b) => {
  const left = preferredOrder.indexOf(a.name);
  const right = preferredOrder.indexOf(b.name);
  return (left < 0 ? preferredOrder.length : left) - (right < 0 ? preferredOrder.length : right) || a.name.localeCompare(b.name);
});

const labelSections = ['recipe-name', 'equipment-name', 'tile-name', 'entity-name', 'fluid-name', 'item-name'] as const;
type LabelSection = typeof labelSections[number];
const locales = ['cs', 'en'] as const;
type Locale = typeof locales[number];
const labelsByLocale = Object.fromEntries(locales.map((locale) => [locale, Object.fromEntries(labelSections.map((section) => [section, new Map<string, string>()]))])) as Record<Locale, Record<LabelSection, Map<string, string>>>;

function parseLocale(locale: Locale, contents: string) {
  let section = '';
  for (const rawLine of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = line.match(/^\[([^\]]+)\]$/);
    if (heading) { section = heading[1]; continue; }
    if (!labelSections.includes(section as LabelSection) || !line || line.startsWith(';') || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (/^[a-z0-9][a-z0-9_-]*$/.test(key) && value) labelsByLocale[locale][section as LabelSection].set(key, value);
  }
}

async function importLocales(modDirectory: string) {
  for (const locale of locales) {
    const localeDirectory = join(modDirectory, 'locale', locale);
    let entries;
    try { entries = await readdir(localeDirectory, { withFileTypes: true }); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isFile() && extname(entry.name).toLowerCase() === '.cfg') parseLocale(locale, await readFile(join(localeDirectory, entry.name), 'utf8'));
    }
  }
}

for (const mod of mods) {
  if (!mod.isDirectory()) continue;
  const iconDirectory = join(source, mod.name, 'graphics', 'icons');
  try { await visit(iconDirectory); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  await importLocales(join(source, mod.name));
}

const referenceSections: Record<string, LabelSection> = { ITEM: 'item-name', FLUID: 'fluid-name', ENTITY: 'entity-name', EQUIPMENT: 'equipment-name', TILE: 'tile-name', RECIPE: 'recipe-name' };
function resolveReferences(locale: Locale, labels: Record<string, string>, label: string) {
  let result = label;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = result.replace(/__(ITEM|FLUID|ENTITY|EQUIPMENT|TILE|RECIPE)__([a-z0-9_-]+)__/g, (match, type: string, name: string) => labelsByLocale[locale][referenceSections[type]]?.get(name) ?? labels[name] ?? match);
    if (next === result) break;
    result = next;
  }
  return result;
}
const labelCounts: Record<Locale, number> = { cs: 0, en: 0 };
for (const locale of locales) {
  const labels: Record<string, string> = {};
  for (const section of labelSections) for (const [prototype, label] of labelsByLocale[locale][section]) labels[prototype] = label;
  const sortedLabels = Object.fromEntries(Object.entries(labels).map(([prototype, label]) => [prototype, resolveReferences(locale, labels, label)]).sort(([left], [right]) => left.localeCompare(right)));
  labelCounts[locale] = Object.keys(sortedLabels).length;
  await writeFile(join(destination, `labels.${locale}.json`), `${JSON.stringify(sortedLabels)}\n`, 'utf8');
}
await writeFile(join(destination, 'manifest.json'), `${JSON.stringify({ icons: importedIcons.size, labels: labelCounts })}\n`, 'utf8');
console.log(`Imported ${importedIcons.size} unique Factorio icons (${copied} source files), ${labelCounts.cs} Czech and ${labelCounts.en} English labels.`);
