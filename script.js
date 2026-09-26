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
let isFlickering = false;

const themes = {
  default: { from: [232, 242, 255], to: [216, 180, 255], glitch: [168, 230, 255] },
  green: { from: [27, 255, 128], to: [80, 255, 180], glitch: [200, 255, 220] },
  amber: { from: [255, 176, 0], to: [255, 140, 40], glitch: [255, 225, 160] },
  white: { from: [232, 242, 255], to: [232, 242, 255], glitch: [168, 230, 255] }
};

let theme = "default";
try {
  const saved = localStorage.getItem("phosphor");
  if (saved && Object.hasOwn(themes, saved)) theme = saved;
} catch {}

const DRIFT_CYCLE_MS = 6 * 60 * 1000;

const lerp = (a, b, t) => a + (b - a) * t;
const hex2 = (n) => n.toString(16).padStart(2, "0");
const glow = (p) => `0 0 4px ${p.hex}, 0 0 10px ${p.dim}`;

const currentPhosphor = () => {
  const t = (Date.now() % DRIFT_CYCLE_MS) / DRIFT_CYCLE_MS;
  const factor = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  const { from, to } = themes[theme];
  const rgb = from.map((c, i) => Math.round(lerp(c, to[i], factor)));
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
  const g = themes[theme].glitch;
  setGlow(0.75 + Math.random() * 0.2, `rgb(${g})`, `0 0 6px rgb(${g}), 0 0 18px rgba(${g},0.6)`);
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

let profile = null;
let repoHtml = "";

const showUser = async () => {
  try {
    const data = profile ?? await (await fetch(`https://api.github.com/users/${username}`)).json();
    profile = data;
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
  repoHtml = repos.map((r) =>
    `<a class="repo" href="${r.html_url}" target="_blank" rel="noopener">`
    + `<span class="rname">&gt; ${r.name}${r.fork ? " [FORK]" : ""}</span>`
    + `<span class="rlang">${langBreakdown(r)}</span>`
    + `<span class="rstars">*${r.stargazers_count}</span>`
    + `<span class="rdesc">${r.description || "-- no description --"} (${timeAgo(r.pushed_at)})</span>`
    + `</a>`
  ).join("");
  $("repolist").innerHTML = repoHtml;
};

let repoList = [];

const loadRepos = async () => {
  if (repoHtml) {
    $("repostatus").style.display = "none";
    $("repolist").innerHTML = repoHtml;
    return;
  }
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
    repoList = repos;
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

const esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
};

const cmdHistory = [];
let historyIndex = 0;
let poweredOff = false;

const files = {
  "links.txt": () => linksHtml,
  "bio.txt": () => $("bio2out").innerHTML,
  "interests.txt": () => document.querySelector("#intereststep .linkout").innerHTML
};

const isRepos = (name) => name === "repos" || name === "repos/";

const clockAt = (timeZone) =>
  new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });

const pageUptime = () => {
  const secs = Math.floor(performance.now() / 1000);
  const mins = Math.floor(secs / 60);
  return secs < 60 ? `${secs} secs` : `${mins} min${mins === 1 ? "" : "s"}`;
};

const fetchLogo = [
  "          へ  ♡",
  "    ૮  >  <)",
  "     /  ⁻  ៸|",
  "乀(ˍ, ل ل"
];

const manual = {
  help: ["help", "list commands"],
  ls: ["ls [repos/]", "list files, or kimmie's repos"],
  cat: ["cat &lt;file&gt;", "print a file"],
  whomeowi: ["whomeowi", "who is this"],
  open: ["open &lt;repo&gt;", "open one of kimmie's repos on github"],
  contact: ["contact", "how to reach kimmie"],
  neofetch: ["neofetch", "system info"],
  time: ["time", "your time and kimmie's"],
  date: ["date", "today's date"],
  uptime: ["uptime", "how long this terminal has been on"],
  echo: ["echo &lt;text&gt;", "print text back"],
  color: ["color &lt;name&gt;", `phosphor color: ${Object.keys(themes).join(", ")}`],
  history: ["history", "past commands, or use up/down"],
  man: ["man &lt;command&gt;", "explain a command"],
  reboot: ["reboot", "restart the terminal"],
  logout: ["logout", "log off"],
  clear: ["clear", "clear the screen"]
};

const printLine = (html) => {
  const line = document.createElement("div");
  line.className = "linkout";
  line.innerHTML = html;
  $("shell").append(line);
};

const resetBoot = () => {
  $("shell").innerHTML = "";
  ["whoblock", "repostep", "linkstep", "bio2step", "intereststep", "endline"].forEach((id) => {
    $(id).style.display = "";
  });
  for (let n = 1; n <= 5; n++) {
    $(`cmd${n}`).textContent = "";
    $(`cursor${n}`).style.display = "";
  }
  $("repostatus").style.display = "";
  $("repostatus").textContent = "fetching repo list...";
  $("repolist").innerHTML = "";
  $("linkout").innerHTML = "";
};

const powerOff = () => {
  contentEl.style.transformOrigin = `50% ${innerHeight / 2 - contentEl.getBoundingClientRect().top}px`;
  screenEl.classList.add("off");
  poweredOff = true;
};

const powerOn = () => {
  poweredOff = false;
  screenEl.classList.remove("off");
  bootFlicker();
  $("cmdinput").focus({ preventScroll: true });
};

const builtins = {
  help: () => [
    "AVAILABLE COMMANDS:",
    ...Object.values(manual).map(([usage, desc]) => `${usage} - ${desc}`),
    "TAB AUTOCOMPLETES"
  ].join("<br>"),

  clear: () => { $("shell").innerHTML = ""; },

  whomeowi: () => $("whoblock").innerHTML,

  open: ([name]) => {
    if (!repoList.length) return "# COULDN'T LOAD REPOS, GITHUB IS PROBABLY RATE LIMITING";
    const names = `REPOS: ${repoList.map((r) => r.name).join(", ")}`;
    if (!name) return `usage: open &lt;repo&gt;<br>${names}`;
    const repo = repoList.find((r) => r.name.toLowerCase() === name);
    if (!repo) return `open: no repo called '${esc(name)}'<br>${names}`;
    window.open(repo.html_url, "_blank", "noopener");
    return `OPENING ${repo.name}...`;
  },

  contact: () => [
    `DISCORD: <a href="https://discord.com/users/707217660831727686" target="_blank" rel="noopener">kimmie.3</a>`,
    `SIGNAL: <a href="https://signal.me/#eu/_Eq_Tzc-Vrp4Ek5w1fvLGMdQpk7XoKcaYjmlOwjulDy1FuVCUX5FWa61mUasB2P4" target="_blank" rel="noopener">message me</a>`,
    `GITHUB: <a href="https://github.com/${username}" target="_blank" rel="noopener">github.com/${username}</a>`
  ].join("<br>"),

  date: () => new Date().toString().replace(/\s*\(.*\)$/, ""),

  uptime: () =>
    `${new Date().toLocaleTimeString("en-GB", { hourCycle: "h23" })} up ${pageUptime()}, 1 user, load average: 0.00, 0.01, 0.05`,

  echo: (_, line) => esc(line.trim().replace(/^\S+\s*/, "")),

  man: ([name]) => {
    if (!name) return "What manual page do you want?";
    if (!Object.hasOwn(manual, name)) return `No manual entry for ${esc(name)}`;
    const [usage, desc] = manual[name];
    const pad = "&nbsp;".repeat(4);
    return `NAME<br>${pad}${name} - ${desc}<br>SYNOPSIS<br>${pad}${usage}`;
  },

  reboot: () => {
    resetBoot();
    window.scrollTo(0, 0);
    bootFlicker();
    boot();
  },

  logout: () => {
    setTimeout(powerOff, 700);
    return "LOGGING OFF...";
  },

  ls: (args) => {
    const target = args.find((a) => !a.startsWith("-"));
    if (!target) return [...Object.keys(files), "repos/"].join("&nbsp;&nbsp;&nbsp;");
    if (isRepos(target)) return repoHtml || "# COULDN'T LOAD REPOS, GITHUB IS PROBABLY RATE LIMITING";
    if (Object.hasOwn(files, target)) return target;
    return `ls: cannot access '${esc(target)}': No such file or directory`;
  },

  cat: (args) => {
    if (!args.length) return "usage: cat &lt;file&gt;";
    return args.map((f) => {
      if (Object.hasOwn(files, f)) return files[f]();
      if (isRepos(f)) return `cat: ${f}: Is a directory`;
      return `cat: ${esc(f)}: No such file or directory`;
    }).join("<br>");
  },

  neofetch: () => {
    const interests = [...document.querySelectorAll("#intereststep img")].map((img) => img.alt).join(", ");
    const info = [
      `${username}@isp-link`,
      "-".repeat(username.length + 9),
      "OS: İSP-LINK OS v2.3",
      "Host: ispikk.github.io",
      `Uptime: ${pageUptime()}`,
      `Resolution: ${screen.width}x${screen.height}`,
      `Theme: ${theme}`,
      `Repos: ${profile?.public_repos ?? "??"}`,
      `Followers: ${profile?.followers ?? "??"}`,
      `Interests: ${interests}`
    ];
    return `<div class="fetch"><div class="fetch-logo">${fetchLogo.map(esc).join("\n")}</div>`
      + `<div class="fetch-info">${info.join("\n")}</div></div>`;
  },

  time: () => {
    const theirs = clockAt("Etc/GMT-3");
    const asleep = Number(theirs.slice(0, 2)) < 8 ? " - PROBABLY ASLEEP" : "";
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "?";
    return `YOUR TIME: ${clockAt()} (${esc(zone)})<br>KIMMIE'S TIME: ${theirs} (UTC+3)${asleep}`;
  },

  color: ([name]) => {
    const options = `OPTIONS: ${Object.keys(themes).join(", ")}`;
    if (!name) return `CURRENT: ${theme}<br>${options}`;
    if (!Object.hasOwn(themes, name)) return `color: unknown color '${esc(name)}'<br>${options}`;
    theme = name;
    try {
      localStorage.setItem("phosphor", name);
    } catch {}
    applyPhosphor();
    return `PHOSPHOR SET TO ${name}`;
  },

  history: () => cmdHistory.map((c, i) => `${i + 1}&nbsp;&nbsp;${esc(c)}`).join("<br>")
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
  const total = full.reduce((sum, t) => sum + t.length, 0);
  const perTick = Math.max(1, Math.ceil(total / 150));
  let shown = 0;
  const iv = setInterval(() => {
    shown += perTick;
    let left = shown;
    nodes.forEach((n, i) => {
      n.nodeValue = full[i].slice(0, Math.max(0, left));
      left -= full[i].length;
    });
    $("endline").scrollIntoView({ block: "nearest" });
    if (shown >= total) {
      clearInterval(iv);
      resolve();
    }
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
  cmdHistory.push(line.trim());

  const [name, ...args] = key.split(/\s+/);
  const egg = lookup(window.commands ?? {}, key);
  const builtin = lookup(builtins, name);
  let out;
  if (egg !== undefined) out = typeof egg === "function" ? egg(line) : egg;
  else if (builtin) out = builtin(args, line);
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

const commonPrefix = (words) => words.reduce((a, b) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(0, i);
});

const complete = () => {
  const words = input.value.split(" ");
  const last = words.pop().toLowerCase();
  const argPools = {
    ls: [...Object.keys(files), "repos/"],
    cat: [...Object.keys(files), "repos/"],
    color: Object.keys(themes),
    man: Object.keys(manual),
    open: repoList.map((r) => r.name.toLowerCase())
  };
  const pool = words.length ? argPools[words[0].toLowerCase()] ?? [] : Object.keys(builtins);
  const matches = pool.filter((p) => p.startsWith(last));
  if (!matches.length) return;
  const head = words.length ? `${words.join(" ")} ` : "";
  if (matches.length === 1) {
    input.value = head + matches[0] + (matches[0].endsWith("/") ? "" : " ");
  } else {
    const prefix = commonPrefix(matches);
    if (prefix.length > last.length) input.value = head + prefix;
    else printLine(matches.join("&nbsp;&nbsp;&nbsp;"));
  }
  $("typed").textContent = input.value;
};

input.addEventListener("input", () => {
  $("typed").textContent = input.value;
});

document.addEventListener("keydown", (e) => {
  if (!poweredOff) return;
  e.preventDefault();
  e.stopPropagation();
  powerOn();
}, true);

input.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && input.value) {
    e.preventDefault();
    complete();
    return;
  }
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    if (!cmdHistory.length) return;
    e.preventDefault();
    historyIndex = e.key === "ArrowUp"
      ? Math.max(0, historyIndex - 1)
      : Math.min(cmdHistory.length, historyIndex + 1);
    input.value = cmdHistory[historyIndex] ?? "";
    $("typed").textContent = input.value;
    return;
  }
  if (e.key !== "Enter" || e.isComposing || busy) return;
  runCommand(input.value);
  historyIndex = cmdHistory.length;
  input.value = "";
  $("typed").textContent = "";
  $("endline").scrollIntoView({ block: "nearest" });
});

screenEl.addEventListener("click", () => {
  if (poweredOff) {
    powerOn();
    return;
  }
  if (window.getSelection().toString()) return;
  input.focus({ preventScroll: true });
});

bootFlicker().then(scheduleFlicker);
boot();
