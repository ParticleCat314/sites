/* Demo page for giraffeplot. The library is the vendored minified bundle;
   everything below is page code: data synthesis, theming, and the 3D orbit. */
(() => {
  const { Plot } = Giraffeplot;

  // Deterministic data so the page looks the same on every load.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Categorical slots 1–3, validated for CVD and contrast on both surfaces.
  const themes = {
    light: {
      background: 'transparent',
      foreground: '#1c1b18',
      muted: '#8a8577',
      grid: '#e7e3d8',
      axis: '#dcd8cc',
      crosshair: '#8a8577',
      tooltipBackground: '#fffefb',
      tooltipBorder: '#dcd8cc',
      palette: ['#2a78d6', '#eb6834', '#1baf7a'],
      up: '#1baf7a',
      down: '#eb6834',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 11,
    },
    dark: {
      background: 'transparent',
      foreground: '#e8e4da',
      muted: '#7d7869',
      grid: '#26241f',
      axis: '#2e2c27',
      crosshair: '#7d7869',
      tooltipBackground: '#1d1c19',
      tooltipBorder: '#2e2c27',
      palette: ['#3987e5', '#d95926', '#199e70'],
      up: '#199e70',
      down: '#d95926',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 11,
    },
  };

  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function mode() {
    const forced = root.getAttribute('data-theme');
    if (forced) return forced;
    return media.matches ? 'dark' : 'light';
  }

  const plots = [];
  function make(id, options) {
    const plot = new Plot(document.getElementById(id), {
      theme: themes[mode()],
      ...options,
    });
    plots.push(plot);
    return plot;
  }

  // ── streaming ──────────────────────────────────────────────
  const stream = make('c-stream', {
    series: [
      { key: 'total', label: 'requests/s', type: 'area' },
      { key: 'errors', label: 'errors/s' },
    ],
    x: { label: 'time (s)' },
    y: { label: 'rate', zeroBased: true },
    window: 60,
    legend: true,
    smooth: true,
  });
  const streamRand = mulberry32(7);
  let t = 0, base = 40;
  setInterval(() => {
    t += 0.05;
    base += (streamRand() - 0.5) * 2 + (42 - base) * 0.01;
    const total = base + 8 * Math.sin(t / 3) + streamRand() * 4;
    const burst = streamRand() < 0.004 ? streamRand() * 12 : 0;
    const errors = Math.max(0, total * 0.03 + (streamRand() - 0.5) * 1.2 + burst);
    stream.push(t, { total, errors });
  }, 50);

  // ── histogram + density ────────────────────────────────────
  const histRand = mulberry32(11);
  const latencies = new Float64Array(4000);
  for (let i = 0; i < latencies.length; i++) {
    // Log-normal-ish service latency with a slow second mode.
    const u = histRand(), v = histRand();
    const n = Math.sqrt(-2 * Math.log(u || 1e-12)) * Math.cos(2 * Math.PI * v);
    latencies[i] = histRand() < 0.15
      ? 90 + n * 12
      : 30 * Math.exp(n * 0.35);
  }
  make('c-hist', {
    series: [
      { key: 'h', label: 'observed', type: 'histogram', normalize: 'density' },
      { key: 'k', label: 'kernel estimate', type: 'density' },
    ],
    data: { h: latencies, k: latencies },
    x: { label: 'latency (ms)' },
    y: { label: 'density' },
    legend: true,
  });

  // ── candlestick ────────────────────────────────────────────
  const candleRand = mulberry32(23);
  const n = 120;
  const times = [], open = [], high = [], low = [], close = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const o = price;
    const drift = (candleRand() - 0.48) * 3;
    const c = o + drift;
    const h = Math.max(o, c) + candleRand() * 1.6;
    const l = Math.min(o, c) - candleRand() * 1.6;
    times.push(i); open.push(o); high.push(h); low.push(l); close.push(c);
    price = c;
  }
  make('c-candle', {
    series: [{ key: 'p', label: 'price', type: 'candlestick' }],
    data: { p: { xs: times, ys: close, channels: { open, high, low, close } } },
    x: { label: 'bar' },
    y: { label: 'price' },
    interactions: { zoom: 'x', pan: 'x' },
  });

  // ── heatmap ────────────────────────────────────────────────
  const W = 56, H = 36;
  const hx = [], hy = [], hz = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = (i / W - 0.5) * 4, v = (j / H - 0.5) * 4;
      hx.push(i); hy.push(j);
      hz.push(Math.sin(u * 1.7 + v) * Math.cos(v * 1.3) * Math.exp(-0.08 * (u * u + v * v)));
    }
  }
  make('c-heat', {
    series: [{ key: 'f', type: 'heatmap', colorScale: 'divergent', colorDomain: [-1, 1] }],
    data: { f: { xs: hx, ys: hy, channels: { z: hz } } },
    x: { label: 'column' },
    y: { label: 'row' },
  });

  // ── wind rose ──────────────────────────────────────────────
  const roseRand = mulberry32(31);
  const bearings = new Float64Array(2000);
  for (let i = 0; i < bearings.length; i++) {
    // Prevailing south-westerly with a lighter northerly mode.
    const m = roseRand() < 0.7 ? 225 : 10;
    const spread = (roseRand() + roseRand() + roseRand() - 1.5) * 60;
    bearings[i] = ((m + spread) % 360 + 360) % 360;
  }
  make('c-rose', {
    series: [{ key: 'w', type: 'rose', bins: 16 }],
    data: { w: bearings },
  });

  // ── 3d surface ─────────────────────────────────────────────
  const SW = 44, SH = 44;
  const sx = [], sy = [], sz = [];
  for (let j = 0; j < SH; j++) {
    for (let i = 0; i < SW; i++) {
      const u = (i / (SW - 1) - 0.5) * 6, v = (j / (SH - 1) - 0.5) * 6;
      const r = Math.hypot(u, v);
      sx.push(u); sy.push(v);
      sz.push(Math.sin(r * 1.8) / (1 + r * 0.6) + 0.25 * Math.cos(u * 1.2));
    }
  }
  let azimuth = 38, elevation = 30;
  const surface = make('c-surface', {
    series: [{ key: 's', type: 'surface3d', colorScale: 'divergent' }],
    data: { s: { xs: sx, ys: sy, channels: { z: sz } } },
    view3d: { azimuth, elevation },
  });
  const surfaceEl = document.getElementById('c-surface');
  surfaceEl.style.touchAction = 'none';
  surfaceEl.style.cursor = 'grab';
  surfaceEl.addEventListener('pointerdown', (e) => surfaceEl.setPointerCapture(e.pointerId));
  surfaceEl.addEventListener('pointermove', (e) => {
    if (!e.buttons) return;
    azimuth += e.movementX * 0.4;
    elevation = Math.max(5, Math.min(85, elevation - e.movementY * 0.3));
    surface.update({ view3d: { azimuth, elevation } });
  });

  // ── theme toggle ───────────────────────────────────────────
  const toggle = document.getElementById('theme-toggle');
  function applyTheme() {
    const m = mode();
    toggle.textContent = m === 'dark' ? 'light' : 'dark';
    const theme = themes[m];
    for (const plot of plots) plot.update({ theme });
  }
  toggle.addEventListener('click', () => {
    root.setAttribute('data-theme', mode() === 'dark' ? 'light' : 'dark');
    applyTheme();
  });
  media.addEventListener('change', applyTheme);
  applyTheme();
})();
