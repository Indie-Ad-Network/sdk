import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlText } from '../core/controlText.js';

test('control labels center glyph ink and remeasure when the font loads', async t => {
  const old = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ font: '900 17px Cairo', fontSize: '17px', letterSpacing: 'normal', color: '#eaeaea' });
  t.after(() => { if (old) globalThis.getComputedStyle = old; else delete globalThis.getComputedStyle; });
  let ready, bounds = { x: 1, y: -10, width: 9, height: 12 }, made = 0;
  const node = () => ({ style: {}, attributes: {}, children: [], isConnected: true,
    setAttribute(key, value) { this.attributes[key] = value; },
    appendChild(child) { this.children.push(child); }, getBBox() { return bounds; } });
  const doc = { createElementNS() { made++; return node(); }, fonts: { ready: new Promise(resolve => { ready = resolve; }) } };
  const label = node();
  controlText(label, '2', doc);
  const svg = label.children[0], text = svg.children[0];
  assert.equal(text.attributes.transform, 'translate(-1,12.5)');
  assert.equal(svg.attributes.viewBox, '0 0 9 17');
  controlText(label, '2', doc);
  assert.equal(made, 2, 'The same countdown value does not rebuild SVG each tick');
  bounds = { x: -1, y: -8, width: 10, height: 10 };
  ready(); await doc.fonts.ready;
  assert.equal(text.attributes.transform, 'translate(1,11.5)');
  assert.equal(svg.attributes.viewBox, '0 0 10 17');
});
