const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const linear = (hex) => rgb(hex).map((v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

const modes = {
  term: { glsl: 0, aspect: 4 / 3 },
  radar: { glsl: 1, aspect: 1, size: [640, 640] },
  scope: { glsl: 2, aspect: 5 / 4, size: [800, 640] }
};

const signals = {
  mda: { label: "MDA 720×350", cell: 14, hz: 50, total: 369 },
  vga: { label: "VGA 720×400", cell: 16, hz: 70, total: 449 }
};

const ui = {
  mode: "term",
  phosphors: { term: "P39", radar: "P7", scope: "P31" },
  signal: "mda",
  shape: "lissajous32",
  hz: 50,
  rpm: 24,
  freq: 40,
  beam: 1,
  focus: 1,
  curve: 0.035,
  glow: 0.6,
  whine: false,
  unlock: false,
  interlace: false
};

const hzRange = () => (ui.unlock ? [0.5, 120] : [40, 120]);
const lineRate = () => signals[ui.signal].total * ui.hz * (ui.interlace ? 0.5 : 1);

const showFault = (msg) => {
  $("fault").hidden = false;
  $("fault").textContent = `NO SIGNAL\n\n${msg}`;
};

let crt = null;
try {
  crt = createCrt($("tube"));
} catch (e) {
  showFault(e.message);
}

let actx = null;
const audioContext = () => {
  actx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume();
  return actx;
};

const term = createTerminal({
  info: () => ({ signal: signals[ui.signal], hz: ui.hz, phosphor: ui.phosphors.term }),
  names: () => Object.keys(phosphors),
  setPhosphor: (name) => {
    if (!Object.hasOwn(phosphors, name)) return false;
    ui.phosphors[ui.mode] = name;
    applyPhosphor();
    return true;
  },
  setHz: (v) => {
    const [lo, hi] = hzRange();
    ui.hz = clamp(v, lo, hi);
    syncRanges();
    refreshDecay();
    return ui.hz;
  }
});
term.setCell(signals[ui.signal].cell);
const scope = createScope();
let radar = null;
let glass = [0, 0, 0];

const lightLeft = (p, t) => p.layers.reduce((sum, l) => sum + l.weight * Math.exp(-t / l.tau), 0);

const scanPeriod = () => {
  if (ui.mode === "term") return { t: (ui.interlace ? 2 : 1) / ui.hz, label: "1 FRAME" };
  if (ui.mode === "radar") return { t: 60 / ui.rpm, label: "1 SWEEP" };
  if (ui.shape === "audio") return { t: 1 / 60, label: "1/60 S" };
  return { t: 1 / ui.freq, label: "1 TRACE" };
};

const drawDecay = () => {
  const canvas = $("decay");
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const p = phosphors[ui.phosphors[ui.mode]];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const lo = -5;
  const hi = 1;
  const top = 8;
  const bottom = h - 20;
  const X = (t) => ((Math.log10(t) - lo) / (hi - lo)) * w;
  const Y = (v) => bottom - v * (bottom - top);

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  for (let d = lo + 1; d < hi; d++) {
    ctx.beginPath();
    ctx.moveTo(Math.round(X(10 ** d)) + 0.5, top);
    ctx.lineTo(Math.round(X(10 ** d)) + 0.5, bottom);
    ctx.stroke();
  }
  ctx.font = "15px VT323";
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  [[1e-5, "10µs"], [1e-3, "1ms"], [1e-1, "100ms"], [10, "10s"]].forEach(([t, label]) => {
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, clamp(X(t) - tw / 2, 2, w - tw - 2), h - 5);
  });

  ctx.beginPath();
  for (let i = 0; i <= w; i++) {
    const y = Y(lightLeft(p, 10 ** (lo + ((hi - lo) * i) / w)));
    if (i) ctx.lineTo(i, y);
    else ctx.moveTo(i, y);
  }
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2;
  ctx.shadowColor = p.ink;
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const { t, label } = scanPeriod();
  const x = Math.round(X(t)) + 0.5;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  const lw = ctx.measureText(label).width;
  ctx.fillText(label, x + lw + 6 < w ? x + 4 : x - lw - 4, top + 10);
};

const refreshDecay = () => {
  drawDecay();
  const p = phosphors[ui.phosphors[ui.mode]];
  const { t, label } = scanPeriod();
  const left = lightLeft(p, t) * 100;
  const pct = left >= 1 ? `${Math.round(left)}%` : `${left.toFixed(2)}%`;
  $("pleft").textContent = `${pct} left after ${label.toLowerCase()}`;
};

const updateModel = () => {
  let text = "XY SCOPE";
  if (ui.mode === "term") text = `${signals[ui.signal].label}${ui.interlace ? " INTERLACED" : ""}`;
  else if (ui.mode === "radar") text = "PPI RADAR";
  $("model").textContent = `${text} · ${ui.phosphors[ui.mode]}`;
};

const applyPhosphor = () => {
  const name = ui.phosphors[ui.mode];
  const p = phosphors[name];
  crt?.setPhosphor(p.layers);
  const [r, g, b] = rgb(p.ink);
  const root = document.documentElement.style;
  root.setProperty("--ink", p.ink);
  root.setProperty("--ink-dim", `rgba(${r}, ${g}, ${b}, 0.4)`);
  root.setProperty("--ink-faint", `rgba(${r}, ${g}, ${b}, 0.16)`);
  glass = linear(p.ink).map((c) => c * 0.0007 + 0.0005);
  $("phosphor").value = name;
  $("pnote").textContent = p.note;
  refreshDecay();
  updateModel();
};

const fillSignal = () => {
  const sel = $("signal");
  sel.innerHTML = "";
  if (ui.mode === "term") {
    Object.entries(signals).forEach(([k, s]) => sel.add(new Option(s.label, k)));
    sel.value = ui.signal;
  } else if (ui.mode === "scope") {
    Object.entries(scope.shapes).forEach(([k, s]) => sel.add(new Option(s.label, k)));
    sel.add(new Option(scope.clip ? `AUDIO · ${scope.clip.name}` : "AUDIO FILE", "audio"));
    sel.value = ui.shape;
  }
};

const setSignal = (key) => {
  ui.signal = key;
  const s = signals[key];
  term.setCell(s.cell);
  const [lo, hi] = hzRange();
  ui.hz = clamp(s.hz, lo, hi);
  crt?.configure(...term.size());
  syncRanges();
  refreshDecay();
  updateModel();
};

const setShape = (key) => {
  if (key === "audio" && !scope.clip) {
    $("audiofile").click();
    fillSignal();
    return;
  }
  ui.shape = key;
  if (key === "audio") scope.play(audioContext());
  else scope.stop();
  refreshDecay();
};

const loadAudio = async (file) => {
  if (!file) return;
  if (ui.mode !== "scope") setMode("scope");
  $("audioname").textContent = "DECODING...";
  try {
    await scope.load(file, audioContext());
    ui.shape = "audio";
    $("audioname").textContent = file.name;
    fillSignal();
    refreshDecay();
  } catch {
    $("audioname").textContent = "CAN'T DECODE THAT";
  }
};

const fit = () => {
  if (!crt) return;
  const r = $("tube").getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = r.width * dpr;
  const h = r.height * dpr;
  const s = Math.min(1, 2048 / Math.max(w, h));
  crt.resize(Math.max(2, Math.round(w * s)), Math.max(2, Math.round(h * s)));
};

const setMode = (mode) => {
  if (!Object.hasOwn(modes, mode)) return;
  if (mode !== "scope") scope.stop();
  ui.mode = mode;
  if (mode === "radar" && !radar) radar = createRadar();
  if (mode === "scope" && ui.shape === "audio" && scope.clip) scope.play(audioContext());
  crt?.configure(...(mode === "term" ? term.size() : modes[mode].size));
  term.touch();
  $("bezel").style.setProperty("--aspect", modes[mode].aspect);
  $("bezel").classList.toggle("typing", mode === "term");
  document.querySelectorAll("[data-for]").forEach((el) => {
    el.hidden = !el.dataset.for.split(" ").includes(mode);
  });
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  });
  fillSignal();
  applyPhosphor();
  history.replaceState(null, "", `#${mode}`);
  fit();
};

const ranges = [];
const syncRanges = () => ranges.forEach((sync) => sync());

const bindRange = (id, { key, range, log = false, show, after }) => {
  const el = $(id);
  const out = $(`${id}out`);
  el.min = 0;
  el.max = 1000;
  el.step = 1;
  const toValue = (pos) => {
    const [lo, hi] = range();
    return log ? lo * (hi / lo) ** (pos / 1000) : lo + ((hi - lo) * pos) / 1000;
  };
  const toPos = (v) => {
    const [lo, hi] = range();
    return log ? (1000 * Math.log(v / lo)) / Math.log(hi / lo) : (1000 * (v - lo)) / (hi - lo);
  };
  const sync = () => {
    el.value = Math.round(toPos(ui[key]));
    out.textContent = show(ui[key]);
  };
  el.addEventListener("input", () => {
    ui[key] = toValue(Number(el.value));
    out.textContent = show(ui[key]);
    after?.();
  });
  ranges.push(sync);
};

const hzText = (v) => `${v < 10 ? v.toFixed(2) : v.toFixed(1)} Hz`;
const pctText = (max) => (v) => `${Math.round((v / max) * 100)}%`;

bindRange("hz", { key: "hz", range: hzRange, log: true, show: hzText, after: refreshDecay });
bindRange("rpm", { key: "rpm", range: () => [3, 120], log: true, show: (v) => `${Math.round(v)} rpm`, after: refreshDecay });
bindRange("freq", { key: "freq", range: () => [0.2, 500], log: true, show: hzText, after: refreshDecay });
bindRange("beam", { key: "beam", range: () => [0.1, 3], log: true, show: (v) => v.toFixed(2) });
bindRange("focus", { key: "focus", range: () => [0.5, 3], show: (v) => v.toFixed(2) });
bindRange("curve", { key: "curve", range: () => [0, 0.15], show: pctText(0.15) });
bindRange("glow", { key: "glow", range: () => [0, 1.6], show: pctText(1.6) });

const power = { state: "off", t: 0 };

const setPower = (on) => {
  power.state = on ? "on" : "dying";
  power.t = 0;
  $("power").setAttribute("aria-pressed", String(on));
  if (on) term.boot();
};

const powerStep = (dt) => {
  power.t += dt;
  const t = power.t;
  if (power.state === "on") {
    const sag = reduceMotion ? 0 : 1 - smooth(0.4, 4.5, t);
    const level = reduceMotion ? 1 : smooth(0.6, 3.4, t);
    return {
      beam: level * ui.beam,
      deflect: [1 + 0.03 * sag, 1 + 0.045 * sag],
      focus: 1 + 1.2 * sag,
      warm: level < 1
    };
  }
  if (power.state === "dying") {
    if (reduceMotion || t > 1.6) {
      power.state = "off";
    } else {
      return {
        beam: ui.beam * 1.3 * (t < 0.28 ? 1 : Math.exp(-(t - 0.28) * 5)),
        deflect: [1 - 0.996 * smooth(0.09, 0.28, t), 1 - 0.996 * smooth(0, 0.11, t)],
        focus: 1,
        warm: false
      };
    }
  }
  return { beam: 0, deflect: [1, 1], focus: 1, warm: false };
};

let whine = null;
let whineKey = "";

const updateWhine = () => {
  if (!actx) return;
  const f = lineRate();
  const want = ui.whine && power.state === "on" && ui.mode === "term" && f < 20000;
  const key = `${want}|${Math.round(f)}`;
  if (key === whineKey) return;
  whineKey = key;
  if (!whine) {
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(actx.destination);
    osc.start();
    whine = { osc, gain };
  }
  const now = actx.currentTime;
  whine.osc.frequency.setTargetAtTime(Math.min(f, 20000), now, 0.02);
  whine.gain.gain.setTargetAtTime(want ? 0.012 : 0, now, 0.04);
};

let last = performance.now();
let fps = 60;
let phase = 0;
let readoutAt = 0;

const frame = (now) => {
  if (!crt) return;
  const dt = clamp((now - last) / 1000, 0.0005, 0.1);
  last = now;
  fps += (1 / dt - fps) * 0.05;
  const pw = powerStep(dt);
  let hz = 60;
  let avg = 0;
  let segments = 0;
  let total = 1;

  if (ui.mode === "term") {
    hz = ui.interlace ? ui.hz / 2 : ui.hz;
    total = signals[ui.signal].total / term.size()[1];
    term.update(dt, ui.hz);
    if (term.dirty) crt.uploadSource(term.draw());
    avg = Math.max(smooth(0.25, 0.6, hz / fps), smooth(30, 45, hz));
  } else if (ui.mode === "radar") {
    hz = ui.rpm / 60;
    radar.update(dt);
    crt.uploadSource(radar.draw());
  } else {
    segments = scope.fill(dt, ui.freq, ui.shape);
    if (segments) crt.uploadSamples(scope.data, segments);
  }

  const dp = dt * hz;
  const p0 = phase;
  phase = (phase + dp) % 1;
  const focus = ui.focus * pw.focus;

  crt.render({
    mode: modes[ui.mode].glsl,
    dt,
    hz,
    p0,
    dp,
    avg,
    beam: pw.beam,
    norm: 1 / (dt * hz),
    interlace: ui.interlace,
    total,
    deflect: pw.deflect,
    seed: Math.random() * 1000,
    clutter: ui.mode === "radar" ? 1 : 0,
    segments,
    step: dt / Math.max(segments, 1),
    energy: (6e5 * pw.beam * dt) / Math.max(segments, 1),
    sigma: 1.3 * focus,
    blur: { term: 0.6, radar: 0.9, scope: 0.45 }[ui.mode] * focus,
    lineSigma: 0.3 * focus,
    spread: 0.6,
    curve: ui.curve,
    overscan: ui.mode === "term" ? 1.07 : 1,
    glow: ui.glow,
    exposure: 1.5,
    glass,
    grat: ui.mode === "scope" ? [0.05, 0.036, 0.022] : [0, 0, 0]
  });

  const led = power.state === "on" ? (pw.warm ? "led warm" : "led on") : "led";
  if ($("led").className !== led) $("led").className = led;
  updateWhine();

  if (now > readoutAt) {
    readoutAt = now + 400;
    let text = ui.shape === "audio" ? "XY audio" : `${hzText(ui.freq)} trace`;
    if (ui.mode === "term") text = `H ${(lineRate() / 1000).toFixed(2)} kHz · V ${hzText(ui.hz)}`;
    else if (ui.mode === "radar") text = `${(60 / ui.rpm).toFixed(1)} s per sweep`;
    $("readout").textContent = `${text} · ${Math.round(fps)} fps`;
  }

  requestAnimationFrame(frame);
};

Object.entries(phosphors).forEach(([name, p]) => {
  $("phosphor").add(new Option(`${name} · ${p.tag}`, name));
});

$("phosphor").addEventListener("change", (e) => {
  ui.phosphors[ui.mode] = e.target.value;
  applyPhosphor();
});

$("signal").addEventListener("change", (e) => {
  if (ui.mode === "term") setSignal(e.target.value);
  else setShape(e.target.value);
});

$("audiofile").addEventListener("change", (e) => {
  loadAudio(e.target.files[0]);
  e.target.value = "";
});

document.querySelectorAll("[data-mode]").forEach((b) => {
  b.addEventListener("click", () => setMode(b.dataset.mode));
});

$("power").addEventListener("click", () => setPower(power.state !== "on"));

$("whine").addEventListener("change", (e) => {
  ui.whine = e.target.checked;
  if (ui.whine) audioContext();
  whineKey = "";
});

$("unlock").addEventListener("change", (e) => {
  ui.unlock = e.target.checked;
  $("interlace").disabled = !ui.unlock;
  if (!ui.unlock) {
    ui.interlace = false;
    $("interlace").checked = false;
  }
  const [lo, hi] = hzRange();
  ui.hz = clamp(ui.hz, lo, hi);
  syncRanges();
  refreshDecay();
  updateModel();
});

$("interlace").addEventListener("change", (e) => {
  ui.interlace = e.target.checked;
  refreshDecay();
  updateModel();
});

if (reduceMotion) {
  $("unlock").disabled = true;
  $("unlockwarn").textContent = "reduced motion is on so these stay off";
}

const keys = $("keys");
const bezel = $("bezel");

bezel.addEventListener("click", () => {
  if (ui.mode === "term") keys.focus({ preventScroll: true });
});

keys.addEventListener("input", () => {
  for (const ch of keys.value) term.key(ch);
  keys.value = "";
});

keys.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  if (e.key === "Enter" || e.key === "Backspace") {
    e.preventDefault();
    term.key(e.key);
  } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
    e.preventDefault();
    term.key("^C");
  }
});

bezel.addEventListener("dragover", (e) => e.preventDefault());
bezel.addEventListener("drop", (e) => {
  e.preventDefault();
  loadAudio(e.dataTransfer.files[0]);
});

document.addEventListener("pointerdown", () => {
  if (actx?.state === "suspended") actx.resume();
});

window.addEventListener("hashchange", () => setMode(location.hash.slice(1)));
new ResizeObserver(fit).observe($("tube"));
new ResizeObserver(drawDecay).observe($("decay"));
document.fonts?.load("14px VT323", "İSP-LINK").then(() => {
  term.touch();
  drawDecay();
}).catch(() => {});

const start = location.hash.slice(1);
setMode(Object.hasOwn(modes, start) ? start : "term");
syncRanges();
setPower(true);
if (crt) requestAnimationFrame(frame);
