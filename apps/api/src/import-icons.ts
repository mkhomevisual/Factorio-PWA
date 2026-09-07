import { cp, mkdir, readdir } from 'node:fs/promises';
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
      if (/^[a-z0-9][a-z0-9_-]*$/.test(name)) { await cp(path, join(destination, `${name}.png`), { force: false, errorOnExist: false }); copied += 1; }
    }
  }
}
// Factorio's full data tree contains enormous entity textures. Only a mod's
// graphics/icons directory contains the prototype icon PNGs this application
// serves, so never recursively scan all game assets.
const mods = await readdir(source, { withFileTypes: true });
mods.sort((a, b) => a.name.localeCompare(b.name));
for (const mod of mods) {
  if (!mod.isDirectory()) continue;
  const iconDirectory = join(source, mod.name, 'graphics', 'icons');
  try { await visit(iconDirectory); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
}
console.log(`Imported ${copied} Factorio icon files into the persistent icon directory.`);
