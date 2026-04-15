/**
 * Photoreal — Candid iPhone photo aesthetic with REAL PEOPLE
 *
 * Powered by the nano-banana-photoreal playbook. Generates images that
 * look like real phone photos, not AI art. For content where a human
 * protagonist sells the hook (testimonials, founders, "I did X" stories).
 *
 * Uses the 5-layer structure:
 *   Subject (asymmetric, real) + Environment (specific) + Camera (iPhone 15 Pro)
 *   + Lighting (directional) + Texture (pores, catchlight, grain)
 *   + Negative constraints (no smooth skin, no AI aesthetic, etc.)
 *
 * Content file format (one slide per line):
 *   Headline | Body text
 *
 * Example:
 *   I quit my bank job | And made more in 3 months than in 3 years there.
 */

const SCENES = [
  'A 27-year-old man in a grey hoodie sitting cross-legged on an unmade bed with a laptop showing blurred charts, warm bedside lamp glowing, bookshelf behind, slight concentrated expression. Warm tungsten light from the lamp on the left, cool ambient light from the window on the right. Slight noise in shadows. Visible skin pores, uneven stubble, cinematic catchlight in eyes, slight asymmetry in face.',

  'A 28-year-old woman in a fitted charcoal blazer over a white tee, walking out of a revolving glass door of a European bank building, phone in one hand, subtle half-smile. Cool overcast morning light, soft shadow, slight reflection on the glass. Slight motion blur. Visible skin pores, peach fuzz, cinematic catchlight in eyes, slight asymmetry in face.',

  'A 24-year-old man in a brown puffer jacket and white beanie, standing on a snowy mountain terrace with ski lifts and fog in the background, slight crooked smile, hands relaxed at sides. Overcast alpine light, soft diffusion, no hard shadows. Slight motion blur, visible skin pores, peach fuzz on jaw, cinematic catchlight in eyes, slight asymmetry in face.',

  'A 31-year-old man in a wrinkled grey t-shirt and unshaven jaw, sitting at a cluttered desk with two monitors showing blurred code and a half-empty coffee mug, mid-typing, slight tired expression. Afternoon window light from the left, natural shadow on right side of face, warm tones. Slight grain, visible skin pores, uneven stubble, cinematic catchlight in eyes.',

  'A 29-year-old woman in a cream oversized sweater holding a ceramic coffee mug at a sun-drenched kitchen counter with a laptop showing blurred spreadsheet, morning sidelight through a window on the left, soft warm tones, slight steam rising from the mug. Visible skin pores, peach fuzz, cinematic catchlight in eyes, slight asymmetry in face.',

  'A 30-year-old man in a faded black hoodie, leaning against the window of an early-morning commuter train, phone in hand showing blurred numbers, city lights blurred outside the window. Cool blue dawn light from the window mixed with warm interior fluorescent. Visible skin pores, uneven stubble, slight under-eye shadow, cinematic catchlight in eyes.',

  'A 26-year-old woman in a slim black turtleneck, sitting at a minimalist wooden desk with a closed MacBook and a paper notebook with handwritten notes, mid-writing with a pen, focused expression, natural daylight from a tall window on the left. Visible skin pores, peach fuzz, cinematic catchlight in eyes, slight asymmetry.',

  'A 32-year-old man in a plain white tee and black jeans, standing on a rooftop at sunset overlooking a European city skyline, phone in hand, slight thoughtful half-smile, golden hour sidelight from the right. Warm amber tones, visible skin pores, three-day stubble, cinematic catchlight in eyes, slight asymmetry in face.',
];

const PHOTO_STYLE = `A candid iPhone photo — NOT a staged photoshoot, NOT a professional portrait, NOT AI art.

Shot on iPhone 15 Pro rear camera, handheld, slightly off-angle, like a real photo a friend would take and post on their personal Instagram grid. NOT centered, NOT posed, NOT golden-hour-perfect. The subject is unaware or mid-action.

CRITICAL — kill every "photographer move":
• NO heavy bokeh or creamy background blur (phones have smaller sensors)
• NO perfectly centered subject
• NO golden hour / magic hour glow
• NO stylized color grading
• NO HDR, NO flat editorial look, NO smooth skin filter
• NO beauty retouch, NO airbrushing, NO symmetrical doll face
• NO AI aesthetic — no plastic sheen, no waxy skin, no over-saturation

Photo must have the small imperfections of a real phone photo: slight noise in shadows, natural JPEG compression, a tiny bit of motion blur, skin pores visible, peach fuzz catching the light, one tiny catchlight in the iris that makes the eyes alive. Slightly asymmetric face. Clothes lived-in, never stylist-picked.

Overall feel: this photo was taken 30 seconds ago on someone's phone and barely edited. Would not look out of place in a real person's camera roll.`;

const FORMAT = `FORMAT: Vertical 4:5 portrait, 1080x1350px. The photograph fills every single pixel — FULL BLEED, edge to edge, zero borders, zero frames, zero margins, zero padding. NO Polaroid frame. NO photo border. NO white surround. NO vignette border. NO text, NO captions, NO writing of any kind in the image — text will be overlaid separately.`;

const NEGATIVE = `Avoid: smooth skin filter, beauty retouch, plastic skin texture, symmetrical face, airbrushed look, HDR glow, digital sheen, over-saturated colors, AI aesthetic, doll-like eyes, waxy appearance, bloated face, flat eyes, over-retouched, generic stock photo feel, supermodel look, fashion editorial, studio lighting, heavy bokeh, centered composition, golden hour glamour shot.`;

/**
 * Build a photo-only prompt (text overlay is handled by sharp, not Gemini).
 * Returns a slide object: { photoPrompt, headline, body }
 */
function buildSlide(headline, body, slideIndex = 0) {
  const scene = SCENES[slideIndex % SCENES.length];
  return {
    photoPrompt: `${FORMAT}\n\nSCENE: ${scene}\n\nPHOTOGRAPHY: ${PHOTO_STYLE}\n\nNEGATIVE: ${NEGATIVE}`,
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
 * Default 5-slide WealthMaia carousel in photoreal style.
 */
function defaultPrompts(brand = 'WEALTHMAIA') {
  const slides = [
    ['Dejé mi trabajo en el banco', `Y en 3 meses gané más que en 3 años allí. Así lo hice.`],
    ['Tu sueldo es tu prisión', `La única salida es tener activos que trabajen por ti.`],
    ['300€ al mes desde los 22', `A los 60 tienes casi un millón. Es matemática, no magia.`],
    ['Lo que nadie te cuenta', `El 90% de los fondos activos pierden contra el S&P 500 a 20 años.`],
    [`Empieza con ${brand}`, `La IA analiza tu cartera y te dice exactamente qué hacer.`],
  ];
  return slides.map(([h, b], i) => buildSlide(h, b, i));
}

module.exports = { buildSlide, parseContentFile, defaultPrompts, SCENES, useTextOverlay: true };