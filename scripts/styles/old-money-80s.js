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
  'A tired financial analyst in a dark 1980s Wall Street office, seen from behind, hunched over papers under a single desk lamp, city skyline glowing blue through the window behind him',
  'A powerful CEO on the phone at midnight in a dimly lit corner office, amber desk lamp casting deep shadows, New York skyline faintly visible through floor-to-ceiling windows',
  'A crowded 1980s stock exchange trading floor, traders in suits shouting and waving papers under harsh fluorescent lights, frenetic energy, slightly motion-blurred',
  'A stern banker in a pin-striped suit reviewing documents in a grand banking hall with ornate columns, low tungsten lighting, empty except for him',
  'Two executives in power suits walking through the revolving doors of a Wall Street building, shot from inside, backlit by overcast grey daylight',
  'A man in a 1980s business suit staring out a high-rise window at a rain-soaked Manhattan skyline, back to camera, contemplative, reflections on the glass',
  'A Wall Street trading room at night, rows of glowing green computer terminals, one trader still at his desk surrounded by printed ticker tape',
  'A businessman eating alone at a dark restaurant booth, financial newspaper open on the table, one candle, deep shadows',
  'Interior of a 1980s elevator in a financial tower, a man in a suit looking down at his briefcase, harsh overhead light',
  'A conference room at dawn, long mahogany table, one man standing looking at documents, city waking up outside the window, cool blue morning light',
];

const PHOTO_STYLE = `Authentic archival photograph scanned from a 1985–1988 issue of Fortune, Forbes, or BusinessWeek magazine. Shot on 35mm Kodachrome 64 or Ektachrome 200 slide film by a press photographer.

MANDATORY film qualities — all must be present:
• HEAVY visible film grain throughout the entire image, especially in dark areas and midtones — the grain is organic and clumpy, not digital noise
• Slightly faded, aged color: highlights gently overexposed and creamy-white, shadows with a subtle blue-green or violet cast, midtones warm and desaturated
• Slight halftone dot pattern as if scanned from a printed magazine page — barely visible but present in flat color areas
• Imperfect focus softness, especially in corners — no modern tack-sharp digital clarity

Lighting: one dominant light source only — either a tungsten desk lamp (amber/orange cast) or cool blue window light from outside. Deep natural shadows, no fill lights, no even lighting. Chiaroscuro.

Color palette: deep charcoal blacks, midnight blue or indigo shadows, warm amber or burnt orange highlights, slightly yellowed whites.

Photojournalistic framing: slightly imperfect, candid-feeling composition. The subject is unposed or barely posed. Real moment energy.

This is a REAL archival press photograph from 1986. NOT AI-generated art. NOT digital photography. NOT a modern photo with a filter. NOT HDR. NOT clean or sharp. It must look indistinguishable from a physical 35mm scan.`;

const TEXT_STYLE = `TEXT OVERLAY — the text is typeset directly onto the photograph, like a magazine editorial layout. It looks printed, not digitally overlaid:

Headline: large bold white serif (Didot or Times New Roman, very heavy weight), 2–5 words, centered horizontally in the lower third of the image. The headline text has very slight grain/texture matching the film grain of the photo — it reads as ink printed on a photograph.

Body text: white serif, smaller size, 2–4 lines, slightly looser line spacing, centered. Plain and direct language explaining the concept. Same slight grain texture as the headline.

CRITICAL: text must sit over the darkest area of the photo for contrast. NO colored boxes, NO semi-transparent backgrounds, NO drop shadows, NO glows behind the text. NO brand name or watermark anywhere. The film grain and dark photo provide all the contrast needed. The text looks like it belongs to the photograph, not pasted on top.`;

const FORMAT = `FORMAT: Vertical 4:5 portrait, 1080x1350px. The photograph fills the ENTIRE frame edge to edge — NO white borders, NO cream frames, NO margins, NO padding around the image. Full bleed, no frame. SAFE ZONES: All text within the central 80% of the frame. The top 10% and bottom 10% will be covered by Instagram UI — NEVER place text or key elements there.`;

/**
 * Build a full Nano Banana prompt for one slide.
 * @param {string} headline - Short bold headline (2-4 words)
 * @param {string} body - 1-3 sentence explanation
 * @param {number} slideIndex - 0-based index, used to pick scene variety
 * @param {string} [brand='WEALTHMAIA'] - Brand name shown at bottom
 */
function buildPrompt(headline, body, slideIndex = 0, brand = 'WEALTHMAIA') {
  const scene = SCENES[slideIndex % SCENES.length];
  return `${FORMAT}

SCENE: ${scene}.

PHOTOGRAPHY: ${PHOTO_STYLE}

${TEXT_STYLE}

CONTENT TO SHOW ON THE SLIDE:
Headline (large bold white serif): "${headline}"
Body text (smaller white serif, 2-3 lines below): "${body}"`;
}

/**
 * Parse a content file where each line is:
 *   Headline | Body text
 * Lines starting with # are comments. Blank lines skipped.
 */
function parseContentFile(text, brand = 'WEALTHMAIA') {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map((line, i) => {
      const sep = line.indexOf('|');
      if (sep === -1) {
        // No separator — treat whole line as headline with empty body
        return buildPrompt(line.trim(), '', i, brand);
      }
      const headline = line.slice(0, sep).trim();
      const body = line.slice(sep + 1).trim();
      return buildPrompt(headline, body, i, brand);
    });
}

/**
 * Default 5-slide WealthMaia carousel in old-money-80s style.
 * Used when --style old-money-80s is passed without --content.
 */
function defaultPrompts(brand = 'WEALTHMAIA') {
  const slides = [
    ['Los 5 conceptos financieros', `que todo inversor debe dominar antes de poner su dinero en una empresa. Dominarlos cambia todo.`],
    ['Flujo de Caja Libre', `Una empresa puede tener beneficios en papel y quedarse sin liquidez. Revisa siempre el cash real, no el contable.`],
    ['Margen Operativo', `Cuánto gana la empresa por cada euro vendido antes de pagar impuestos. Cuanto más alto y estable, mejor.`],
    ['Deuda Neta / EBITDA', `Mide cuántos años tardaría la empresa en pagar su deuda con sus beneficios actuales. Por encima de 3x, hay riesgo.`],
    ['Empieza a leer los números', `La IA de ${brand} analiza los estados financieros por ti. Toma decisiones con datos, no con intuición.`],
  ];
  return slides.map(([h, b], i) => buildPrompt(h, b, i, brand));
}

module.exports = { buildPrompt, parseContentFile, defaultPrompts, SCENES };
