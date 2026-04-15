/**
 * Old Money 80s — Cinematic financial photography style
 *
 * Replicates the Inversider/old-wealth aesthetic:
 *  - 35mm press photograph look, 1982-1989
 *  - Dark chiaroscuro lighting, one dominant source
 *  - Businessmen in power suits, Wall Street settings
 *  - Bold white Didot/Times serif text over the dark areas
 *  - Slightly desaturated, high contrast, film grain
 *
 * Content file format (one slide per line):
 *   Headline | Body text. Second sentence if needed.
 *
 * Example:
 *   Ecuación Contable | Refleja si la empresa vive de deuda o capital propio.
 *   Balance de Comprobación | Señal de orden interno. Errores frecuentes = problemas de gestión.
 */

const SCENES = [
  'A man in a 1987 double-breasted pinstripe suit seen from behind, standing at floor-to-ceiling office windows, 40th floor Manhattan. Near-silhouette against cool overcast grey-blue sky and distant skyscrapers. Interior warm amber from a desk lamp at left frame. Venetian blind shadow bars across his back and shoulders. Warm-to-cool color temperature war. No face visible.',
  'Interior night. Corner office, Manhattan high-rise. A figure in a dark suit at a large mahogany desk, seen from the side, face turned away. Single brass desk lamp warm amber key light 2400K. Floor-to-ceiling windows behind: cool blue-grey Manhattan night skyline. Warm/cool split down center of frame. IBM PC and phone handset with coiled cord on desk.',
  'Wide shot, New York Stock Exchange trading floor, 1987. Dozens of traders in colored jackets in mid-motion, papers in the air. Overhead practical tungsten — warm amber-gold spilling down. CRT screens casting green phosphor light from below. Ticker tape and paper in motion blur. Background traders soft from 85mm compression.',
  'Close-up of a man\'s torso and hand: white dress shirt, bold red suspenders, one hand gripping a telephone handset with coiled cord. Warm desk lamp from below-left catches white shirt in amber. Deep shadow across upper chest. Background pure black with single out-of-focus CRT green glow at right edge. Gold cufflink catching light. No face in frame.',
  'Two men in dark suits and overcoats walking through revolving brass doors of a Wall Street building. Shot from outside. Warm amber lobby glow behind them, cool grey overcast daylight in foreground. Both figures slightly backlit. Faces not clearly visible. Steam in cold air.',
  'Street-level Lower Manhattan. Overcast noon, flat cold blue-white natural light. Two men in dark overcoats with briefcases moving through frame, slight motion blur. One man\'s face half-lit by warm storefront window. Steam from a street grate. Near-monochromatic steel grey and blue with one single warm amber intrusion.',
  'A man in a double-breasted suit sitting back in a deep leather executive chair, feet up on a mahogany desk, holding a corded phone to his ear. Seen from the side, face turned away. Desk lamp warm amber pool. Manhattan skyline through the window at dusk — cool blue against warm interior.',
  'A 1980s trading room at night, rows of glowing green CRT terminal screens in darkness. One lone trader seated with his back to camera, surrounded by ticker tape on the floor. Green phosphor ambient light the only source. Deep shadow everywhere else.',
  'Empty conference room, classical Wall Street architecture, marble columns. A lone man in a pinstripe suit stands at the head of a long mahogany table reviewing documents. City visible through tall windows, cool grey morning light. Long shadows across the table.',
  'A man in a 1987 power suit seen from behind, walking away down a long empty marble corridor of a bank, the corridor receding into deep shadow. Single overhead tungsten lamp casting a long hard shadow on the floor ahead of him.',
];

const PHOTO_STYLE = `A color photograph from 1986 that has aged 40 years. Shot on Ektachrome 200 or Kodachrome slide film, scanned from a faded physical print or slide that has been sitting in an archive since the Reagan administration.

CRITICAL — the image must look AGED and DEGRADED, not clean or cinematic:
• Strong color shift from aging — slight magenta cast in shadows, yellow-amber tint in highlights (typical of 1980s Ektachrome that has faded)
• Slightly washed-out, low saturation — the color has drifted and faded with time
• Visible organic film grain throughout, especially in dark areas — this is REAL 35mm grain, not clean
• Slight softness and loss of detail — the image is not sharp, not modern, not tack-sharp digital
• Tonal compression — no bright whites, no pure blacks, everything slightly muddy and aged
• Slight color fringing and halation around bright areas
• The photograph looks like it was taken with a consumer 35mm SLR of the era, not a movie camera

Lighting: mostly warm tungsten interior tones, slightly greenish fluorescent where applicable, naturally dim.

The overall feel is NOSTALGIC and AGED — like flipping through a photo album from 1986. NOT a modern high-quality image. NOT cinematic or polished. NOT clean. It has the unmistakable visual signature of 1980s color photography that has survived for decades.

NOT AI art. NOT modern photography. NOT HDR. NOT color-graded. NOT sharp. An aged snapshot from 1986.`;

const FORMAT = `FORMAT: Vertical 4:5 portrait, 1080x1350px. The photograph fills every single pixel — FULL BLEED, edge to edge, zero borders, zero frames, zero margins, zero padding, zero white space around the image. The image starts at the very corner of the canvas. NO Polaroid frame. NO photo border. NO white surround. NO cream frame. NO vignette border. NO publication headers or footers. NO text, NO captions, NO words — text will be added separately.`;

/**
 * Build a photo-only prompt (text overlay is handled by sharp, not Gemini).
 * Returns a slide object: { photoPrompt, headline, body }
 */
function buildSlide(headline, body, slideIndex = 0) {
  const scene = SCENES[slideIndex % SCENES.length];
  return {
    photoPrompt: `${FORMAT}\n\nSCENE: ${scene}.\n\nPHOTOGRAPHY: ${PHOTO_STYLE}`,
    headline,
    body,
  };
}

/**
 * Parse a content file where each line is:
 *   Headline | Body text
 * Lines starting with # are comments. Blank lines skipped.
 */
function parseContentFile(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map((line, i) => {
      const sep = line.indexOf('|');
      if (sep === -1) return buildSlide(line.trim(), '', i);
      return buildSlide(line.slice(0, sep).trim(), line.slice(sep + 1).trim(), i);
    });
}

/**
 * Default 5-slide WealthMaia carousel in old-money-80s style.
 */
function defaultPrompts(brand = 'WEALTHMAIA') {
  const slides = [
    ['Los 5 conceptos financieros', `que todo inversor debe dominar antes de poner su dinero en una empresa. Dominarlos cambia todo.`],
    ['Flujo de Caja Libre', `Una empresa puede tener beneficios en papel y quedarse sin liquidez. Revisa siempre el cash real, no el contable.`],
    ['Margen Operativo', `Cuánto gana la empresa por cada euro vendido antes de pagar impuestos. Cuanto más alto y estable, mejor.`],
    ['Deuda Neta / EBITDA', `Mide cuántos años tardaría la empresa en pagar su deuda con sus beneficios actuales. Por encima de 3x, hay riesgo.`],
    ['Empieza a leer los números', `La IA de ${brand} analiza los estados financieros por ti. Toma decisiones con datos, no con intuición.`],
  ];
  return slides.map(([h, b], i) => buildSlide(h, b, i));
}

// Per-style text overrides: editorial pattern — serif headline (Didot/Bodoni/
// Georgia fallback) + Helvetica body. Same structure as NYT/WSJ/Vogue covers:
// heavy serif title, clean sans subtitle.
const textStyle = {
  headlineFamily: "'Didot','Bodoni 72','Bodoni MT',Georgia,'Times New Roman',serif",
  bodyFamily:     "-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif",
  headlineLetterSpacing: '0px',
  bodyLetterSpacing:     '0.15px',
  headlineWeight: 500,
  bodyWeight:     300,
  headlineSize:   62,
  bodySize:       24,
};

module.exports = { buildSlide, parseContentFile, defaultPrompts, SCENES, useTextOverlay: true, textStyle };
