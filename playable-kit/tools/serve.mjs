// A local server for trying a playable inside indie-ads' own ad player (harness.html, core/player.js).
//   node tools/serve.mjs path/to/playable.html [port]
// then open the address it prints. Settings are in the address:
//   ?secs=30  ?finishEarly=1  ?keepPlaying=1  ?muted=1  ?format=interstitial  ?wait=1 (show on the button, for sound)
// /indie-ads/* is this repository, /playable.html the page given (read afresh each time). Nothing is written.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..'), sdk = resolve(kit, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
export function serve(playable, port = 8765) {
  playable = resolve(playable);
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = path === '/playable.html' ? playable : path === '/' || path === '/harness.html' ? join(kit, 'tools/harness.html') : path.startsWith('/indie-ads/') ? join(sdk, path.slice(11)) : null;
    if (!file || (file !== playable && !file.startsWith(sdk))) { res.writeHead(404).end('not found'); return; }
    try { const body = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body); }
    catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((ok, no) => { server.once('error', no); server.listen(port, '127.0.0.1', () => ok(server)); });
}
if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) {
  const [playable, port = 8765] = process.argv.slice(2);
  if (!playable) { console.log('usage: node tools/serve.mjs path/to/playable.html [port]'); process.exit(2); }
  await serve(playable, +port);
  console.log(`http://localhost:${port}/harness.html?secs=30&finishEarly=1   (${resolve(playable)})`);
}
