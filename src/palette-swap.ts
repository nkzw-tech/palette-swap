import {
  Canvas,
  createCanvas,
  createImageData,
  Image as CanvasImage,
  ImageData,
} from 'canvas';

type RGB = [red: number, green: number, blue: number];
type Hue = number;

export type HEX = `#${string}`;
export type HSL = [hue: number, saturation: number, lightness: number];
export type VariantName = number | string;
export type Image = CanvasImage | HTMLImageElement;

const hexToInt32 = (hex: HEX) => {
  const n = Number.parseInt(hex.slice(1), 16) & 0x00ffffff;
  const [r, g, b] = int32ToRgb(n);
  return (b << 16) | (g << 8) | r;
};

const int32ToRgb = (color: number): RGB => {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return [r, g, b];
};

const hex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
const rgbToHex = ([r, g, b]: RGB): HEX => `#${hex(r)}${hex(g)}${hex(b)}`;
const int32ToHex = (color: number) => rgbToHex(int32ToRgb(color));

const applyHue = (rgb: RGB, hue: number) => {
  const h = hue / 360;
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const delta = max - min;
  let s;
  const l = (min + max) / 2;
  if (max === min) {
    s = 0;
  } else if (l <= 0.5) {
    s = delta / (max + min);
  } else {
    s = delta / (2 - max - min);
  }

  let t2;
  let t3;
  let val;

  if (s === 0) {
    val = l * 255;
    return (val << 16) | (val << 8) | val;
  }

  if (l < 0.5) {
    t2 = l * (1 + s);
  } else {
    t2 = l + s - l * s;
  }

  const t1 = 2 * l - t2;
  const result = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    t3 = h + (1 / 3) * -(2 - i - 1);
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

    result[i] = val * 255;
  }

  return (result[0] << 16) | (result[1] << 8) | result[2];
};

const createCanvasFromImage = (image: Image) => {
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image as unknown as CanvasImage, 0, 0);
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

export default function paletteSwap(
  image: Image,
  inputVariants: ReadonlyMap<VariantName, ReadonlyMap<HEX, HEX> | Hue>,
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
  const imageData = new Uint32Array(
    context.getImageData(0, 0, width, height).data.buffer,
  );
  const results = new Map();

  const variants: Array<
    [
      name: VariantName,
      imageData: ImageData,
      buffer: Uint32Array,
      variants: Hue | null,
    ]
  > = [];
  let i = 0;
  const palettes = new Map<number, Array<number>>();
  for (const [variant, palette] of inputVariants) {
    const newImageData = createImageData(
      new Uint8ClampedArray(width * height * 4),
      width,
    );
    if (typeof palette !== 'number') {
      for (const [key, value] of palette) {
        const k = hexToInt32(key);
        const v = palettes.get(k) || [];
        v[i] = hexToInt32(value);
        palettes.set(k, v);
      }
    }
    variants.push([
      variant,
      newImageData,
      new Uint32Array(newImageData.data.buffer),
      typeof palette === 'number' ? palette : null,
    ]);

    i++;
  }
  const staticColorNumbers = staticColors
    ? new Set([...staticColors].map(hexToInt32))
    : null;

  const missing = new Set<[VariantName, number]>();
  for (var y = 0; y < height; ++y) {
    for (var x = 0; x < width; ++x) {
      const index = y * width + x;
      const originalColor = imageData[index];
      const a = (originalColor >> 24) & 0xff;
      if (a === 0) {
        continue;
      }

      const color = originalColor & 0x00ffffff;
      const isStatic = staticColorNumbers?.has(color);
      const colors = !isStatic ? palettes.get(color) : null;
      for (let i = 0; i < variants.length; i++) {
        const newImageData = variants[i][2];
        if (isStatic) {
          newImageData[index] = originalColor;
          continue;
        }

        const hue = variants[i][3];
        if (hue) {
          newImageData[index] = (a << 24) | applyHue(int32ToRgb(color), hue);
        } else if (colors?.[i]) {
          newImageData[index] = (a << 24) | colors[i];
        } else if (!staticColorNumbers) {
          newImageData[index] = originalColor;
        } else {
          missing.add([variants[i][0], color]);
        }
      }
    }

    if (!options?.ignoreMissing && missing.size) {
      throw new Error(
        `There is no mapping for ${Array.from(
          new Set([...missing].map(([, color]) => int32ToHex(color))),
        ).join(', ')} in the palette for ${
          options?.imageName ? `image '${options?.imageName}' ` : ''
        }variant(s) '${Array.from(
          new Set([...missing].map(([name]) => name)),
        ).join(', ')}'.`,
      );
    }
  }

  for (let i = 0; i < variants.length; i++) {
    const name = variants[i][0];
    const existingImage = images?.get(name);
    const existingImageData = existingImage
      ? createCanvasFromImage(existingImage)
          .getContext('2d')
          .getImageData(0, 0, width, height)
      : null;

    const newImageData = variants[i][1];
    if (!existingImageData || !equals(newImageData, existingImageData)) {
      const newCanvas = createCanvasFromImage(image);
      newCanvas.getContext('2d').putImageData(newImageData, 0, 0);
      results.set(name, newCanvas);
    }
  }

  return results;
}
