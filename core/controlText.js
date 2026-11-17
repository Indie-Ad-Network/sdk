// Fixed text surfaces prevent font-load/layout races from moving a countdown
// outside its control. Canvas exposes the painted ink bounds, unlike SVG getBBox
// which can include the font's full ascender/descender box on some browsers.
const labels = new WeakMap();
export function controlText(element, value, doc = document) {
  if (!element) return;
  const word = String(value);
  if (labels.get(element) === word) return;
  labels.set(element, word);
  element.textContent = value;
  if (!word) return;
  // Some creatives draw before their host is attached. Computed fonts are empty
  // there; do not cache that initial value or leave an unpainted default canvas.
  if (element.isConnected === false) { labels.delete(element); return; }
  const canvas = doc.createElement('canvas'), context = canvas.getContext?.('2d');
  if (!context) return;
  const style = getComputedStyle(element);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const color = style.color, size = parseFloat(style.fontSize);
  const text = style.textTransform === 'uppercase' ? word.toLocaleUpperCase() : word;
  const spacing = style.letterSpacing;
  canvas.textContent = word;
  canvas.style.display = 'block';
  canvas.style.flex = 'none';
  element.textContent = '';
  element.appendChild(canvas);
  const paint = () => {
    if (!canvas.isConnected) return;
    context.font = font;
    if ('letterSpacing' in context) context.letterSpacing = spacing === 'normal' ? '0px' : spacing;
    const m = context.measureText(text);
    const left = m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight;
    const ascent = m.actualBoundingBoxAscent, descent = m.actualBoundingBoxDescent;
    const width = Math.ceil(Math.max(size, m.width, left + right));
    const height = Math.ceil(Math.max(size, ascent + descent));
    const ratio = globalThis.devicePixelRatio || 1;
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    context.font = font;
    context.fillStyle = color;
    context.textBaseline = 'alphabetic';
    if ('letterSpacing' in context) context.letterSpacing = spacing === 'normal' ? '0px' : spacing;
    context.fillText(text, (width + left - right) / 2, (height + ascent - descent) / 2);
  };
  paint();
  // Explicitly request this exact face, then repaint once its real metrics are available.
  doc.fonts?.load(font, text).then(paint).catch(() => {});
}
