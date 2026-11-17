// Fixed text surfaces prevent font-load/layout races from moving a countdown
// outside its control. Center the rasterized ink: browser font metrics can
// disagree with the pixels actually painted, including in iPhone web views.
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
    // Leave room around the reported bounds so inaccurate metrics cannot clip ink
    // before we measure it. Read only this small, local text canvas.
    const padding = Math.ceil(size);
    const scratchWidth = width + padding * 2, scratchHeight = height + padding * 2;
    canvas.width = Math.ceil(scratchWidth * ratio);
    canvas.height = Math.ceil(scratchHeight * ratio);
    const scaleX = canvas.width / scratchWidth, scaleY = canvas.height / scratchHeight;
    context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    context.font = font;
    context.fillStyle = color;
    context.textBaseline = 'alphabetic';
    if ('letterSpacing' in context) context.letterSpacing = spacing === 'normal' ? '0px' : spacing;
    context.fillText(text, padding + (width + left - right) / 2, padding + (height + ascent - descent) / 2);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    let x0 = pixels.width, y0 = pixels.height, x1 = -1, y1 = -1;
    for (let y = 0; y < pixels.height; y++) {
      for (let x = 0; x < pixels.width; x++) {
        if (!pixels.data[(y * pixels.width + x) * 4 + 3]) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y);
        x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    canvas.width = Math.max(Math.ceil(width * ratio), x1 - x0 + 1);
    canvas.height = Math.max(Math.ceil(height * ratio), y1 - y0 + 1);
    canvas.style.width = `${canvas.width / ratio}px`;
    canvas.style.height = `${canvas.height / ratio}px`;
    if (x1 >= x0) {
      // putImageData uses device pixels and ignores the context transform.
      context.putImageData(pixels, Math.round((canvas.width - (x1 - x0 + 1)) / 2) - x0,
        Math.round((canvas.height - (y1 - y0 + 1)) / 2) - y0);
    }
  };
  paint();
  // Explicitly request this exact face, then repaint once its real metrics are available.
  doc.fonts?.load(font, text).then(paint).catch(() => {});
}
