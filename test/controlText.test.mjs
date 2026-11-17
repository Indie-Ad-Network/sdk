import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlText } from '../core/controlText.js';

test('fixed control text centers ink, uses the explicit font, and repaints after it loads', async t => {
  const old = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ fontStyle: 'normal', fontWeight: '900', fontSize: '17px',
    fontFamily: 'Cairo', textTransform: 'uppercase', letterSpacing: 'normal', color: '#eaeaea' });
  t.after(() => { if (old) globalThis.getComputedStyle = old; else delete globalThis.getComputedStyle; });
  let ready, bounds = { width: 9, actualBoundingBoxLeft: -1, actualBoundingBoxRight: 10,
    actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }, made = 0;
  const paints = [], context = { measureText: () => bounds, setTransform() {}, fillText: (...args) => paints.push(args) };
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
  assert.deepEqual(paints[0], ['AD', 3, 12.5]);
  controlText(label, 'Ad', doc); assert.equal(made, 1);
  bounds = { width: 10, actualBoundingBoxLeft: 1, actualBoundingBoxRight: 9,
    actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
  ready(); await loaded;
  assert.deepEqual(paints[1], ['AD', 4.5, 11.5]);
});
