import {
  Canvas,
  createCanvas,
  createImageData,
  Image as CanvasImage,
} from 'canvas';

type RGB = [red: number, green: number, blue: number];
type Hue = number;
type RGBA = [...RGB, number?];
type Image = CanvasImage | HTMLImageElement;

export type HEX = `#${string}`;
export type HSL = [hue: number, saturation: number, lightness: number];
export type VariantName = number | string;
export type Variant = HEX | Hue;

const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');

const rgbaToHex = (...[r, g, b, a]: RGBA): HEX => {
  return `#${hex(r)}${hex(g)}${hex(b)}${a && a !== 255 ? hex(a) : ''}`;
};

const hexToRgba = (hex: HEX) => {
  const match = hex.match(/\w\w/g);
  if (!match) {
    throw new Error(`Invalid color '${hex}'.`);
  }
  return match.map((part) => Number.parseInt(part, 16));
};

const rgbToHsl = (rgb: RGB) => {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const delta = max - min;
  let h = 0;
  let s;

  if (max === min) {
    h = 0;
  } else if (r === max) {
    h = (g - b) / delta;
  } else if (g === max) {
    h = 2 + (b - r) / delta;
  } else if (b === max) {
    h = 4 + (r - g) / delta;
  }

  h = Math.min(h * 60, 360);
  if (h < 0) {
    h += 360;
  }

  const l = (min + max) / 2;
  if (max === min) {
    s = 0;
  } else if (l <= 0.5) {
    s = delta / (max + min);
  } else {
    s = delta / (2 - max - min);
  }

  return [h, s * 100, l * 100];
};

const hslToRgb = (hsl: HSL) => {
  const h = hsl[0] / 360;
  const s = hsl[1] / 100;
  const l = hsl[2] / 100;
  let t2;
  let t3;
  let val;

  if (s === 0) {
    val = l * 255;
    return [val, val, val];
  }

  if (l < 0.5) {
    t2 = l * (1 + s);
  } else {
    t2 = l + s - l * s;
  }

  const t1 = 2 * l - t2;
  const rgb = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    t3 = h + (1 / 3) * -(i - 1);
    if (t3 < 0) {
      t3++;
    }

    if (t3 > 1) {
      t3--;
    }

    if (6 * t3 < 1) {
      val = t1 + (t2 - t1) * 6 * t3;
    } else if (2 * t3 < 1) {
      val = t2;
    } else if (3 * t3 < 2) {
      val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
    } else {
      val = t1;
    }

    rgb[i] = val * 255;
  }

  return rgb;
};

const hslToHex = (hsl: HSL) => {
  const [r, g, b] = hslToRgb(hsl);
  return rgbaToHex(r, g, b);
};

const applyHue = (
  r: number,
  g: number,
  b: number,
  a: number,
  hue: number,
): HEX => {
  const [, s, l] = rgbToHsl([r, g, b]);
  return (hslToHex([hue, s, l]) + hex(a)) as HEX;
};

const createCanvasFromImage = (image: Image) => {
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return canvas;
};

const equals = (a: ImageData, b: ImageData) => {
  if (a.width !== b.width || a.height !== b.height) {
    return false;
  }
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) {
      return false;
    }
  }
  return true;
};

const set = (
  imageData: ImageData,
  index: number,
  r: number,
  g: number,
  b: number,
  a: number,
) => {
  imageData.data[index] = r;
  imageData.data[index + 1] = g;
  imageData.data[index + 2] = b;
  imageData.data[index + 3] = a;
};

export default function paletteSwap(
  image: Image,
  variants: ReadonlyMap<VariantName, ReadonlyMap<HEX, Variant> | Hue>,
  staticColors?: Set<HEX> | null,
  images?: ReadonlyMap<VariantName, Image> | null,
  options?: {
    imageName?: string;
    ignoreMissing?: boolean;
  },
): ReadonlyMap<VariantName, Canvas> {
  const canvas = createCanvasFromImage(image);
  const context = canvas.getContext('2d');
  const { height, width } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const results = new Map();

  for (const [variant, palette] of variants) {
    const existingImage = images?.get(variant);
    const existingImageData = existingImage
      ? createCanvasFromImage(existingImage)
          .getContext('2d')
          .getImageData(0, 0, width, height)
      : null;

    const newImageData = createImageData(
      new Uint8ClampedArray(width * height * 4),
      width,
    );

    const missing = new Set<HEX>();
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];
      const hex = rgbaToHex(r, g, b, a);

      let newColor = typeof palette === 'number' ? palette : palette.get(hex);
      if (typeof newColor === 'number') {
        if (staticColors?.has(hex)) {
          set(newImageData, i, r, g, b, a);
          continue;
        }
        newColor = applyHue(r, g, b, a, newColor);
      } else if (!newColor) {
        if (!staticColors || staticColors.has(hex)) {
          set(newImageData, i, r, g, b, a);
        } else {
          missing.add(hex);
        }
        continue;
      }

      const [newR, newG, newB, newA] = hexToRgba(newColor);
      set(newImageData, i, newR, newG, newB, newA != null ? newA : 255);
    }

    if (!options?.ignoreMissing && missing.size) {
      throw new Error(
        `There is no mapping for ${[...missing].join(
          ', ',
        )} in the palette for ${
          options?.imageName ? `image '${options?.imageName}' ` : ''
        } variant '${variant}'.`,
      );
    }

    if (!existingImageData || !equals(newImageData, existingImageData)) {
      const newCanvas = createCanvasFromImage(image);
      newCanvas.getContext('2d').putImageData(newImageData, 0, 0);
      results.set(variant, newCanvas);
    }
  }
  return results;
}
