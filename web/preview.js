const $ = id => document.getElementById(id);
let blob = null;
function reset() {
  $('player').onload = null;
  $('player').src = 'preview-frame.html';
  if (blob) URL.revokeObjectURL(blob);
  blob = null;
}
$('viewport').onchange = () => {
  const [width, height] = $('viewport').value.split(',');
  Object.assign($('player').style, { width: `${width}px`, height: `${height}px` });
};
$('file').onchange = () => { if ($('file').files.length) $('kind').value = 'video'; };
$('stop').onclick = () => { reset(); $('status').textContent = 'Stopped.'; };
$('controls').onsubmit = event => {
  event.preventDefault();
  const file = $('file').files[0], kind = $('kind').value;
  if (kind === 'video' && !file && !$('url').value) {
    $('status').textContent = 'Choose a video file or enter a video URL.';
    return;
  }
  reset();
  if (file) blob = URL.createObjectURL(file);
  const config = { kind, src: blob || $('url').value, format: $('format').value,
    secs: Number($('duration').value), skip: Number($('skip').value), hold: Number($('hold').value), cta: $('cta').value };
  $('events').textContent = '';
  $('status').textContent = 'Playing. Store and report actions are logged locally.';
  $('player').onload = () => {
    $('player').onload = null;
    $('player').contentWindow.postMessage({ preview: config }, location.origin);
  };
};
addEventListener('message', event => {
  if (event.source !== $('player').contentWindow || event.origin !== location.origin) return;
  if (!event.data?.previewEvent) return;
  $('events').textContent += `${JSON.stringify(event.data.previewEvent)}\n`;
  $('events').scrollTop = $('events').scrollHeight;
  if (event.data.previewEvent.done) $('status').textContent = 'Finished. Play again to repeat.';
});
