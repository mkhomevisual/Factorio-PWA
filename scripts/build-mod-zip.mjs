import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const [sourceDirectory, outputDirectory] = process.argv.slice(2);
if (!sourceDirectory || !outputDirectory) throw new Error('Usage: node scripts/build-mod-zip.mjs <mod-directory> <output-directory>');

const metadata = JSON.parse(readFileSync(join(sourceDirectory, 'info.json'), 'utf8'));
const archiveRoot = `${metadata.name}_${metadata.version}`;

function filesInside(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesInside(path) : entry.isFile() ? [path] : [];
  }).sort();
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

const localParts = [];
const centralParts = [];
let offset = 0;

for (const path of filesInside(sourceDirectory)) {
  const data = readFileSync(path);
  const name = Buffer.from(`${archiveRoot}/${relative(sourceDirectory, path).replaceAll('\\', '/')}`);
  const checksum = crc32(data);
  const stamp = dosDateTime(statSync(path).mtime);
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(stamp.time, 10);
  localHeader.writeUInt16LE(stamp.date, 12);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(stamp.time, 12);
  centralHeader.writeUInt16LE(stamp.date, 14);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(data.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(offset, 42);

  localParts.push(localHeader, name, data);
  centralParts.push(centralHeader, name);
  offset += localHeader.length + name.length + data.length;
}

const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(centralParts.length / 2, 8);
end.writeUInt16LE(centralParts.length / 2, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

mkdirSync(outputDirectory, { recursive: true });
const archive = Buffer.concat([...localParts, centralDirectory, end]);
const fileName = `${archiveRoot}.zip`;
writeFileSync(join(outputDirectory, fileName), archive);
writeFileSync(join(outputDirectory, 'hal-telemetry-manifest.json'), `${JSON.stringify({ name: metadata.title ?? basename(sourceDirectory), version: metadata.version, fileName, size: archive.length }, null, 2)}\n`);
