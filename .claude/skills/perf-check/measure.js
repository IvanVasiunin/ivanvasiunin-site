// evaluate_script for Chrome DevTools MCP (perf-check skill, step 4): asks the chat a question,
// waits for the map's ignition and summarizes the frames frame-probe.js recorded.
async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  window.__mapFrames = [];
  const input = document.querySelector('textarea');
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setValue.call(input, 'What did Ivan do at BrainRocket?');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 9000));
  const frames = window.__mapFrames;
  const costs = frames.map((f) => f.cost).sort((a, b) => a - b);
  const gaps = frames.slice(1).map((f, i) => f.at - frames[i].at);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const long = gaps.filter((gap) => gap > 50).length;
  return {
    frames: frames.length,
    medianWork: costs[Math.floor(costs.length / 2)]?.toFixed(1),
    p90Work: costs[Math.floor(costs.length * 0.9)]?.toFixed(1),
    medianGap: sortedGaps[Math.floor(sortedGaps.length / 2)]?.toFixed(1),
    longGaps: long,
    longShare: `${((long / Math.max(1, gaps.length)) * 100).toFixed(1)}%`,
    lightMode: document.querySelector('[data-slow-frames]') !== null,
  };
};
