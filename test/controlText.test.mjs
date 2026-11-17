import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlText } from '../core/controlText.js';

for (const ratio of [1, 3]) test(`control text centers painted pixels at ${ratio}x despite incorrect font metrics`, async t => {
  const old = globalThis.getComputedStyle;
  const oldRatio = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = ratio;
  globalThis.getComputedStyle = () => ({ fontStyle: 'normal', fontWeight: '900', fontSize: '17px',
    fontFamily: 'Cairo', textTransform: 'uppercase', letterSpacing: 'normal', color: '#eaeaea' });
  t.after(() => { if (old) globalThis.getComputedStyle = old; else delete globalThis.getComputedStyle; });
  t.after(() => { if (oldRatio === undefined) delete globalThis.devicePixelRatio; else globalThis.devicePixelRatio = oldRatio; });
  let ready, bounds = { width: 9, actualBoundingBoxLeft: -1, actualBoundingBoxRight: 10,
    actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }, made = 0;
  const paints = [], placements = [], context = {
    measureText: () => bounds, setTransform() {}, fillText: (...args) => paints.push(args),
    getImageData(x, y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4);
      // Deliberately disagree with the metrics; the painted text is off-center.
      for (let y = 22 * ratio; y < 32 * ratio; y++)
        for (let x = 20 * ratio; x < 29 * ratio; x++) data[(y * width + x) * 4 + 3] = 255;
      return { width, height, data };
    },
    putImageData(pixels, dx, dy) { placements.push([dx, dy]); }
  };
  const canvas = { style: {}, isConnected: true, getContext: () => context };
  const loaded = new Promise(resolve => { ready = resolve; });
  const doc = { createElement() { made++; return canvas; }, fonts: { load(font, text) {
    assert.equal(font, 'normal 900 17px Cairo'); assert.equal(text, 'AD'); return loaded;
  } } };
  const label = { isConnected: false, appendChild(child) { this.child = child; } };
  controlText(label, 'Ad', doc);
  assert.equal(made, 0, 'Detached controls retain plain text until valid font metrics exist');
  label.isConnected = true;
  controlText(label, 'Ad', doc);
  assert.equal(canvas.style.width, '17px'); assert.equal(canvas.style.height, '17px');
  assert.deepEqual(paints[0], ['AD', 20, 29.5]);
  const checkCentered = () => {
    const [dx, dy] = placements.at(-1);
    const left = 20 * ratio + dx, right = canvas.width - (29 * ratio + dx);
    const top = 22 * ratio + dy, bottom = canvas.height - (32 * ratio + dy);
    assert.ok(Math.abs(left - right) <= 1, 'Painted ink centered horizontally within one device pixel');
    assert.ok(Math.abs(top - bottom) <= 1, 'Painted ink centered vertically within one device pixel');
  };
  checkCentered();
  controlText(label, 'Ad', doc); assert.equal(made, 1);
  bounds = { width: 10, actualBoundingBoxLeft: 1, actualBoundingBoxRight: 9,
    actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  ready(); await loaded;
  assert.deepEqual(paints[1], ['AD', 21.5, 28.5]);
  checkCentered();
});
