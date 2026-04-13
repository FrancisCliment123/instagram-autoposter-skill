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

const PHOTO_STYLE = `Film still from a 1987 American drama. 35mm anamorphic Panavision. Cinematography by Robert Richardson (Wall Street, 1987). Kodak 5247 film stock.

Color and light — mandatory:
• Warm tungsten interior 2400K vs cool blue-grey exterior window light — this color temperature war defines every frame
• Deep inky black shadows with zero detail — NO fill light, NO bounce, nothing in the shadows
• Slight halation and bloom around practical light sources (desk lamps, office lamps)
• Horizontal anamorphic lens flare streaks from window edges
• Oval bokeh in out-of-focus background highlights
• Venetian blind shadow bars across suits and walls where applicable
• Visible 35mm grain — organic, textural, part of the aesthetic
• Skin tones pushed slightly warm/copper in the light

Mood: 1987 Manhattan. Ambition, power, isolation. The visual language of Gordon Gekko. Cinematic, designed, deliberate — every shadow is intentional.

NOT a photograph. NOT press photography. NOT AI art. NOT modern color grading. A 35mm film still.`;

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
