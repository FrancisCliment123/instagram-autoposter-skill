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
  'A 52-year-old man in a charcoal wool suit, viewed from behind, standing at a floor-to-ceiling office window overlooking a grey overcast Manhattan skyline in winter light. Single window light source from the right, face in shadow, rim light on jaw. Leica M4-P, 50mm Summicron, Kodachrome 64, slight underexposure',
  'A 45-year-old man in a dark navy double-breasted suit, profile view facing left, holding a heavy desk phone handset to ear, seated at a mahogany desk with stacked papers and an ashtray. Banker\'s lamp tungsten light below left, warm amber pool on desk, face half in shadow. Nikon F3, 85mm f/1.8, Tri-X 400',
  'Dense crowd of men in dark suits and loosened ties on the NYSE trading floor, one figure in foreground slightly taller with back to camera, paper slips covering the floor. Overhead fluorescent light, deep shadow pockets, slight motion blur on gesturing hands. Nikon F2A, 28mm f/2.8, Tri-X 400 pushed',
  'Close-up: hands of a man in a suit jacket, one hand holding a pen, reviewing printed financial spreadsheets on a mahogany desk. Banker\'s lamp tungsten from the left, papers overexposed in the light, foreground in deep shadow. Nikon F3, 50mm macro, Kodak Tri-X',
  'A 40-year-old man in a dark pinstripe power suit, viewed from behind and slightly right, standing on the NYSE trading floor amid chaotic paper slips. Harsh overhead fluorescent light, deep foreground shadow, specular highlight on shoulder seam. Nikon F3, 35mm f/2.8',
  'Three men in dark overcoats walking away from camera on a grey Manhattan sidewalk, briefcases in hand, steam rising from a street vent behind them. Overcast winter light, flat cold 5500K daylight, grey tones, slight motion blur from walking pace. Leica M4-P, 35mm Summaron, Tri-X 400',
  'A lone figure in a pinstripe suit walking away down a long empty marble corridor of a Wall Street bank, back to camera, the corridor receding into deep shadow. Single overhead tungsten lamp, strong directional shadow on floor. Nikon F3, 28mm f/2.8',
  'A 1980s trading room at night, rows of glowing green computer terminal screens, one trader seated with his back to the camera surrounded by printed ticker tape on the floor. Low ambient green-tinted light, deep shadow everywhere else. Nikon F3, 35mm f/2',
  'A 58-year-old man with greying temples in a charcoal pinstripe suit, three-quarter view facing slightly away from camera, seated at a large desk. Dark background, almost black. Single hard sidelight left, deep shadow right side, subtle rim light on shoulder. Hasselblad 500CM, 80mm Planar, Tri-X',
  'A man in a 1980s suit sitting back in a leather executive chair, feet up, holding a corded phone, seen from the side, city skyline through the window at dusk. Desk lamp amber glow, window blue-grey, face turned away. Nikon F3, 50mm f/1.4, Ektachrome 200',
];

const PHOTO_STYLE = `AP wire photograph, circa 1986. Shot on Kodak Tri-X 400 pushed to ISO 1600, Nikon F3 with 35mm f/2.8 Nikkor lens. Press photography by a photojournalist covering Wall Street for Fortune magazine or BusinessWeek, 1985 issue.

Technical: heavy organic film grain from push development (directional, silver-based, non-uniform — NOT digital noise), crushed blacks, slight halation around light sources, depth-of-field fall-off at edges, slight chromatic aberration at corners, natural lens vignette. 5:1 contrast ratio, no fill light. Single hard light source only.

Mood: cold, serious, documentary. The photograph was taken in a real moment by a real press photographer. No posing. No studio lighting. Available light only.

NOT AI art. NOT a modern photo. NOT HDR. NOT color-graded. NOT a photo with a filter applied. This is an authentic archival press photograph.`;

const TEXT_STYLE = `TEXT OVERLAY — the text is typeset directly onto the photograph, like a magazine editorial layout. It looks printed, not digitally overlaid:

Headline: large bold white serif (Didot or Times New Roman, very heavy weight), 2–5 words, centered horizontally in the lower third of the image. The headline text has very slight grain/texture matching the film grain of the photo — it reads as ink printed on a photograph.

Body text: white serif, smaller size, 2–4 lines, slightly looser line spacing, centered. Plain and direct language explaining the concept. Same slight grain texture as the headline.

CRITICAL: text must sit over the darkest area of the photo for contrast. NO colored boxes, NO semi-transparent backgrounds, NO drop shadows, NO glows behind the text. NO brand name or watermark anywhere. The film grain and dark photo provide all the contrast needed. The text looks like it belongs to the photograph, not pasted on top.`;

const FORMAT = `FORMAT: Vertical 4:5 portrait, 1080x1350px. Full bleed photograph, edge to edge — NO white borders, NO frames, NO margins, NO padding. NO magazine UI, NO app interface, NO browser chrome, NO publication header or footer anywhere in the image. SAFE ZONES: All text within the central 80% of the frame, never in the top or bottom 10%.`;

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
