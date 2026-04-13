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
  'A man in a 1980s business suit seen entirely from behind, standing at a floor-to-ceiling window, looking out at the Manhattan skyline, back completely to camera, contemplative posture',
  'A businessman seen from behind, slumped in a leather chair late at night, one desk lamp on, Wall Street buildings visible through the rain-streaked window, face never visible',
  'A crowded 1980s stock exchange trading floor shot from above, dozens of suited traders waving papers, no individual face identifiable, frenetic movement slightly blurred',
  'Close-up of hands — a man in a suit jacket reviewing printed financial documents on a mahogany desk, only hands and papers visible, strong tungsten lamp light from the side',
  'A lone figure in a pinstripe suit walking away down a long empty marble corridor of a bank, shot from behind, the corridor receding into deep shadow',
  'A man in a 1980s suit sitting at a cluttered desk, seen from the side at a 90-degree angle, talking on a corded phone, city skyline through the window, face turned away',
  'Close-up of a hand holding a cigarette over an ashtray on a desk covered in financial reports and a Wall Street Journal, dark restaurant or office setting, deep shadows',
  'A 1980s trading room at night, rows of glowing green terminal screens, one lone figure seated with his back to the camera, surrounded by ticker tape on the floor',
  'Two men in power suits seen from behind, shaking hands in front of a tall Wall Street building entrance, backlit by grey overcast daylight',
  'A man in a suit standing at a window high above the city, hands in pockets, seen from behind at a slight angle, his reflection faintly visible in the glass',
];

const PHOTO_STYLE = `Authentic press photograph from 1983–1988, either black-and-white or heavily desaturated color. Scanned from a physical copy of Fortune or BusinessWeek magazine.

MANDATORY — all of these must be clearly visible:
• EXTREME film grain — the grain is coarse, heavy, and dominant. You can see individual grain clusters in every area of the image. This is NOT subtle. Especially brutal in the dark areas and shadows.
• The image looks like it was printed on newsprint and then scanned — slight ink bleed, halftone dot texture visible in the midtones
• BLACK AND WHITE preferred, or if color: deeply desaturated, almost monochrome, with only a faint warm sepia or cool grey-blue tint remaining
• Highlights are blown out and creamy. Shadows are crushed black with grain visible inside them.
• Vignette: corners of the image are noticeably darker than the center
• Imperfect focus: soft edges, slight motion blur in the background, NO modern sharpness anywhere
• The photograph looks physically aged — slight wear, tonal fading, as if the magazine is decades old

Lighting: single source only — desk lamp or window. No fill. Deep shadows cover at least 40% of the image.

This MUST look like a real 1985 newspaper or magazine photograph. The vintage degradation should be OBVIOUS and DOMINANT — not subtle. NOT a modern photo. NOT a clean image with a filter. EXTREME grain and age.`;

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
