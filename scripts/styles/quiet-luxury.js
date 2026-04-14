/**
 * Quiet Luxury — Premium lifestyle photography, candid aesthetic
 *
 * The aesthetic: photos that feel like they were taken on an iPhone by someone
 * who happens to live well. Not staged, not obvious — wealth shows through
 * context, not labels. Dark, moody, slightly underexposed. The kind of photo
 * that ends up on a curated personal Instagram grid.
 *
 * Visual signature:
 *  - Shot on iPhone 15 Pro, natural available light
 *  - Slightly underexposed, deep heavy shadows
 *  - Asymmetric composition — subject off-center, breathing room
 *  - Subtle wealth signals: leather, steel watches, good glass, city views
 *  - No faces, no obvious logos, no staged poses
 *  - Warm amber vs deep blue/black color contrast
 *
 * Content file format (one slide per line):
 *   Headline | Body text
 *
 * Example:
 *   Business class | La forma más cara de estar cómodo.
 *   Penthouse view | El silencio tiene un precio.
 */

const SCENES = [
  'First-person POV sitting in a wide business class seat on a long-haul flight at night — looking down and slightly forward. A man\'s left hand rests on the wide leather armrest, a steel Rolex Submariner on the wrist catches warm amber overhead cabin light. To the right, a champagne flute partially cropped at the edge of frame, half-full, condensation on the glass. The oval window ahead shows deep blue-black night sky and faint city lights far below. Overhead beam casts narrow warm amber cone of light on the seat. The rest of the cabin is dark. No face visible.',

  'Street-level shot from behind a man in a slim black overcoat waiting to cross a rain-slicked street at night in a European city. Reflections of restaurant neon and streetlamps stretch across the wet pavement. He holds a slim leather bag at his side. Slight motion blur on passing car headlights. Deep shadow, cool blue-grey ambient light broken by one warm amber restaurant window to the left. No face visible.',

  'POV from the driver\'s seat of a Porsche 911 at golden hour — dashboard, leather-wrapped steering wheel, and the open road ahead framed by the windscreen. The sun is low and to the right, flooding warm amber light across the interior. Instrument cluster softly lit. Hand resting on the gear shift, steel watch visible. Road curves gently into hills ahead. No face. Slightly moody, like a personal photo saved from a drive.',

  'Hotel terrace at dusk, city skyline in background. A small round marble table with two glasses of red wine, one untouched, slightly condensated. The terrace railing is black wrought iron. City lights are beginning to come on below — warm orange and white pinpoints against a deep blue-purple dusk sky. Stone floor, one wicker chair partially visible. No people in frame. Slightly underexposed, ambient light only.',

  'Interior of a penthouse apartment at night. Floor-to-ceiling windows cover the far wall, the city grid spreading out in the darkness below — thousands of warm orange lights. A single floor lamp with a warm amber shade in the far corner. Dark leather sofa partially in frame on the left. No overhead lights — the room is lit only by the city through the glass and the one lamp. Deep shadow fills most of the room.',

  'Close crop of a man\'s wrist and hand holding a crystal whisky glass with a single large ice sphere. Warm amber whisky glows in low bar light. A stainless steel AP Royal Oak visible on the wrist. Dark marble bar surface below. Background is pure black with a faint out-of-focus bottle shelf lit by warm downlighting. No face. Shot from slightly above, candid feel.',

  'Private pool at night, somewhere warm. Dark water with subtle refracted light rippling across the surface. City lights or hillside lights visible in the far distance over the pool edge. Sunlounger at the edge, white towel draped over it. No people in frame. Deeply underexposed — just enough ambient light to read the scene. Intimate, private, expensive.',

  'First-class train compartment — wide leather seat, small table with a glass of still water and a folded newspaper. Window shows blurred countryside at speed, warm late-afternoon light. Inside is dim and calm, just the amber glow from the overhead reading light. Leather texture on the headrest catching the light. No face visible. Quiet, unhurried.',

  'Exterior of a low-lit restaurant at night seen through its floor-to-ceiling glass facade. Inside: white tablecloths, candles, two figures silhouetted in conversation — faces indistinct, just shapes. Warm amber interior glow against the cool dark street. Cobblestones in the foreground slightly wet, reflecting the light. No signage visible. A black car partially visible at the right edge.',

  'Looking out the window of a private jet at cruising altitude. Below: a scattered city grid at night, tiny lights forming grids and curves in the darkness. The oval window frame is visible, slightly reflective. Inside the cabin behind is dark — just the faint ambient glow of the aircraft interior. Deep blue-black sky above the horizon. No face, no people.',
];

const PHOTO_STYLE = `A candid personal photograph taken on an iPhone 15 Pro. NOT professional photography, NOT a staged editorial shot — this looks like a photo someone took for themselves and happened to save to their camera roll.

KEY AESTHETIC REQUIREMENTS:
• Natural available light only — no flash, no studio lighting, no ring light
• Slightly underexposed — rich deep shadows, not crushed but present throughout the frame
• Asymmetric, slightly imperfect composition — off-center subject, negative space used intentionally
• Subtle warmth where ambient light permits (amber bar light, hotel lamp, cabin light), otherwise cool and dark
• Minor JPEG compression artifacts — real phone photo texture, not clinical sharpness
• Colors are rich but not vivid — slightly desaturated, muted, feels real not filtered
• Deep blacks and shadows dominate at least 40% of the frame
• Moody personal-gallery aesthetic — like something posted to a private Instagram story

The overall feeling is candid, personal, and quietly aspirational. NOT a stock photo. NOT a luxury brand campaign. NOT HDR. Just a really good personal photo taken by someone living well.`;

const FORMAT = `FORMAT: Vertical 4:5 portrait, 1080x1350px. Full bleed — the photograph fills every pixel, edge to edge. ZERO borders, ZERO frames, ZERO margins, ZERO white space. The image starts at the exact corner of the canvas. NO Polaroid frame. NO photo border. NO white surround. NO vignette border. NO publication headers. NO text, NO captions, NO watermarks — text will be added in post.`;

/**
 * Build a slide object: { photoPrompt, headline, body }
 */
function buildSlide(headline, body, slideIndex = 0) {
  const scene = SCENES[slideIndex % SCENES.length];
  return {
    photoPrompt: `${FORMAT}\n\nSCENE: ${scene}\n\nPHOTOGRAPHY STYLE: ${PHOTO_STYLE}`,
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
 * Default 5-slide WealthMaia carousel in quiet-luxury style.
 */
function defaultPrompts(brand = 'WEALTHMAIA') {
  const slides = [
    ['Business class', 'La forma más cara de estar cómodo.'],
    ['Flujo de caja', 'Tu empresa puede tener beneficios y quedarse sin liquidez. El cash real manda.'],
    ['Margen operativo', 'Cuánto gana la empresa por cada euro vendido. Cuanto más alto, mejor.'],
    ['Deuda neta / EBITDA', 'Por encima de 3x hay riesgo. Por debajo de 1x, tranquilidad.'],
    ['Empieza a invertir', `${brand} analiza los números por ti. Toma decisiones con datos.`],
  ];
  return slides.map(([h, b], i) => buildSlide(h, b, i));
}

module.exports = { buildSlide, parseContentFile, defaultPrompts, SCENES, useTextOverlay: true };
