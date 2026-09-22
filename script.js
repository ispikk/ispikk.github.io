// change this to my own github username
var username = "ispikk";

var userData = null;
var repoData = [];

function $(id) { return document.getElementById(id); }

// types text out letter by letter into an element
function typeIt(el, txt, cb) {
  var i = 0;
  el.innerHTML = "";
  var iv = setInterval(function () {
    el.innerHTML += txt.charAt(i);
    i++;
    if (i >= txt.length) {
      clearInterval(iv);
      if (cb) cb();
    }
  }, 40);
}

function timeAgo(d) {
  var diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff > 31536000) return Math.floor(diff / 31536000) + "y";
  if (diff > 2592000) return Math.floor(diff / 2592000) + "mo";
  if (diff > 604800) return Math.floor(diff / 604800) + "w";
  if (diff > 86400) return Math.floor(diff / 86400) + "d";
  if (diff > 3600) return Math.floor(diff / 3600) + "h";
  return "now";
}

var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var contentEl = document.querySelector(".content");
var NORMAL_SHADOW = "0 0 4px #e8f2ff, 0 0 10px rgba(232,242,255,0.4)";
var GLITCH_SHADOW = "0 0 6px #a8e6ff, 0 0 18px rgba(168,230,255,0.6)";

function setGlow(opacity, color, shadow) {
  contentEl.style.opacity = opacity;
  contentEl.style.color = color;
  contentEl.style.textShadow = shadow;
}

function settle() {
  setGlow(1, "#e8f2ff", NORMAL_SHADOW);
}

// one irregular dip-and-recover, like a CRT losing sync for a frame
function flickerOnce() {
  var dip = 0.75 + Math.random() * 0.2;
  setGlow(dip, "#a8e6ff", GLITCH_SHADOW);
  setTimeout(settle, 50 + Math.random() * 90);
}

// keeps scheduling flickers at random, non-repeating intervals
function scheduleFlicker() {
  if (reduceMotion) return;
  var delay = 2500 + Math.random() * 7000;
  setTimeout(function () {
    flickerOnce();
    if (Math.random() < 0.35) {
      setTimeout(flickerOnce, 120 + Math.random() * 180);
    }
    scheduleFlicker();
  }, delay);
}

// unstable power-on stutter before the screen holds steady
function bootFlicker(cb) {
  if (reduceMotion) { cb(); return; }
  var ticks = 0;
  var maxTicks = 8 + Math.floor(Math.random() * 4);
  setGlow(0, "#e8f2ff", NORMAL_SHADOW);
  var iv = setInterval(function () {
    ticks++;
    if (ticks >= maxTicks) {
      clearInterval(iv);
      settle();
      cb();
      return;
    }
    setGlow(Math.random() < 0.6 ? 0.15 + Math.random() * 0.5 : 1, "#e8f2ff", NORMAL_SHADOW);
  }, 60 + Math.random() * 50);
}

bootFlicker(function () {
  scheduleFlicker();
});

typeIt($("cmd1"), "whoami", function () {
  $("cursor1").style.display = "none";

  fetch("https://api.github.com/users/" + username)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      userData = data;
      $("uname").innerHTML = data.name ? data.name : username;
      $("bio").innerHTML = data.bio ? data.bio : "software developer";
      var s = "";
      if (data.public_repos != null) s += data.public_repos + " repos  ";
      if (data.followers != null) s += data.followers + " followers";
      $("stats").innerHTML = s;
      $("whoblock").style.display = "block";
      next1();
    })
    .catch(function (e) {
      console.log("whoami fetch failed", e);
      $("uname").innerHTML = username;
      $("bio").innerHTML = "software developer";
      $("whoblock").style.display = "block";
      next1();
    });
});

function next1() {
  setTimeout(function () {
    $("repostep").style.display = "block";
    typeIt($("cmd2"), "ls repos/ --sort=stars", function () {
      $("cursor2").style.display = "none";
      loadRepos();
    });
  }, 400);
}

function loadRepos() {
  fetch("https://api.github.com/users/" + username + "/repos?per_page=100&sort=pushed")
    .then(function (r) {
      if (!r.ok) throw new Error("bad response, probably rate limited (60 req/hr unauthenticated)");
      return r.json();
    })
    .then(function (data) {
      repoData = data.filter(function (r) { return !r.private; });
      repoData.sort(function (a, b) {
        return b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at);
      });
      return Promise.all(repoData.map(function (r) {
        return fetch(r.languages_url)
          .then(function (res) { return res.json(); })
          .then(function (langs) { r.langBytes = langs; })
          .catch(function () { r.langBytes = {}; });
      }));
    })
    .then(renderRepos)
    .catch(function (e) {
      $("repostatus").innerHTML = "# " + e.message;
      next2();
    });
}

function langBreakdown(r) {
  var bytes = r.langBytes || {};
  var names = Object.keys(bytes);
  if (!names.length) return r.language ? r.language : "??";
  var total = names.reduce(function (sum, n) { return sum + bytes[n]; }, 0);
  names.sort(function (a, b) { return bytes[b] - bytes[a]; });
  return names.map(function (n) {
    return n + " " + Math.round((bytes[n] / total) * 100) + "%";
  }).join(", ");
}

function renderRepos() {
  $("repostatus").style.display = "none";
  var html = "";
  for (var i = 0; i < repoData.length; i++) {
    var r = repoData[i];
    var desc = r.description ? r.description : "-- no description --";
    var lang = langBreakdown(r);
    html += '<a class="repo" href="' + r.html_url + '" target="_blank" rel="noopener">';
    html += '<span class="rname">&gt; ' + r.name + (r.fork ? " [FORK]" : "") + "</span>";
    html += '<span class="rlang">' + lang + "</span>";
    html += '<span class="rstars">*' + r.stargazers_count + "</span>";
    html += '<span class="rdesc">' + desc + " (" + timeAgo(r.pushed_at) + ")</span>";
    html += "</a>";
  }
  $("repolist").innerHTML = html;
  next2();
}

function next2() {
  setTimeout(function () {
    $("linkstep").style.display = "block";
    typeIt($("cmd3"), "links.txt", function () {
      $("cursor3").style.display = "none";
      $("linkout").innerHTML = '<a href="https://github.com/' + username + '" target="_blank" rel="noopener">github.com/' + username + '</a><br><a href="https://discord.com/users/707217660831727686" target="_blank" rel="noopener">discord: kimmie.3</a>';
      setTimeout(next3, 400);
    });
  }, 400);
}

function next3() {
  $("bio2step").style.display = "block";
  typeIt($("cmd4"), "bio.txt", function () {
    $("cursor4").style.display = "none";
    setTimeout(next4, 400);
  });
}

function next4() {
  $("intereststep").style.display = "block";
  typeIt($("cmd5"), "interests.txt", function () {
    $("cursor5").style.display = "none";
    setTimeout(function () {
      $("endline").style.display = "block";
    }, 300);
  });
}
