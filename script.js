const username = "ispikk";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const typeIt = (el, txt) => new Promise((resolve) => {
  let i = 0;
  el.textContent = "";
  const iv = setInterval(() => {
    el.textContent = txt.slice(0, ++i);
    if (i >= txt.length) {
      clearInterval(iv);
      resolve();
    }
  }, 40);
});

const timeAgo = (d) => {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  const units = [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"]];
  for (const [secs, label] of units) {
    if (diff > secs) return `${Math.floor(diff / secs)}${label}`;
  }
  return "now";
};

const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const contentEl = document.querySelector(".content");
const screenEl = document.querySelector(".screen");
const GLITCH_COLOR = "#a8e6ff";
const GLITCH_SHADOW = "0 0 6px #a8e6ff, 0 0 18px rgba(168,230,255,0.6)";
let isFlickering = false;

const PHOSPHOR_WHITE = [232, 242, 255];
const PHOSPHOR_PURPLE = [216, 180, 255];
const DRIFT_CYCLE_MS = 6 * 60 * 1000;

const lerp = (a, b, t) => a + (b - a) * t;
const hex2 = (n) => n.toString(16).padStart(2, "0");
const glow = (p) => `0 0 4px ${p.hex}, 0 0 10px ${p.dim}`;

const currentPhosphor = () => {
  const t = (Date.now() % DRIFT_CYCLE_MS) / DRIFT_CYCLE_MS;
  const factor = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  const rgb = PHOSPHOR_WHITE.map((white, i) => Math.round(lerp(white, PHOSPHOR_PURPLE[i], factor)));
  return { hex: `#${rgb.map(hex2).join("")}`, dim: `rgba(${rgb.join(",")},0.4)` };
};

const setGlow = (opacity, color, shadow) => {
  contentEl.style.opacity = opacity;
  contentEl.style.color = color;
  contentEl.style.textShadow = shadow;
};

const applyPhosphor = () => {
  const p = currentPhosphor();
  screenEl.style.setProperty("--phosphor", p.hex);
  screenEl.style.setProperty("--phosphor-dim", p.dim);
  if (!isFlickering) setGlow(1, p.hex, glow(p));
  return p;
};

setInterval(applyPhosphor, 1000);

const settle = () => {
  isFlickering = false;
  applyPhosphor();
};

const flickerOnce = () => {
  isFlickering = true;
  setGlow(0.75 + Math.random() * 0.2, GLITCH_COLOR, GLITCH_SHADOW);
  setTimeout(settle, 50 + Math.random() * 90);
};

const scheduleFlicker = () => {
  if (reduceMotion) return;
  setTimeout(() => {
    flickerOnce();
    if (Math.random() < 0.35) setTimeout(flickerOnce, 120 + Math.random() * 180);
    scheduleFlicker();
  }, 2500 + Math.random() * 7000);
};

const bootFlicker = () => new Promise((resolve) => {
  const p = applyPhosphor();
  if (reduceMotion) return resolve();
  isFlickering = true;
  let ticks = 0;
  const maxTicks = 8 + Math.floor(Math.random() * 4);
  setGlow(0, p.hex, glow(p));
  const iv = setInterval(() => {
    ticks++;
    if (ticks >= maxTicks) {
      clearInterval(iv);
      settle();
      resolve();
      return;
    }
    setGlow(Math.random() < 0.6 ? 0.15 + Math.random() * 0.5 : 1, p.hex, glow(p));
  }, 60 + Math.random() * 50);
});

const showUser = async () => {
  try {
    const data = await (await fetch(`https://api.github.com/users/${username}`)).json();
    $("uname").textContent = data.name || username;
    $("bio").textContent = data.bio || "software developer";
    let stats = "";
    if (data.public_repos != null) stats += `${data.public_repos} repos  `;
    if (data.followers != null) stats += `${data.followers} followers`;
    $("stats").textContent = stats;
  } catch (e) {
    console.log("whoami fetch failed", e);
    $("uname").textContent = username;
    $("bio").textContent = "software developer";
  }
  $("whoblock").style.display = "block";
};

const langBreakdown = (r) => {
  const bytes = r.langBytes || {};
  const names = Object.keys(bytes);
  if (!names.length) return r.language || "??";
  const total = names.reduce((sum, n) => sum + bytes[n], 0);
  return names
    .sort((a, b) => bytes[b] - bytes[a])
    .map((n) => `${n} ${Math.round((bytes[n] / total) * 100)}%`)
    .join(", ");
};

const renderRepos = (repos) => {
  $("repostatus").style.display = "none";
  $("repolist").innerHTML = repos.map((r) =>
    `<a class="repo" href="${r.html_url}" target="_blank" rel="noopener">`
    + `<span class="rname">&gt; ${r.name}${r.fork ? " [FORK]" : ""}</span>`
    + `<span class="rlang">${langBreakdown(r)}</span>`
    + `<span class="rstars">*${r.stargazers_count}</span>`
    + `<span class="rdesc">${r.description || "-- no description --"} (${timeAgo(r.pushed_at)})</span>`
    + `</a>`
  ).join("");
};

const loadRepos = async () => {
  try {
    const res = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=pushed`);
    if (!res.ok) throw new Error("bad response, probably rate limited (60 req/hr unauthenticated)");
    const repos = (await res.json())
      .filter((r) => !r.private)
      .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at));
    await Promise.all(repos.map(async (r) => {
      try {
        r.langBytes = await (await fetch(r.languages_url)).json();
      } catch {
        r.langBytes = {};
      }
    }));
    renderRepos(repos);
  } catch (e) {
    $("repostatus").textContent = `# ${e.message}`;
  }
};

const linksHtml = `<a href="https://github.com/${username}" target="_blank" rel="noopener">github.com/${username}</a>`
  + `<br><br>Contact me via:`
  + `<div class="badges">`
  + `<a class="badge" href="https://discord.com/users/707217660831727686" target="_blank" rel="noopener">`
  + `<img src="assets/discord.svg" alt="Discord"><span class="tip">Discord: kimmie.3</span></a>`
  + `<a class="badge" href="https://signal.me/#eu/_Eq_Tzc-Vrp4Ek5w1fvLGMdQpk7XoKcaYjmlOwjulDy1FuVCUX5FWa61mUasB2P4" target="_blank" rel="noopener">`
  + `<img src="assets/signal.svg" alt="Signal"><span class="tip">Signal</span></a>`
  + `</div>`;

const show = (id) => { $(id).style.display = "block"; };

const typeCommand = async (n, txt) => {
  await typeIt($(`cmd${n}`), txt);
  $(`cursor${n}`).style.display = "none";
};

const boot = async () => {
  await typeCommand(1, "whomeowi");
  await showUser();

  await sleep(400);
  show("repostep");
  await typeCommand(2, "ls repos/ --sort=stars");
  await loadRepos();

  await sleep(400);
  show("linkstep");
  await typeCommand(3, "links.txt");
  $("linkout").innerHTML = linksHtml;

  await sleep(400);
  show("bio2step");
  await typeCommand(4, "bio.txt");

  await sleep(400);
  show("intereststep");
  await typeCommand(5, "interests.txt");

  await sleep(300);
  show("endline");
  $("cmdinput").focus({ preventScroll: true });
};

const builtins = {
  help: () => "AVAILABLE COMMANDS: HELP, CLEAR",
  clear: () => { $("shell").innerHTML = ""; }
};

let busy = false;

const typeOut = (el, html) => new Promise((resolve) => {
  el.innerHTML = html;
  if (reduceMotion) return resolve();
  const nodes = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const full = nodes.map((n) => {
    const t = n.nodeValue;
    n.nodeValue = "";
    return t;
  });
  let ni = 0;
  let ci = 0;
  const iv = setInterval(() => {
    while (ni < nodes.length && ci >= full[ni].length) {
      ni++;
      ci = 0;
    }
    if (ni >= nodes.length) {
      clearInterval(iv);
      resolve();
      return;
    }
    nodes[ni].nodeValue = full[ni].slice(0, ++ci);
    $("endline").scrollIntoView({ block: "nearest" });
  }, 20);
});

const lookup = (table, key) => {
  const name = Object.keys(table).find((n) => n.toLowerCase() === key);
  return name === undefined ? undefined : table[name];
};

const runCommand = async (line) => {
  const echo = document.createElement("div");
  echo.className = "prompt";
  const echoText = document.createElement("span");
  echoText.className = "typed";
  echoText.textContent = line;
  echo.append(">", echoText);
  $("shell").append(echo);

  const key = line.trim().toLowerCase();
  if (!key) return;

  const builtin = lookup(builtins, key);
  const egg = lookup(window.commands ?? {}, key);
  let out;
  if (builtin) out = builtin();
  else if (egg !== undefined) out = typeof egg === "function" ? egg(line) : egg;
  else out = window.unknownCommand?.(line) || "ERROR: COMMAND NOT RECOGNIZED";
  if (!out) return;

  const res = document.createElement("div");
  res.className = "linkout";
  $("shell").append(res);
  busy = true;
  $("endline").classList.add("busy");
  await typeOut(res, out);
  busy = false;
  $("endline").classList.remove("busy");
  $("endline").scrollIntoView({ block: "nearest" });
};

const input = $("cmdinput");

input.addEventListener("input", () => {
  $("typed").textContent = input.value;
});

input.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.isComposing || busy) return;
  runCommand(input.value);
  input.value = "";
  $("typed").textContent = "";
  $("endline").scrollIntoView({ block: "nearest" });
});

screenEl.addEventListener("click", () => {
  if (window.getSelection().toString()) return;
  input.focus({ preventScroll: true });
});

bootFlicker().then(scheduleFlicker);
boot();
