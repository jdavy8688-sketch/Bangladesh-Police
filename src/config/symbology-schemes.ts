/**
 * Color schemes used by the on-the-fly symbology engine.
 * Values are 0–255 RGB tuples, matching the original Smart Symbology pyt tool.
 *
 * Boundary ternary corners MUST equal the 3 swatch colors shown in
 * ColorSchemePicker for fieldCount=3: CHART_PALETTES[scheme] first, second, last.
 */

export type RGB = [number, number, number];

export const COLOR_SCHEMES = [
  "Auto",
  "Purple - Teal",
  "Blue - Red",
  "Green - Purple",
  "Orange - Blue",
  "Teal Sequential",
  "Forest Sequential",
  "Slate Sequential",
  "Warm Sequential",
  "Sunset Diverging",
  "Ocean Diverging",
] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const CHART_PALETTES: Record<string, RGB[]> = {
  Auto: [
    [87, 65, 155],
    [255, 127, 14],
    [44, 160, 44],
    [214, 39, 40],
    [31, 119, 180],
    [140, 86, 75],
    [227, 119, 194],
    [188, 189, 34],
    [23, 190, 207],
    [127, 127, 127],
  ],
  "Purple - Teal": [
    [87, 65, 155],
    [49, 130, 189],
    [66, 174, 170],
    [126, 201, 172],
    [186, 92, 169],
    [140, 81, 167],
    [92, 164, 214],
    [45, 188, 178],
    [196, 123, 180],
    [100, 100, 145],
  ],
  "Blue - Red": [
    [49, 130, 189],
    [214, 39, 40],
    [107, 174, 214],
    [239, 138, 98],
    [84, 39, 143],
    [165, 15, 21],
    [116, 196, 118],
    [253, 174, 97],
    [158, 202, 225],
    [202, 178, 214],
  ],
  "Green - Purple": [
    [49, 163, 84],
    [117, 107, 177],
    [116, 196, 118],
    [158, 154, 200],
    [0, 109, 44],
    [84, 39, 143],
    [166, 216, 84],
    [188, 189, 220],
    [102, 194, 165],
    [231, 138, 195],
  ],
  "Orange - Blue": [
    [230, 126, 34],
    [52, 152, 219],
    [243, 156, 18],
    [41, 128, 185],
    [211, 84, 0],
    [31, 97, 141],
    [245, 176, 65],
    [93, 173, 226],
    [183, 149, 11],
    [46, 134, 193],
  ],
  "Teal Sequential": [
    [8, 64, 80],
    [12, 100, 110],
    [32, 140, 145],
    [64, 175, 170],
    [120, 200, 190],
    [180, 220, 210],
  ],
  "Forest Sequential": [
    [20, 70, 40],
    [35, 110, 55],
    [55, 145, 70],
    [90, 170, 95],
    [140, 195, 130],
    [190, 220, 175],
  ],
  "Slate Sequential": [
    [40, 50, 70],
    [60, 75, 100],
    [90, 110, 140],
    [130, 150, 175],
    [170, 185, 205],
    [210, 218, 230],
  ],
  "Warm Sequential": [
    [90, 30, 20],
    [140, 55, 30],
    [190, 90, 40],
    [220, 130, 60],
    [235, 175, 100],
    [245, 215, 160],
  ],
  "Sunset Diverging": [
    [120, 40, 90],
    [180, 80, 100],
    [230, 150, 120],
    [247, 247, 247],
    [160, 190, 210],
    [70, 130, 180],
    [30, 70, 120],
  ],
  "Ocean Diverging": [
    [20, 80, 90],
    [40, 140, 150],
    [120, 190, 185],
    [247, 247, 247],
    [180, 170, 140],
    [150, 110, 70],
    [100, 60, 40],
  ],
};

export const BIVARIATE_SCHEMES: Record<string, { LL: RGB; X: RGB; Y: RGB; XY: RGB }> = {
  Auto: {
    LL: [232, 232, 232],
    X: [91, 195, 198],
    Y: [186, 92, 169],
    XY: [66, 87, 158],
  },
  "Purple - Teal": {
    LL: [232, 232, 232],
    X: [91, 195, 198],
    Y: [186, 92, 169],
    XY: [66, 87, 158],
  },
  "Blue - Red": {
    LL: [238, 238, 238],
    X: [215, 82, 75],
    Y: [72, 139, 190],
    XY: [111, 55, 130],
  },
  "Green - Purple": {
    LL: [238, 238, 238],
    X: [74, 170, 108],
    Y: [145, 96, 170],
    XY: [61, 85, 112],
  },
  "Orange - Blue": {
    LL: [238, 238, 238],
    X: [230, 126, 34],
    Y: [52, 152, 219],
    XY: [97, 76, 126],
  },
  "Teal Sequential": {
    LL: [232, 240, 238],
    X: [64, 175, 170],
    Y: [12, 100, 110],
    XY: [8, 64, 80],
  },
  "Forest Sequential": {
    LL: [236, 242, 234],
    X: [90, 170, 95],
    Y: [35, 110, 55],
    XY: [20, 70, 40],
  },
  "Slate Sequential": {
    LL: [236, 238, 242],
    X: [130, 150, 175],
    Y: [60, 75, 100],
    XY: [40, 50, 70],
  },
  "Warm Sequential": {
    LL: [245, 240, 232],
    X: [220, 130, 60],
    Y: [140, 55, 30],
    XY: [90, 30, 20],
  },
  "Sunset Diverging": {
    LL: [240, 240, 240],
    X: [180, 80, 100],
    Y: [70, 130, 180],
    XY: [90, 50, 110],
  },
  "Ocean Diverging": {
    LL: [240, 240, 240],
    X: [40, 140, 150],
    Y: [150, 110, 70],
    XY: [50, 80, 90],
  },
};

/**
 * Same 3 colors the ColorSchemePicker shows for fieldCount=3:
 * palette[0], palette[1], palette[last].
 */
export function ternaryCornersFromScheme(name: string): {
  corner_a: RGB;
  corner_b: RGB;
  corner_c: RGB;
} {
  const palette = CHART_PALETTES[name] ?? CHART_PALETTES.Auto;
  const a = palette[0] ?? ([128, 128, 128] as RGB);
  const b = palette[Math.min(1, palette.length - 1)] ?? a;
  const c = palette[palette.length - 1] ?? a;
  return { corner_a: a, corner_b: b, corner_c: c };
}

/** @deprecated Prefer ternaryCornersFromScheme — kept for any residual string keys. */
export const TERNARY_SCHEMES: Record<string, { corner_a: RGB; corner_b: RGB; corner_c: RGB }> =
  Object.fromEntries(
    COLOR_SCHEMES.map((name) => [name, ternaryCornersFromScheme(name)]),
  );

export const QUALITATIVE_BRIGHT: RGB[] = [
  [31, 119, 180],
  [255, 127, 14],
  [44, 160, 44],
  [214, 39, 40],
  [148, 103, 189],
  [140, 86, 75],
  [227, 119, 194],
  [127, 127, 127],
  [188, 189, 34],
  [23, 190, 207],
];

export const QUALITATIVE_MUTED: RGB[] = [
  [102, 194, 165],
  [252, 141, 98],
  [141, 160, 203],
  [231, 138, 195],
  [166, 216, 84],
  [255, 217, 47],
  [229, 196, 148],
  [179, 179, 179],
];

export const CHOROPLETH_RAMPS: Record<string, RGB[]> = {
  Auto: [
    [241, 244, 248],
    [198, 210, 222],
    [120, 160, 185],
    [64, 130, 150],
    [30, 80, 95],
  ],
  "Purple - Teal": [
    [106, 81, 163],
    [158, 154, 200],
    [247, 247, 247],
    [127, 205, 187],
    [1, 133, 113],
  ],
  "Blue - Red": [
    [5, 113, 176],
    [146, 197, 222],
    [247, 247, 247],
    [244, 165, 130],
    [202, 0, 32],
  ],
  "Green - Purple": [
    [27, 120, 55],
    [166, 219, 160],
    [247, 247, 247],
    [194, 165, 207],
    [118, 42, 131],
  ],
  "Orange - Blue": [
    [230, 97, 1],
    [253, 184, 99],
    [247, 247, 247],
    [146, 197, 222],
    [5, 113, 176],
  ],
  "Teal Sequential": [
    [237, 248, 247],
    [178, 226, 220],
    [102, 194, 185],
    [44, 152, 145],
    [8, 90, 90],
  ],
  "Forest Sequential": [
    [237, 248, 233],
    [186, 228, 179],
    [116, 196, 118],
    [49, 163, 84],
    [0, 109, 44],
  ],
  "Slate Sequential": [
    [241, 244, 248],
    [198, 210, 222],
    [140, 160, 185],
    [85, 110, 145],
    [45, 60, 90],
  ],
  "Warm Sequential": [
    [255, 245, 235],
    [254, 210, 165],
    [253, 160, 80],
    [220, 100, 35],
    [140, 45, 15],
  ],
  "Sunset Diverging": [
    [120, 40, 90],
    [200, 120, 140],
    [247, 247, 247],
    [140, 180, 210],
    [30, 70, 120],
  ],
  "Ocean Diverging": [
    [20, 80, 90],
    [90, 170, 165],
    [247, 247, 247],
    [180, 150, 100],
    [100, 60, 40],
  ],
};

export const SINGLE_SYMBOL_COLORS: Record<string, RGB> = {
  Auto: [64, 130, 150],
  "Purple - Teal": [91, 195, 198],
  "Blue - Red": [72, 139, 190],
  "Green - Purple": [74, 170, 108],
  "Orange - Blue": [230, 126, 34],
  "Teal Sequential": [44, 152, 145],
  "Forest Sequential": [49, 163, 84],
  "Slate Sequential": [85, 110, 145],
  "Warm Sequential": [220, 100, 35],
  "Sunset Diverging": [180, 80, 100],
  "Ocean Diverging": [40, 140, 150],
};

export function resolveScheme(requested: string, method: string): string {
  const scheme = requested || "Auto";
  if (method === "Single Symbol" || method === "Quantile choropleth") return scheme;

  if (method === "Bivariate Colors (3 x 3)") {
    if (scheme in BIVARIATE_SCHEMES) return scheme;
    return "Auto";
  }

  if (method === "Ternary / Triangular Composition") {
    // Always keep the UI scheme name so blendTernary reads the matching palette.
    if (scheme in CHART_PALETTES) return scheme;
    return "Auto";
  }

  if (
    scheme === "Green - Purple" ||
    scheme === "Orange - Blue" ||
    scheme === "Teal Sequential" ||
    scheme === "Forest Sequential" ||
    scheme === "Slate Sequential" ||
    scheme === "Warm Sequential"
  ) {
    return "Qualitative - Muted";
  }
  return "Qualitative - Bright";
}

export function rgbCss(rgb: RGB, alpha = 1): string {
  if (alpha >= 1) return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function bivariatePalette(name: string): Record<string, RGB> {
  const corners = BIVARIATE_SCHEMES[name] ?? BIVARIATE_SCHEMES.Auto;
  const result: Record<string, RGB> = {};
  for (let yClass = 1; yClass <= 3; yClass += 1) {
    const v = (yClass - 1) / 2;
    for (let xClass = 1; xClass <= 3; xClass += 1) {
      const u = (xClass - 1) / 2;
      const rgb: RGB = [0, 0, 0];
      for (let channel = 0; channel < 3; channel += 1) {
        const value =
          (1 - u) * (1 - v) * corners.LL[channel] +
          u * (1 - v) * corners.X[channel] +
          (1 - u) * v * corners.Y[channel] +
          u * v * corners.XY[channel];
        rgb[channel] = Math.round(value);
      }
      result[`${xClass}_${yClass}`] = rgb;
    }
  }
  return result;
}

/** Blend shares a+b+c using the same 3 colors as the color-scheme swatch. */
export function blendTernary(a: number, b: number, c: number, name: string): RGB {
  const colors = ternaryCornersFromScheme(name);
  return [0, 1, 2].map((channel) =>
    Math.max(
      0,
      Math.min(
        255,
        Math.round(
          a * colors.corner_a[channel] + b * colors.corner_b[channel] + c * colors.corner_c[channel],
        ),
      ),
    ),
  ) as RGB;
}
