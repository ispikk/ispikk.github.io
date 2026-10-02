const createTerminal = (hooks) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const cols = 80;
  const rows = 25;
  const cellW = 9;
  let cellH = 14;
  let lines = [""];
  let typed = "";
  let queue = "";
  let baud = 9600;
  let credit = 0;
  let blink = 0;
  let cursor = true;
  let ball = null;
  let dirty = true;

  const setCell = (h) => {
    cellH = h;
    canvas.width = cols * cellW;
    canvas.height = rows * cellH;
    dirty = true;
  };

  const put = (ch) => {
    if (ch === "\n") lines.push("");
    else if (ch === "\r") lines[lines.length - 1] = "";
    else if (ch === "\b") lines[lines.length - 1] = lines.at(-1).slice(0, -1);
    else {
      if (lines.at(-1).length >= cols) lines.push("");
      lines[lines.length - 1] += ch;
    }
    if (lines.length > rows) lines = lines.slice(-rows);
    dirty = true;
  };

  const print = (text) => {
    queue += text;
  };

  const kernelLog = () => {
    const { signal, hz, phosphor } = hooks.info();
    const line = Math.round(signal.total * hz);
    return [
      "Linux version 2.3.0-kimm (kimmie@kimm-link)",
      `Command line: ro quiet console=tty0 phosphor=${phosphor.toLowerCase()}`,
      "BIOS-e820: [mem 0x0000000000000000-0x000000000009ffff] usable",
      "DMI: KIMM-LINK PHOSPHOR TEST UNIT, BIOS 2.3 09/26/2026",
      "tsc: Detected 4.772 MHz processor",
      "Memory: 640K available",
      "Console: mono 80x25",
      "printk: console [tty0] enabled",
      `crt0: ${signal.label}, ${hz.toFixed(1)} Hz vertical`,
      `crt0: line rate ${line} Hz (${line < 20000 ? "audible" : "silent"})`,
      `crt0: ${phosphor} phosphor screen`,
      "crt0: degaussing... done",
      "crt0: beam on",
      "serial: ttyS0 at 0x3f8 is a 16550A",
      "random: crng init done",
      "NET: Registered protocol family 1",
      "kimm-link: connected to the Wired",
      "systemd[1]: Startup finished in 0.3s."
    ].map((text, i) => `[${(i * 0.0417 + i * i * 0.0031).toFixed(6).padStart(12)}] ${text}`).join("\n");
  };

  const commands = {
    help: () => [
      "help",
      "clear",
      "dmesg",
      "bounce",
      "phosphor [name]",
      "hz [n]",
      "baud [n]",
      "about"
    ].join("\n"),
    dmesg: kernelLog,
    bounce: () => {
      if (ball) {
        ball = null;
        dirty = true;
        return "bounce off";
      }
      ball = { x: 90, y: 40, vx: 210, vy: 130 };
      return "bounce on";
    },
    phosphor: ([name]) => {
      if (!name) {
        return hooks.names().map((n) => `${n.padEnd(5)}${phosphors[n].tag}`).join("\n");
      }
      return hooks.setPhosphor(name.toUpperCase()) ? `ok ${name.toUpperCase()}` : `no phosphor called ${name}`;
    },
    hz: ([n]) => {
      if (!n) return `${hooks.info().hz.toFixed(1)} Hz`;
      const v = parseFloat(n);
      if (!Number.isFinite(v)) return "hz: not a number";
      return `refresh ${hooks.setHz(v).toFixed(1)} Hz`;
    },
    baud: ([n]) => {
      if (!n) return `${baud} baud`;
      const v = parseInt(n, 10);
      if (!Number.isFinite(v) || v < 50) return "baud: bad number";
      baud = Math.min(v, 1000000);
      return `${baud} baud`;
    },
    about: () => [
      "crts dont store the picture, the beam redraws it every frame",
      "and the phosphor glows then fades. long phosphors (p39) smear,",
      "short ones (p4) flicker. this sims the decay per pixel"
    ].join("\n")
  };

  const run = (line) => {
    const [name = "", ...args] = line.trim().toLowerCase().split(/\s+/);
    if (name === "clear") {
      lines = [""];
      dirty = true;
      print("> ");
      return;
    }
    let out = "";
    if (name) out = Object.hasOwn(commands, name) ? commands[name](args) : `${name}: command not found`;
    print(`\n${out ? `${out}\n` : ""}> `);
  };

  const key = (k) => {
    if (k === "^C") {
      queue = "";
      typed = "";
      print("^C\n> ");
      return;
    }
    if (queue) return;
    if (k === "Enter") {
      const line = typed;
      typed = "";
      run(line);
      return;
    }
    if (k === "Backspace") {
      if (typed) {
        typed = typed.slice(0, -1);
        put("\b");
      }
      return;
    }
    if (k.length === 1 && k >= " " && typed.length < cols - 4) {
      typed += k;
      put(k);
    }
  };

  const boot = () => {
    lines = [""];
    typed = "";
    queue = "";
    let mem = "";
    for (let k = 16; k <= 640; k += 16) mem += `\rMEMORY TEST ${String(k).padStart(4, "0")}K`;
    print(`KIMM-LINK OS v2.3\nPHOSPHOR TEST UNIT\n\n${mem} OK\n\nTYPE HELP\n> `);
  };

  const update = (dt, fieldHz) => {
    credit += (dt * baud) / 10;
    while (queue && credit >= 1) {
      put(queue[0]);
      queue = queue.slice(1);
      credit -= 1;
    }
    if (!queue) credit = 0;
    blink = (blink + dt * fieldHz) % 16;
    const on = blink < 8;
    if (on !== cursor) {
      cursor = on;
      dirty = true;
    }
    if (ball) {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      const maxX = canvas.width - cellW * 2;
      const maxY = canvas.height - cellH;
      if (ball.x < 0 || ball.x > maxX) {
        ball.vx *= -1;
        ball.x = Math.min(Math.max(ball.x, 0), maxX);
      }
      if (ball.y < 0 || ball.y > maxY) {
        ball.vy *= -1;
        ball.y = Math.min(Math.max(ball.y, 0), maxY);
      }
      dirty = true;
    }
  };

  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = `${cellH}px VT323`;
    ctx.textBaseline = "alphabetic";
    const base = Math.round(cellH * 0.78);
    lines.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) ctx.fillText(line[c], c * cellW + 1, r * cellH + base);
    });
    if (cursor) {
      const r = lines.length - 1;
      ctx.fillRect(lines[r].length * cellW, r * cellH + cellH - 2, cellW, 2);
    }
    if (ball) ctx.fillRect(ball.x, ball.y, cellW * 2, cellH);
    dirty = false;
    return canvas;
  };

  setCell(cellH);

  return {
    setCell,
    key,
    boot,
    update,
    draw,
    touch: () => { dirty = true; },
    size: () => [canvas.width, canvas.height],
    get dirty() { return dirty; }
  };
};

const hash2 = (x, y, seed) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

const valueNoise = (seed) => (x, y) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

const createRadar = () => {
  const size = 640;
  const radius = size * 0.49;
  const center = size / 2;
  const landLevel = 0.56;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  const terrain = (seed) => {
    const noise = valueNoise(seed);
    return (x, y) => {
      let e = 0;
      let amp = 0.5;
      let f = 2.2;
      for (let o = 0; o < 5; o++) {
        e += amp * noise(x * f + 11, y * f + 7);
        amp *= 0.5;
        f *= 2.03;
      }
      return e - 0.42 * Math.exp(-(x * x + y * y) * 9);
    };
  };

  const landShare = (elevation) => {
    let land = 0;
    let all = 0;
    for (let y = -1; y <= 1; y += 0.05) {
      for (let x = -1; x <= 1; x += 0.05) {
        if (x * x + y * y > 1) continue;
        all++;
        if (elevation(x, y) > landLevel) land++;
      }
    }
    return land / all;
  };

  let elevation = terrain(1);
  for (let i = 0; i < 12; i++) {
    const candidate = terrain(Math.floor(Math.random() * 1e6));
    const share = landShare(candidate);
    elevation = candidate;
    if (share > 0.1 && share < 0.3) break;
  }

  const land = document.createElement("canvas");
  land.width = land.height = size;
  {
    const speckle = valueNoise(99);
    const rays = 1440;
    const steps = 320;
    const polar = new Float32Array(rays * steps);
    for (let a = 0; a < rays; a++) {
      const ang = (a / rays) * Math.PI * 2;
      const dx = Math.sin(ang);
      const dy = -Math.cos(ang);
      let depth = 0;
      for (let s = 0; s < steps; s++) {
        const r = (s + 0.5) / steps;
        const x = dx * r;
        const y = dy * r;
        if (elevation(x, y) > landLevel) {
          depth += 1 / steps;
          polar[a * steps + s] = (0.12 + 0.88 * Math.exp(-depth * 40)) * (0.35 + 0.65 * speckle(x * 70, y * 70) ** 2);
        } else {
          depth = 0;
        }
      }
    }
    const lctx = land.getContext("2d");
    const img = lctx.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = ((px + 0.5) - center) / radius;
        const y = ((py + 0.5) - center) / radius;
        const r = Math.hypot(x, y);
        if (r >= 1) continue;
        let ang = Math.atan2(x, -y);
        if (ang < 0) ang += Math.PI * 2;
        const v = polar[(Math.floor((ang / (Math.PI * 2)) * rays) % rays) * steps + Math.floor(r * steps)];
        const i = (py * size + px) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 140);
        img.data[i + 3] = 255;
      }
    }
    lctx.putImageData(img, 0, 0);
  }

  const spawn = (fast = false) => {
    for (let tries = 0; tries < 60; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.75;
      const x = Math.sin(ang) * r;
      const y = -Math.cos(ang) * r;
      if (elevation(x, y) > landLevel - 0.04) continue;
      const head = Math.random() * Math.PI * 2;
      const speed = fast ? 0.07 : 0.006 + Math.random() * 0.018;
      return { x, y, vx: Math.sin(head) * speed, vy: -Math.cos(head) * speed, size: 0.5 + Math.random() * 0.9, fast };
    }
    return { x: 0.5, y: 0, vx: 0, vy: 0.01, size: 1, fast };
  };

  const targets = [...Array.from({ length: 8 }, () => spawn()), spawn(true)];

  const update = (dt) => {
    targets.forEach((t, i) => {
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if (Math.hypot(t.x, t.y) > 0.97 || elevation(t.x, t.y) > landLevel - 0.02) targets[i] = spawn(t.fast);
    });
  };

  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(land, 0, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.6;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(center, center, (radius * i) / 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center, center - radius);
    ctx.stroke();
    ctx.strokeStyle = "#fff";
    targets.forEach((t) => {
      const r = Math.hypot(t.x, t.y) * radius;
      const ang = Math.atan2(t.y, t.x);
      const half = 0.016 + 2 / r;
      ctx.lineWidth = 1.5 + 2.5 * t.size;
      ctx.beginPath();
      ctx.arc(center, center, r, ang - half, ang + half);
      ctx.stroke();
    });
    return canvas;
  };

  return { update, draw };
};

const createScope = () => {
  const cap = 8191;
  const data = new Float32Array(8192 * 4);
  const tau = Math.PI * 2;
  let phase = 0;
  let time = 0;
  let clip = null;
  let player = null;

  const shapes = {
    lissajous32: {
      label: "LISSAJOUS 3:2",
      at: (p, t) => [Math.sin(tau * 3 * p + t * 0.6), Math.sin(tau * 2 * p), 1]
    },
    lissajous54: {
      label: "LISSAJOUS 5:4",
      at: (p, t) => [Math.sin(tau * 5 * p + t * 0.4), Math.sin(tau * 4 * p), 1]
    },
    circle: {
      label: "CIRCLE",
      at: (p) => [Math.sin(tau * p) * 0.9, Math.cos(tau * p) * 0.9, 1]
    },
    rose: {
      label: "ROSE 5/2",
      at: (p) => {
        const a = tau * 2 * p;
        const r = Math.cos(2.5 * a);
        return [r * Math.sin(a), r * Math.cos(a), 1];
      }
    },
    sweep: {
      label: "SWEEP Y-T",
      at: (p) => {
        const s = p - Math.floor(p);
        if (s >= 0.9) return [1.4 - (2.8 * (s - 0.9)) / 0.1, 0, 0];
        const u = (s / 0.9) * 6;
        const half = u - Math.floor(u);
        const sign = Math.floor(u) % 2 === 0 ? 1 : -1;
        return [-1.4 + (2.8 * s) / 0.9, sign * (0.5 + 0.3 * Math.exp(-half * 9) * Math.cos(half * 70)), 1];
      }
    }
  };

  const stop = () => {
    if (!player) return;
    player.source.stop();
    player.source.disconnect();
    player = null;
  };

  const play = (ctx) => {
    stop();
    if (!clip) return;
    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    source.connect(gain).connect(ctx.destination);
    source.start();
    player = { ctx, source, start: ctx.currentTime, pos: 0 };
  };

  const load = async (file, ctx) => {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    clip = {
      buffer,
      name: file.name,
      left: buffer.getChannelData(0),
      right: buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0)
    };
    play(ctx);
  };

  const fillAudio = () => {
    if (!player) return 0;
    const now = Math.floor((player.ctx.currentTime - player.start) * clip.buffer.sampleRate);
    let from = player.pos;
    if (now <= from) return 0;
    if (now - from > cap) from = now - cap;
    const len = clip.left.length;
    for (let i = 0; i <= now - from; i++) {
      const j = (from + i) % len;
      data[i * 4] = clip.left[j] * 1.1;
      data[i * 4 + 1] = clip.right[j] * 1.1;
      data[i * 4 + 2] = 1;
    }
    player.pos = now;
    return now - from;
  };

  const fill = (dt, freq, shape) => {
    if (shape === "audio") return fillAudio();
    const at = shapes[shape].at;
    const n = Math.min(cap, Math.max(2, Math.ceil(dt * Math.max(24000, freq * 400))));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const [x, y, z] = at(phase + freq * dt * k, time + dt * k);
      data[i * 4] = x;
      data[i * 4 + 1] = y;
      data[i * 4 + 2] = z;
    }
    phase = (phase + freq * dt) % 1;
    time += dt;
    return n;
  };

  return {
    data,
    shapes,
    fill,
    load,
    play,
    stop,
    get clip() { return clip; }
  };
};
