#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const projectRoot = path.resolve(__dirname, '..');
const sourceSvg = path.join(projectRoot, 'client', 'public', 'icons', 'zhiji-logo.svg');
const targetIco = path.join(projectRoot, 'client', 'public', 'app-icon.ico');
const iconSizes = [16, 32, 48, 256];

function pngEntry(png, size) {
  const width = size === 256 ? 0 : size;
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width, 0);
  entry.writeUInt8(width, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  return entry;
}

async function main() {
  const svg = fs.readFileSync(sourceSvg, 'utf8');
  const image = await loadImage(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  const pngs = iconSizes.map((size) => {
    const canvas = createCanvas(size, size);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    return canvas.toBuffer('image/png');
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const entries = pngs.map((png, index) => {
    const entry = pngEntry(png, iconSizes[index]);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  fs.writeFileSync(targetIco, Buffer.concat([header, ...entries, ...pngs]));
  process.stdout.write(`[generate-app-icon] 已生成: ${path.relative(projectRoot, targetIco)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[generate-app-icon] 生成失败: ${error.message}\n`);
  process.exitCode = 1;
});
