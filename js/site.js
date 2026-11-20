/* Hero: a tiny screening pipeline. 1,247 points stream in, a gate keeps the
   ones that fit, and those settle into the name. Pointer pushes them around. */
(function () {
  const canvas = document.getElementById("pipeline");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TOTAL = 1247;
  const elIn = document.getElementById("r-in");
  const elKept = document.getElementById("r-kept");
  const elDrop = document.getElementById("r-drop");

  const css = getComputedStyle(document.documentElement);
  const INK = css.getPropertyValue("--ink").trim() || "#0f1c3a";
  const BLUE = css.getPropertyValue("--blue").trim() || "#2f6da8";
  const SIGNAL = css.getPropertyValue("--signal").trim() || "#e39b2d";
  const RULE = css.getPropertyValue("--rule").trim() || "#cbd4de";
  const DISPLAY = css.getPropertyValue("--display").trim();

  let W = 0, H = 0, dpr = 1, gateX = 0, size = 2;
  let particles = [];
  let targets = [];
  let start = 0;
  let pointer = { x: -9999, y: -9999, active: false };
  let raf = 0;
  let visible = true;
  const glow = { x: 0, y: 0, r: 0 };
  const GAME_MS = 30000;
  const game = { on: false, start: 0, enemies: [], sparks: [], blocked: 0, missed: 0, nextSpawn: 0 };
  const hud = document.getElementById("hud");
  const playBtn = document.getElementById("play");

  function sampleTargets() {
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const o = off.getContext("2d", { willReadFrequently: true });
    const twoLines = W < 720;
    const left = Math.max(W * 0.13, 48);
    const avail = W - left - Math.max(W * 0.04, 20);
    const lines = twoLines ? ["Izum", "Adnan"] : ["Izum Adnan"];
    o.textBaseline = "alphabetic";
    o.fillStyle = "#000";
    // fit the widest line to the available width, then cap by height
    let fs = 100;
    o.font = `800 ${fs}px ${DISPLAY}`;
    const widest = Math.max(...lines.map((t) => o.measureText(t).width));
    fs = Math.min(fs * (avail / widest), (H * (twoLines ? 0.5 : 0.42)) / lines.length);
    o.font = `800 ${fs}px ${DISPLAY}`;
    const lh = fs * 0.95;
    let y = (H * 0.9 - lh * lines.length) / 2 + fs * 0.78;
    lines.forEach((t) => { o.fillText(t, left, y); y += lh; });
    const data = o.getImageData(0, 0, W, H).data;

    const sample = (gap) => {
      const pts = [];
      for (let yy = gap / 2; yy < H; yy += gap) {
        for (let xx = left; xx < W; xx += gap) {
          const i = ((yy | 0) * W + (xx | 0)) * 4 + 3;
          if (data[i] > 140) pts.push({ x: xx, y: yy });
        }
      }
      return pts;
    };
    // pick a grid spacing so the name uses close to (but under) the cap,
    // leaving some of the 1,247 points to be screened out
    const cap = Math.floor(TOTAL * 0.86);
    let gap = Math.max(3, fs / 16), pts = sample(gap);
    for (let k = 0; k < 4; k++) {
      gap = Math.max(2.5, gap * Math.sqrt(pts.length / cap));
      pts = sample(gap);
    }
    while (pts.length > cap) { gap *= 1.03; pts = sample(gap); }
    size = Math.max(1.6, gap * 0.6);
    gateX = left * 0.55;
    return pts;
  }

  function build() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    targets = sampleTargets();

    // shuffle which index is kept vs rejected
    const flags = new Array(TOTAL).fill(false);
    for (let i = 0; i < targets.length; i++) flags[i] = true;
    for (let i = flags.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [flags[i], flags[j]] = [flags[j], flags[i]];
    }
    // sort targets left to right so the name fills in reading order
    targets.sort((a, b) => a.x - b.x + (Math.random() - 0.5) * 40);

    let t = 0;
    particles = flags.map((keep, i) => {
      const lane = H * 0.5 + (Math.random() - 0.5) * H * 0.7;
      const p = {
        keep,
        x: -20 - Math.random() * 60,
        y: lane,
        vx: 0, vy: 0,
        delay: (i / TOTAL) * 2600 + Math.random() * 250,
        state: "wait", // wait -> stream -> settle | drop
        tx: 0, ty: 0,
        a: 1,
        speed: 3.2 + Math.random() * 2.4,
      };
      if (keep) { const tg = targets[t++]; p.tx = tg.x; p.ty = tg.y; }
      return p;
    });
    start = performance.now();
    if (reduce) finish();
  }

  function finish() {
    particles.forEach((p) => {
      if (p.keep) { p.x = p.tx; p.y = p.ty; p.state = "settle"; }
      else { p.state = "gone"; }
    });
    updateReadout(true);
    draw();
  }

  function updateReadout(final) {
    let inn = 0, kept = 0, drop = 0;
    for (const p of particles) {
      if (p.state !== "wait" && p.state !== "stream") {
        inn++;
        if (p.keep) kept++; else drop++;
      }
    }
    if (final) { inn = TOTAL; kept = targets.length; drop = TOTAL - targets.length; }
    if (elKept) elKept.textContent = kept.toLocaleString();
  }

  function step(now) {
    const t = now - start;
    for (const p of particles) {
      if (p.state === "wait") {
        if (t >= p.delay) p.state = "stream";
        else continue;
      }
      if (p.state === "stream") {
        p.x += p.speed * 2.2;
        p.y += Math.sin((p.x + p.delay) * 0.02) * 0.6;
        if (p.x >= gateX) {
          if (p.keep) { p.state = "settle"; p.vx = p.speed * 2; }
          else { p.state = "drop"; p.vx = p.speed * 0.8; p.vy = -1 - Math.random() * 1.5; }
        }
      } else if (p.state === "settle") {
        const dx = p.tx - p.x, dy = p.ty - p.y;
        p.vx += dx * 0.012; p.vy += dy * 0.012;
        if (pointer.active && !game.on) {
          const px = p.x - pointer.x, py = p.y - pointer.y;
          const d2 = px * px + py * py, R = 90;
          if (d2 < R * R && d2 > 0.01) {
            const d = Math.sqrt(d2), f = (1 - d / R) * 5;
            p.vx += (px / d) * f; p.vy += (py / d) * f;
          }
        }
        p.vx *= 0.82; p.vy *= 0.82;
        p.x += p.vx; p.y += p.vy;
      } else if (p.state === "drop") {
        p.vy += 0.18; p.x += p.vx; p.y += p.vy; p.a -= 0.012;
        if (p.a <= 0 || p.y > H + 20) p.state = "gone";
      } else if (p.state === "knocked") {
        p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy;
        if (p.y > H + 30) { p.vx = 0; p.vy = 0; p.y = H + 30; }
      }
    }
    if (game.on) stepGame(now);
    for (let i = game.sparks.length - 1; i >= 0; i--) {
      const s = game.sparks[i];
      s.x += s.vx; s.y += s.vy; s.vx *= 0.92; s.vy *= 0.92; s.a -= 0.035;
      if (s.a <= 0) game.sparks.splice(i, 1);
    }
  }

  /* ---------- the game: block the bad records before they hit the name ---------- */
  function settled() { return particles.filter((p) => p.keep && p.state === "settle"); }

  function spawnEnemy(elapsed) {
    const pool = settled();
    if (!pool.length) return;
    const target = pool[(Math.random() * pool.length) | 0];
    const side = Math.random();
    let x, y;
    if (side < 0.55) { x = W + 20; y = Math.random() * H; }
    else if (side < 0.8) { x = Math.random() * W; y = -20; }
    else { x = Math.random() * W; y = H + 20; }
    const speed = 1.3 + (elapsed / GAME_MS) * 2.8 + Math.random() * 0.7;
    game.enemies.push({ x, y, target, speed, wob: Math.random() * 6.28 });
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = 2 + Math.random() * 5;
      game.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, a: 1, color });
    }
  }

  function stepGame(now) {
    const elapsed = now - game.start;
    if (elapsed >= GAME_MS) return endGame();
    if (now >= game.nextSpawn) {
      spawnEnemy(elapsed);
      const gap = 900 - (elapsed / GAME_MS) * 620;
      game.nextSpawn = now + gap * (0.6 + Math.random() * 0.8);
    }
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];
      const dx = e.target.x - e.x, dy = e.target.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 7) {
        // it got through: knock a chunk of the name loose
        game.missed++;
        burst(e.x, e.y, SIGNAL, 10);
        const R = Math.max(18, size * 7);
        for (const p of particles) {
          if (p.state !== "settle") continue;
          const px = p.x - e.x, py = p.y - e.y, pd = Math.hypot(px, py);
          if (pd < R) {
            p.state = "knocked";
            p.vx = (px / (pd || 1)) * (2 + Math.random() * 4);
            p.vy = (py / (pd || 1)) * (2 + Math.random() * 4) - 3;
          }
        }
        game.enemies.splice(i, 1);
        continue;
      }
      e.wob += 0.1;
      e.x += (dx / d) * e.speed + Math.cos(e.wob) * 0.6;
      e.y += (dy / d) * e.speed + Math.sin(e.wob) * 0.6;
    }
    const left = Math.ceil((GAME_MS - elapsed) / 1000);
    hud.innerHTML = `Blocked <b>${game.blocked}</b>, missed <b class="miss">${game.missed}</b>, ${left}s left`;
  }

  function startGame() {
    // make sure the name is fully formed first
    particles.forEach((p) => {
      if (p.keep && p.state !== "settle") {
        if (p.state === "wait" || p.state === "stream") { p.x = p.tx; p.y = p.ty; }
        p.state = "settle";
      }
      if (!p.keep) p.state = "gone";
    });
    Object.assign(game, { on: true, start: performance.now(), enemies: [], blocked: 0, missed: 0, nextSpawn: performance.now() + 500 });
    canvas.classList.add("is-playing");
    playBtn.textContent = "Stop";
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function endGame(stopped) {
    game.on = false;
    game.enemies.forEach((e) => burst(e.x, e.y, SIGNAL, 4));
    game.enemies = [];
    canvas.classList.remove("is-playing");
    // heal the name: every knocked dot flies home
    particles.forEach((p) => { if (p.state === "knocked") { p.state = "settle"; p.vx = 0; p.vy = 0; } });
    const total = game.blocked + game.missed;
    if (stopped || !total) {
      hud.innerHTML = `Catch the bad records before they hit my name`;
    } else {
      const recall = (game.blocked / total).toFixed(2);
      const verdict = recall >= 0.91 ? "You beat my thesis model (0.91)." : "My thesis model hit 0.91.";
      hud.innerHTML = `Your recall <b>${recall}</b>, ${game.blocked} of ${total} blocked. ${verdict}`;
    }
    playBtn.textContent = total ? "Play again" : "Play";
  }

  function hitEnemy(x, y) {
    const R = window.matchMedia("(pointer: coarse)").matches ? 38 : 26;
    let best = -1, bestD = R;
    game.enemies.forEach((e, i) => { const d = Math.hypot(e.x - x, e.y - y); if (d < bestD) { bestD = d; best = i; } });
    if (best < 0) return false;
    const e = game.enemies[best];
    game.enemies.splice(best, 1);
    game.blocked++;
    burst(e.x, e.y, BLUE, 14);
    return true;
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    // aura: a soft light that follows the pointer, or drifts over the name when idle
    const t = (now || 0) / 1000;
    const gx = pointer.active ? pointer.x : W * 0.5 + Math.cos(t * 0.35) * W * 0.28;
    const gy = pointer.active ? pointer.y : H * 0.42 + Math.sin(t * 0.5) * H * 0.12;
    if (!glow.r) { glow.x = gx; glow.y = gy; }
    glow.x += (gx - glow.x) * 0.06; glow.y += (gy - glow.y) * 0.06;
    glow.r = Math.max(W, H) * 0.32;
    const g = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.r);
    g.addColorStop(0, "rgba(155,203,235,0.55)");
    g.addColorStop(0.5, "rgba(155,203,235,0.18)");
    g.addColorStop(1, "rgba(155,203,235,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const lit = glow.r * 0.45, lit2 = lit * lit;
    // the gate
    ctx.strokeStyle = RULE; ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(gateX, H * 0.22); ctx.lineTo(gateX, H * 0.72); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = INK;
    ctx.font = `500 12px ${DISPLAY}`;
    ctx.save(); ctx.translate(gateX - 8, H * 0.22); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "right"; ctx.globalAlpha = 0.55; ctx.fillText("screening gate", 0, 0); ctx.restore();
    ctx.globalAlpha = 1;

    for (const p of particles) {
      if (p.state === "wait" || p.state === "gone") continue;
      if (p.state === "stream") { ctx.fillStyle = INK; ctx.globalAlpha = 0.35; }
      else if (p.state === "drop") { ctx.fillStyle = SIGNAL; ctx.globalAlpha = Math.max(0, p.a); }
      else {
        const moving = Math.abs(p.vx) + Math.abs(p.vy) > 0.6;
        const dx = p.x - glow.x, dy = p.y - glow.y;
        ctx.fillStyle = moving || dx * dx + dy * dy < lit2 ? BLUE : INK; ctx.globalAlpha = 1;
      }
      if (p.state === "knocked") { ctx.fillStyle = SIGNAL; ctx.globalAlpha = 0.8; }
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    for (const s of game.sparks) {
      ctx.globalAlpha = Math.max(0, s.a); ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
    const es = Math.max(9, size * 2.4);
    for (const e of game.enemies) {
      ctx.fillStyle = SIGNAL;
      ctx.fillRect(e.x - es / 2, e.y - es / 2, es, es);
      ctx.strokeStyle = SIGNAL; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, es * 1.3 + Math.sin(e.wob * 2) * 2, 0, 6.28); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  let frame = 0;
  function loop(now) {
    if (visible) {
      step(now); draw(now);
      if ((frame++ & 7) === 0 && !game.on && !game.start) updateReadout(false);
    }
    raf = requestAnimationFrame(loop);
  }

  function setPointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true;
  }
  canvas.addEventListener("pointermove", setPointer);
  // while playing, a tap anywhere on the hero (even over the text) can hit a record
  let swallowClick = false;
  canvas.parentElement.addEventListener("pointerdown", (e) => {
    if (!game.on) return;
    setPointer(e);
    if (hitEnemy(pointer.x, pointer.y)) { e.preventDefault(); swallowClick = true; }
  }, true);
  canvas.addEventListener("pointerleave", () => { pointer.active = false; });

  playBtn.addEventListener("click", () => {
    if (swallowClick) { swallowClick = false; return; }
    if (game.on) endGame(true); else startGame();
  });
  canvas.parentElement.addEventListener("click", () => { setTimeout(() => { swallowClick = false; }, 0); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && game.on) endGame(true); });

  let rt, lastW = window.innerWidth, lastH = window.innerHeight;
  window.addEventListener("resize", () => {
    // phones resize when the address bar hides; only rebuild on real size changes
    if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 160) return;
    lastW = window.innerWidth; lastH = window.innerHeight;
    clearTimeout(rt);
    rt = setTimeout(() => { if (game.on) endGame(true); build(); if (reduce) finish(); }, 180);
  });

  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(canvas);

  const go = () => { build(); if (!reduce) raf = requestAnimationFrame(loop); else draw(0); };
  if (document.fonts && document.fonts.load) {
    Promise.race([
      document.fonts.load(`800 100px ${DISPLAY}`),
      new Promise((r) => setTimeout(r, 1500)),
    ]).then(go, go);
  } else go();
})();

/* Top bar border and current-section link */
(function () {
  const bar = document.querySelector(".bar");
  const onScroll = () => bar.classList.toggle("is-scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const links = [...document.querySelectorAll(".bar nav a")];
  const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        links.forEach((a) => a.removeAttribute("aria-current"));
        const a = map.get(e.target.id);
        if (a) a.setAttribute("aria-current", "true");
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
})();

/* Copy email */
(function () {
  const btn = document.getElementById("copy-email");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const email = btn.dataset.email;
    try { await navigator.clipboard.writeText(email); }
    catch (e) {
      const t = document.createElement("textarea"); t.value = email; document.body.appendChild(t);
      t.select(); document.execCommand("copy"); t.remove();
    }
    btn.textContent = "Copied"; btn.dataset.done = "true";
    setTimeout(() => { btn.textContent = "Copy email"; btn.dataset.done = "false"; }, 2000);
  });
})();

/* Show more projects */
(function () {
  const btn = document.getElementById("more-projects");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const extra = document.querySelectorAll("[data-extra]");
    const open = btn.getAttribute("aria-expanded") === "true";
    extra.forEach((el) => { el.hidden = open; });
    btn.setAttribute("aria-expanded", String(!open));
    btn.textContent = open ? `Show ${extra.length} more projects` : "Show fewer projects";
  });
})();
