import paletteSwap from '../lib/palette-swap.js';
import { loadImage } from 'canvas';
import { writeFileSync } from 'node:fs';

const results = paletteSwap(
  await loadImage('./Yoshi.png'),
  new Map([
    [
      2,
      new Map([
        ['#006000', '#570061'],
        ['#00a800', '#8c00a8'],
        ['#00f800', '#de00f8'],
      ]),
    ],
    [3, 220],
  ]),
  new Set([
    '#000000',
    '#903020',
    '#f84020',
    '#f89000',
    '#ff0000',
    '#f8c0a8',
    '#f8e0d0',
    '#f8f8f8',
  ]),
);

for (const [variant, canvas] of results) {
  writeFileSync(`./Yoshi-${variant}.png`, canvas.toBuffer());
}
