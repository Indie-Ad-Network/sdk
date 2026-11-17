// Center the painted glyphs rather than the font's line box. Cairo's generous
// ascender/descender metrics otherwise put labels low in some device web views.
const labels = new WeakMap();
export function controlText(element, value, doc = document) {
  if (!element) return;
  const word = String(value), previous = labels.get(element);
  if (previous?.word === word) return;
  element.textContent = value;
  labels.set(element, { word });
  if (!word || !doc.createElementNS) return;
  const style = getComputedStyle(element), ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg'), text = doc.createElementNS(ns, 'text');
  const height = parseFloat(style.fontSize);
  svg.setAttribute('height', height);
  svg.setAttribute('width', 1);
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  text.style.font = style.font;
  text.style.letterSpacing = style.letterSpacing;
  text.setAttribute('fill', style.color);
  text.textContent = word;
  svg.appendChild(text);
  element.textContent = '';
  element.appendChild(svg);
  const center = () => {
    if (!svg.isConnected) return;
    const box = text.getBBox(), width = Math.max(1, box.width);
    svg.setAttribute('width', width);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    text.setAttribute('transform', `translate(${-box.x},${height / 2 - box.y - box.height / 2})`);
  };
  center();
  // Re-measure after the embedded font is ready; the initial layout may use a fallback.
  doc.fonts?.ready.then(center);
}
