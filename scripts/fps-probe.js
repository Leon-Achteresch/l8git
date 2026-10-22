// Injected by benchmark-minibrowser-fps.mjs into the ui-test build: scroll the scene's main list for a
// fixed number of rAF frames and POST frame stats, so browsers without devtools (MiniBrowser) report FPS.
const params = new URLSearchParams(location.search);
const frameCount = Number(params.get('frames') ?? 240);
const pxPerFrame = Number(params.get('px') ?? 0);
const anchorSelector = params.get('anchor') ?? '[data-testid="files"], [data-commit-hash]';

const scrollable = node => node.scrollHeight > node.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(node).overflowY);

async function waitFor(find, timeoutMs = 60_000) {
  const start = performance.now();
  for (;;) {
    const found = find();
    if (found) return found;
    if (performance.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${anchorSelector}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function run() {
  const anchor = await waitFor(() => document.querySelector(anchorSelector));
  await new Promise(resolve => setTimeout(resolve, 1000));
  let scroller = [...anchor.querySelectorAll('*')].find(scrollable);
  for (let node = anchor; !scroller && node && node !== document.body; node = node.parentElement) if (scrollable(node)) scroller = node;
  if (!scroller) throw new Error('Missing scrollable list');
  const intervals = [];
  let previous;
  await new Promise(resolve => {
    const tick = now => {
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (pxPerFrame > 0) {
        const span = 2 * max;
        const pos = (intervals.length * pxPerFrame) % span;
        scroller.scrollTop = pos <= max ? pos : span - pos;
      } else {
        const phase = (intervals.length % 120) / 120;
        scroller.scrollTop = max * (1 - Math.abs(phase * 2 - 1));
      }
      if (intervals.length < frameCount) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  intervals.sort((a, b) => a - b);
  const mean = intervals.reduce((sum, n) => sum + n, 0) / intervals.length;
  return { fps: 1000 / mean, p50FrameMs: intervals[Math.floor(intervals.length / 2)], p95FrameMs: intervals[Math.floor(intervals.length * 0.95)], framesOver33Ms: intervals.filter(n => n > 33.4).length };
}

const send = body => fetch('/__fps', { method: 'POST', body: JSON.stringify(body) });
run().then(send, error => send({ error: String(error) }));
