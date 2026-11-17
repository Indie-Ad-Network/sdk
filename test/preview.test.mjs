import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function preview() {
  const nodes = new Map(), sent = [];
  for (const id of ['player', 'viewport', 'file', 'stop', 'controls', 'kind', 'url', 'format', 'duration', 'skip', 'hold', 'cta', 'events', 'status'])
    nodes.set(id, { value: '', textContent: '', style: {}, files: [] });
  Object.assign(nodes.get('player'), { contentWindow: { postMessage: (...args) => sent.push(args) } });
  for (const [id, value] of Object.entries({ kind: 'card', duration: '15', skip: '5', hold: '3', format: 'rewarded', cta: 'compact' })) nodes.get(id).value = value;
  let message;
  const origin = 'http://127.0.0.1:8765';
  vm.runInNewContext(readFileSync(new URL('../web/preview.js', import.meta.url), 'utf8'), {
    document: { getElementById: id => nodes.get(id) }, location: { origin },
    URL: { revokeObjectURL() {} }, Date,
    addEventListener: (type, listener) => { message = listener; },
  });
  return { nodes, sent, play: () => nodes.get('controls').onsubmit({ preventDefault() {} }),
    ready: run => message({ source: nodes.get('player').contentWindow, origin, data: { previewReady: true, run } }) };
}

test('Play waits for the frame listener readiness instead of the iframe load event', () => {
  const p = preview(); p.play();
  assert.equal(p.sent.length, 0);
  p.ready('1');
  assert.equal(p.sent.length, 1);
  assert.equal(p.sent[0][0].preview.kind, 'card');
  p.ready('1');
  assert.equal(p.sent.length, 1);
});

test('old frame readiness cannot launch a newer request or a stopped preview', () => {
  const p = preview(); p.play(); p.play();
  p.ready('1'); assert.equal(p.sent.length, 0);
  p.ready('2'); assert.equal(p.sent.length, 1);
  p.play(); p.nodes.get('stop').onclick();
  p.ready('3'); p.ready('4'); assert.equal(p.sent.length, 1);
});
