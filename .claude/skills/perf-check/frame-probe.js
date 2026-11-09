// initScript for Chrome DevTools MCP (perf-check skill, step 4): answers /api/chat with the canned
// stream in /__sse.txt and times every requestAnimationFrame callback that draws on a canvas (the
// knowledge map's frames) into window.__mapFrames as { at, cost }.
window.__mapFrames = [];
(() => {
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    if (String(url).includes('/api/chat')) {
      const body = await (await fetchOriginal('/__sse.txt')).text();
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return fetchOriginal(url, options);
  };
  let draws = 0;
  const drawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    draws += 1;
    return drawImage.apply(this, args);
  };
  const request = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    request((at) => {
      draws = 0;
      const start = performance.now();
      callback(at);
      if (draws > 0) window.__mapFrames.push({ at, cost: performance.now() - start });
    });
})();
