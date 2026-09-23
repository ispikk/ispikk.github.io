var commands = {
  "meow": "meow :3",

  "/gamemode creative": "Set own game mode to Creative Mode",
  "/time set day": "Set the time to 1000",
  "/give @s diamond": "Gave 1 [Diamond] to Visitor",
  "/kill": "Killed Visitor",
  "herobrine": "Removed Herobrine",
  "creeper": () => {
    shakeScreen();
    return "Visitor was blown up by Creeper";
  },
  "splash": () => `<span class="mc-splash">${pick(splashes)}</span>`,

  "are you there": "ARE WE CONNECTED?",
  "vessel": "NO ONE CAN CHOOSE WHO THEY ARE IN THIS WORLD.",
  "save": "* The power of fluffy boys shines within you.",
  "spamton": spamton,
  "big shot": spamton,
  "jevil": `<span class="jevil">CHAOS, CHAOS! I CAN DO ANYTHING!</span>`,
  "gaster": gaster,
  "deltarune": "DELTARUNE TOMORROW",

  "oneshot": "You only have one shot.",
  "niko": () => {
    if (document.querySelector(".sun-dark")) return "...";
    sunGlow();
    return "[Niko is holding the sun]";
  },
  "world machine": () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "somewhere";
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    return `I can see you.<br>You're in ${tz}, aren't you.<br>It's ${time} there.`;
  },
  "break sun": () => {
    breakSun();
    return "";
  },

  "celeste": "This is it, Madeline. Just breathe. Why are you so nervous?",
  "breathe": `Imagine a feather. Breathe slowly, keep it floating.`
    + `<span class="breathe"><span class="feather">🪶</span>`
    + `<span class="breathe-in">breathe in</span><span class="breathe-out">breathe out</span></span>`,
  "granny": "Hahahaha",
  "strawberry": () => `<span class="egg-red">+1 strawberry</span><br>strawberries: ${++celeste.berries}`,
  "golden strawberry": () => {
    if (celeste.golden) return "You're already carrying it. Don't die.";
    celeste.golden = true;
    return `<span class="egg-gold">You picked up the golden strawberry.</span><br>Don't die.`;
  },
  "summit": () => {
    if (!celeste.golden) return "Chapter 7: The Summit";
    celeste.golden = false;
    return `<span class="egg-gold">+1 golden strawberry</span>`;
  },
  "die": () => {
    celeste.deaths++;
    if (!reduceMotion) flickerOnce();
    let out = `☠ ${celeste.deaths}`;
    if (celeste.golden) {
      celeste.golden = false;
      out = `<span class="egg-gold">The golden strawberry flew away.</span><br>` + out;
    }
    if (celeste.deaths === 1) {
      out += "<br>Be proud of your death count! The more you die, the more you're learning. Keep going!";
    }
    return out;
  }
};

const splashes = ["Also try Terraria!", "Made by Notch!", "100% pure!", "Pixels!"];

const wingdings = {
  A: "✌", B: "👌", C: "👍", D: "👎", E: "☜", F: "☞", G: "☝", H: "☟", I: "✋",
  J: "☺", K: "😐", L: "☹", M: "💣", N: "☠", O: "⚐", P: "🏱", Q: "✈", R: "☼",
  S: "💧", T: "❄", U: "🕆", V: "✞", W: "🕈", X: "✠", Y: "✡", Z: "☪"
};

const celeste = { deaths: 0, berries: 0, golden: false };

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shakeScreen() {
  const m = document.querySelector(".monitor");
  m.classList.remove("shake");
  void m.offsetWidth;
  m.classList.add("shake");
}

function sunGlow() {
  const s = document.querySelector(".screen");
  s.classList.add("sunlit");
  setTimeout(() => s.classList.remove("sunlit"), 5000);
}

function breakSun() {
  if (document.querySelector(".sun-dark")) return;
  const dark = document.createElement("div");
  dark.className = "sun-dark";
  dark.innerHTML = "<span>you only had one shot.</span>";
  document.querySelector(".screen").appendChild(dark);
}

function spamton() {
  return `HEY&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;EVERY&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;! `
    + `NOW'S YOUR CHANCE TO BE A <span class="bigshot">[[BIG SHOT]]</span>!!`;
}

function gaster() {
  if (!reduceMotion) {
    for (let i = 0; i < 5; i++) setTimeout(flickerOnce, i * 90);
  }
  const id = "gaster" + Date.now();
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.classList.add("gone");
  }, 3000);
  const text = [..."DARK DARKER YET DARKER"]
    .map((c) => (c === " " ? "&nbsp;&nbsp;" : wingdings[c] + "︎"))
    .join("");
  return `<span class="gaster" id="${id}">${text}</span>`;
}

function unknownCommand(line) {
  const cmd = line.trim();
  if (!cmd.startsWith("/")) return;
  return `<span class="egg-red">Unknown or incomplete command, see below for error</span><br>`
    + `${escapeHtml(cmd.slice(1))}<span class="egg-red"><i>&lt;--[HERE]</i></span>`;
}
