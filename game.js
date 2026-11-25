/* ==========================================================
   ESCAPA DE LABURAR
   Secciones:
    1. Elementos y constantes
    2. Variables
    3. Sonido
    4. Ciudad de fondo de la página
    5. Panel superior (puntos, combo, palas)
    6. Efectos (partículas y textos flotantes)
    7. Aparición de palas y objetos
    8. Colisiones
    9. Acciones del juego (combo, usar pala, perder)
   10. Actualización (cada cuadro)
   11. Dibujo
   12. Controles
   13. Clasificación
   14. Tienda
   15. Arranque
   ========================================================== */


/* ---------- 1. Elementos y constantes ---------- */

const $ = (id) => document.getElementById(id);

const canvas = $("cv");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const BEST_KEY = "escapa_de_laburar_best_v4";
const SKIN_COST = 67;   // Veritys que cuesta poner tu imagen
const BG_COST = 123;    // Veritys que cuesta cambiar el fondo de atrás
const MAX_COMBO = 32;


/* ---------- 2. Variables ---------- */

// Estado de la partida
const state = {
  running: false,
  paused: false,
  score: 0,
  combo: 1,
  maxCombo: 1,       // el combo más alto de esta partida
  streak: 0,         // palas esquivadas seguidas
  time: 0,           // segundos jugados
  spawnTimer: 0,     // tiempo para la próxima pala
  itemTimer: 1.2,    // tiempo para el próximo objeto
  slowTimer: 0,      // segundos que quedan de cámara lenta
  shield: false,
  shake: 0,          // intensidad del temblor de pantalla
  flash: 0,          // destello al usar una pala
  palas: 0,          // palas guardadas (máximo 3)
  keys: { left: false, right: false },
  pointerX: null     // posición del dedo o mouse (null = no se usa)
};

// Jugador (el rectángulo que esquiva)
const player = {
  w: 46,
  h: 22,
  x: W / 2 - 23,
  y: H - 48,
  speed: 400,
  trail: []
};

// Listas de cosas que hay en pantalla
let hazards = [];      // palas que caen
let pickups = [];      // objetos que se recogen
let particles = [];
let floatTexts = [];

// Decoración del fondo del juego
const papers = [];     // hojas que flotan
const buildings = [];  // edificios de la ciudad

// Guardado y clasificación
let bestScore = 0;
let db = null;               // base de datos compartida (si existe)
let unsubscribe = null;
let localRanking = [];
let lastScore = 0;
let lastCombo = 1;
let lastLevel = 1;
let scoreSaved = false;

// Tienda
let veritys = 0;
let skinOwned = false;
let playerSkin = null;       // imagen del jugador (si la compró)
let bgOwned = false;
let pageBg = null;           // imagen del fondo de atrás (si la compró)

// Sonido
let audioCtx = null;
let muted = false;

// Control con el dedo o el mouse
let dragging = false;
let lastFrameTime = performance.now();


/* ---------- 3. Sonido ---------- */

function playTone(freq, duration, type = "sine", volume = 0.08) {
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // si el navegador no deja reproducir sonido, el juego sigue igual
  }
}


/* ---------- 4. Ciudad de fondo de la página ---------- */

const pageCanvas = $("city");
const pageCtx = pageCanvas.getContext("2d");

// Dibuja la ciudad de noche detrás de toda la página
function drawPageCity() {
  const w = (pageCanvas.width = innerWidth);
  const h = (pageCanvas.height = innerHeight);

  // Si compró el fondo y eligió una imagen, se usa esa en vez de la ciudad
  if (pageBg && pageBg.complete && pageBg.naturalWidth) {
    const scale = Math.max(w / pageBg.naturalWidth, h / pageBg.naturalHeight);
    const iw = pageBg.naturalWidth * scale;
    const ih = pageBg.naturalHeight * scale;
    pageCtx.drawImage(pageBg, (w - iw) / 2, (h - ih) / 2, iw, ih);
    pageCtx.fillStyle = "rgba(11, 18, 32, 0.3)"; // oscurece un poco para que se lea el juego
    pageCtx.fillRect(0, 0, w, h);
    return;
  }

  const sky = pageCtx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0b1220");
  sky.addColorStop(1, "#1c2638");
  pageCtx.fillStyle = sky;
  pageCtx.fillRect(0, 0, w, h);

  // Números "al azar" con semilla fija, para que la ciudad no cambie
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  for (let x = -10; x < w; ) {
    const buildingW = 40 + random() * 50;
    const buildingH = h * 0.25 + random() * h * 0.45;
    const y = h - buildingH;

    pageCtx.fillStyle = "#141c2b";
    pageCtx.fillRect(x, y, buildingW, buildingH);

    // ventanas encendidas
    for (let wy = y + 10; wy < h - 14; wy += 18) {
      for (let wx = x + 6; wx < x + buildingW - 10; wx += 14) {
        if (random() < 0.3) {
          pageCtx.fillStyle = "rgba(232, 200, 114, .5)";
          pageCtx.fillRect(wx, wy, 6, 9);
        }
      }
    }
    x += buildingW + 5;
  }
}


/* ---------- 5. Panel superior (puntos, combo, palas) ---------- */

const palaSlots = document.querySelectorAll(".slot");

const PALA_ICON =
  '<svg width="26" height="26" viewBox="0 0 26 26">' +
  '<rect x="11" y="2" width="4" height="13" fill="#d97706"/>' +
  '<rect x="8" y="2" width="10" height="3" fill="#f59e0b"/>' +
  '<path d="M6 14h14l-3 10H9z" fill="#eab308"/>' +
  "</svg>";

function updateHud() {
  $("score").textContent = Math.floor(state.score);
  $("combo").textContent = "x" + state.combo;
  $("best").textContent = bestScore;

  palaSlots.forEach((slot, i) => {
    const filled = i < state.palas;
    slot.innerHTML = filled ? PALA_ICON : "";
    slot.classList.toggle("full", filled);
  });
  $("use").classList.toggle("on", state.palas > 0);
}

// Pequeño salto del cartel del combo
function comboPop() {
  const badge = $("combo");
  badge.classList.remove("pop");
  void badge.offsetWidth;
  badge.classList.add("pop");
  setTimeout(() => badge.classList.remove("pop"), 120);
}

function currentLevel() {
  return 1 + Math.floor(state.time / 15);
}


/* ---------- 6. Efectos ---------- */

function spawnParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 6.283;
    const speed = Math.random() * 180 + 40;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: Math.random() * 0.4 + 0.2,
      maxLife: 0.6,
      color,
      size: Math.random() * 4 + 2
    });
  }
}

function spawnFloatText(x, y, text, color) {
  floatTexts.push({ x, y, text, color, life: 0.9 });
}


/* ---------- 7. Aparición de palas y objetos ---------- */

function spawnHazard() {
  const difficulty = 1 + state.time * 0.07;
  const w = 28;
  const h = 44;

  hazards.push({
    x: Math.random() * (W - w),
    y: -h - 10,
    w,
    h,
    vy: (Math.random() * 130 + 175) * Math.min(3.6, difficulty),
    vx: (Math.random() - 0.5) * 80 * Math.min(2.6, difficulty),
    rotation: (Math.random() - 0.5) * 0.4,
    spin: (Math.random() - 0.5) * 4,
    passed: false
  });
}

// Probabilidades: Verity 50%, escudo 12%, reloj 10%, pala 11%,
// Falsity 11%, Cruelty 6%
function spawnPickup() {
  const roll = Math.random();
  let kind = "star"; // "star" es el Verity

  if (roll > 0.5 && roll <= 0.62) kind = "shield";
  else if (roll > 0.62 && roll <= 0.72) kind = "slow";
  else if (roll > 0.72 && roll <= 0.83) kind = "pala";
  else if (roll > 0.83 && roll <= 0.94) kind = "falsity";
  else if (roll > 0.94) kind = "cruelty";

  pickups.push({
    kind,
    x: Math.random() * (W - 32) + 16,
    y: -24,
    r: 17,
    vy: Math.random() * 75 + 125
  });
}


/* ---------- 8. Colisiones ---------- */

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function circleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}


/* ---------- 9. Acciones del juego ---------- */

function resetGame() {
  Object.assign(state, {
    running: true,
    paused: false,
    score: 0,
    combo: 1,
    maxCombo: 1,
    streak: 0,
    time: 0,
    spawnTimer: 0,
    itemTimer: 1.2,
    slowTimer: 0,
    shield: false,
    shake: 0,
    flash: 0,
    palas: 0
  });

  hazards = [];
  pickups = [];
  particles = [];
  floatTexts = [];
  player.x = W / 2 - player.w / 2;
  player.trail = [];

  updateHud();
  ["startOv", "overOv", "pauseOv"].forEach((id) => $(id).classList.add("hidden"));
  playTone(520, 0.12, "triangle", 0.09);
}

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  $("pauseOv").classList.toggle("hidden", !state.paused);
}

// El combo sube cada 5 palas esquivadas, hasta MAX_COMBO
function updateCombo() {
  const newCombo = Math.min(MAX_COMBO, 1 + Math.floor(state.streak / 5));
  if (newCombo > state.combo) {
    state.combo = newCombo;
    state.maxCombo = Math.max(state.maxCombo, newCombo);
    comboPop();
    playTone(660 + newCombo * 55, 0.1, "sine", 0.07);
  }
}

// Rompe todas las palas de la pantalla
function usePala() {
  if (!state.running || state.paused || state.palas < 1 || !hazards.length) return;

  state.palas--;
  state.flash = 0.25;
  state.shake = 8;

  hazards.forEach((h) => {
    spawnParticles(h.x + h.w / 2, h.y + h.h / 2, "#f59e0b", 10);
    state.score += 10 * state.combo;
  });
  spawnFloatText(W / 2, H / 2, "¡ROMPEPALAS! +" + hazards.length * 10 * state.combo, "#f59e0b");

  hazards = [];
  playTone(260, 0.25, "square", 0.1);
  updateHud();
}

function gameOver() {
  state.running = false;
  state.shake = 14;
  spawnParticles(player.x + player.w / 2, player.y + player.h / 2, "#ef4444", 24);
  playTone(150, 0.35, "sawtooth", 0.12);

  // Récord
  const finalScore = Math.floor(state.score);
  if (finalScore > bestScore) {
    bestScore = finalScore;
    try { localStorage.setItem(BEST_KEY, String(bestScore)); } catch (e) {}
  }

  // Datos para guardar en la clasificación
  lastScore = finalScore;
  lastCombo = state.maxCombo;
  lastLevel = currentLevel();
  scoreSaved = false;

  // Pantalla final
  $("fin").textContent =
    "Puntaje final: " + finalScore + " · x" + state.maxCombo + " · Nivel " + currentLevel();
  $("finBest").textContent = "Mejor récord: " + bestScore;
  $("saveBtn").disabled = false;
  $("saveMsg").textContent = "";
  $("nameRow").style.display = finalScore > 0 ? "flex" : "none";
  try { $("nameIn").value = localStorage.getItem("elb_name") || ""; } catch (e) {}

  updateHud();
  $("overOv").classList.remove("hidden");
}


/* ---------- 10. Actualización (cada cuadro) ---------- */

function update(dt) {
  // La cámara lenta frena todo menos al jugador
  const timeScale = state.slowTimer > 0 ? 0.48 : 1;
  if (state.slowTimer > 0) state.slowTimer = Math.max(0, state.slowTimer - dt);

  state.shake = Math.max(0, state.shake - dt * 45);
  state.flash = Math.max(0, state.flash - dt);

  updateBackground(dt, timeScale);
  updateEffects(dt);

  if (!state.running || state.paused) return;

  state.time += dt;

  updatePlayer(dt);
  spawnOverTime(dt, timeScale);
  state.score += dt * 12 * state.combo * timeScale;

  if (updateHazards(dt, timeScale)) return; // true = el jugador perdió
  updatePickups(dt, timeScale);

  updateHud();
}

function updateBackground(dt, timeScale) {
  papers.forEach((p) => {
    p.y += p.speed * timeScale * dt;
    p.rot += p.rotSpeed * timeScale * dt;
    if (p.y > H + 20) {
      p.y = -20;
      p.x = Math.random() * W;
    }
  });
}

function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  for (let i = floatTexts.length - 1; i >= 0; i--) {
    floatTexts[i].y -= 40 * dt;
    floatTexts[i].life -= dt;
    if (floatTexts[i].life <= 0) floatTexts.splice(i, 1);
  }
}

function updatePlayer(dt) {
  if (state.pointerX !== null) {
    // Con el dedo o el mouse: se desliza suave hacia ahí
    const targetX = state.pointerX - player.w / 2;
    player.x += (targetX - player.x) * Math.min(1, dt * 18);
  } else {
    // Con el teclado
    const direction = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
    player.x += direction * player.speed * dt;
  }

  // No salirse de la pantalla
  player.x = Math.max(6, Math.min(W - player.w - 6, player.x));

  // Estela
  player.trail.push({ x: player.x, y: player.y, alpha: 0.4 });
  if (player.trail.length > 6) player.trail.shift();
  player.trail.forEach((t) => (t.alpha *= 0.84));
}

// Hace aparecer palas y objetos cada cierto tiempo
function spawnOverTime(dt, timeScale) {
  const spawnInterval = Math.max(0.15, 0.6 - state.time * 0.016);
  state.spawnTimer += dt * timeScale;
  if (state.spawnTimer >= spawnInterval) {
    state.spawnTimer = 0;
    spawnHazard();
  }

  state.itemTimer += dt;
  if (state.itemTimer >= 2.8) {
    state.itemTimer = 0;
    spawnPickup();
  }
}

// Devuelve true si el jugador perdió
function updateHazards(dt, timeScale) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];

    h.y += h.vy * timeScale * dt;
    h.x += h.vx * timeScale * dt;
    h.rotation += h.spin * timeScale * dt;
    if (h.x <= 0 || h.x + h.w >= W) h.vx *= -1; // rebota en los bordes

    // Pala esquivada: suma al combo
    if (!h.passed && h.y > player.y + player.h) {
      h.passed = true;
      state.streak++;
      updateCombo();
      state.score += 5 * state.combo;
    }

    // Choque con el jugador
    const touchesPlayer = rectsOverlap(
      player.x + 4, player.y + 3, player.w - 8, player.h - 6,
      h.x + 3, h.y + 4, h.w - 6, h.h - 6
    );

    if (touchesPlayer) {
      if (state.shield) {
        // El escudo te salva una vez, pero baja el combo a la mitad
        state.shield = false;
        state.shake = 10;
        state.streak = Math.floor(state.streak / 2);
        state.combo = Math.min(state.combo, 1 + Math.floor(state.streak / 5));
        spawnParticles(h.x + h.w / 2, h.y + h.h / 2, "#38bdf8", 16);
        playTone(320, 0.18, "triangle", 0.1);
        hazards.splice(i, 1);
        continue;
      }
      gameOver();
      return true;
    }

    if (h.y > H + 60) hazards.splice(i, 1);
  }
  return false;
}

function updatePickups(dt, timeScale) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.y += p.vy * timeScale * dt;

    const caught = circleRectOverlap(
      p.x, p.y, p.r + 4,
      player.x, player.y, player.w, player.h
    );

    if (caught) {
      collectPickup(p);
      pickups.splice(i, 1);
      continue;
    }
    if (p.y > H + 40) pickups.splice(i, 1);
  }
}

// Qué pasa al agarrar cada objeto
function collectPickup(p) {
  if (p.kind === "star") {
    // Verity: vale 1
    addVeritys(1);
    state.score += 45 * state.combo;
    state.streak += 2;
    updateCombo();
    spawnParticles(p.x, p.y, "#facc15", 14);
    spawnFloatText(p.x, p.y, "Verity +" + 45 * state.combo, "#facc15");
    playTone(880, 0.12, "sine", 0.08);
    comboPop();

  } else if (p.kind === "shield") {
    state.shield = true;
    spawnParticles(p.x, p.y, "#38bdf8", 16);
    spawnFloatText(p.x, p.y, "Escudo", "#38bdf8");
    playTone(587, 0.18, "triangle", 0.09);

  } else if (p.kind === "slow") {
    state.slowTimer = 4;
    spawnParticles(p.x, p.y, "#c084fc", 16);
    spawnFloatText(p.x, p.y, "Lento", "#c084fc");
    playTone(440, 0.2, "sine", 0.09);

  } else if (p.kind === "falsity") {
    // Falsity: vale 5 Veritys
    addVeritys(5);
    state.score += 120 * state.combo;
    state.streak += 3;
    updateCombo();
    spawnParticles(p.x, p.y, "#3b5bdb", 16);
    spawnFloatText(p.x, p.y, "Falsity +5", "#93a5ff");
    playTone(300, 0.18, "square", 0.08);
    comboPop();

  } else if (p.kind === "cruelty") {
    // Cruelty: vale 10 Veritys
    addVeritys(10);
    state.score += 300 * state.combo;
    state.streak += 5;
    updateCombo();
    spawnParticles(p.x, p.y, "#ef1c1c", 20);
    spawnFloatText(p.x, p.y, "Cruelty +10", "#ff6b6b");
    playTone(200, 0.25, "sawtooth", 0.09);
    comboPop();

  } else {
    // Pala dorada: se guarda (máximo 3)
    if (state.palas < 3) {
      state.palas++;
      spawnFloatText(p.x, p.y, "+1 pala", "#f59e0b");
    } else {
      state.score += 30 * state.combo;
      spawnFloatText(p.x, p.y, "Llenas: +30", "#f59e0b");
    }
    spawnParticles(p.x, p.y, "#f59e0b", 14);
    playTone(700, 0.15, "triangle", 0.09);
  }
}


/* ---------- 11. Dibujo ---------- */

function draw() {
  ctx.save();

  // Temblor de pantalla
  if (state.shake > 0) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }

  drawBackground();
  drawPlayer();
  hazards.forEach(drawShovel);

  ctx.font = "18px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  pickups.forEach(drawPickup);

  drawParticles();
  drawFloatTexts();
  drawTexts();

  // Destello al usar una pala
  if (state.flash > 0) {
    ctx.fillStyle = "rgba(245, 158, 11, " + state.flash * 1.6 + ")";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

// Ciudad de noche con hojas que flotan
function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  if (state.slowTimer > 0) {
    sky.addColorStop(0, "#1b1740");
    sky.addColorStop(1, "#2b2457");
  } else {
    sky.addColorStop(0, "#0b1220");
    sky.addColorStop(1, "#1c2638");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  // Edificios
  buildings.forEach((b) => {
    const top = H - 26 - b.h;
    ctx.fillStyle = "#141c2b";
    ctx.fillRect(b.x, top, b.w, b.h);

    b.lights.forEach((on, i) => {
      if (!on) return;
      const col = i % b.cols;
      const row = Math.floor(i / b.cols);
      ctx.fillStyle = "rgba(232, 200, 114, .55)";
      ctx.fillRect(b.x + 4 + col * 12, top + 6 + row * 16, 6, 8);
    });
  });

  // Piso
  ctx.fillStyle = "#0a0f18";
  ctx.fillRect(-20, H - 26, W + 40, 40);
  ctx.fillStyle = "#1f2a3d";
  ctx.fillRect(-20, H - 26, W + 40, 2);

  // Hojas de papel
  papers.forEach((p) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = "rgba(226, 232, 240, .13)";
    ctx.fillRect(-p.size / 2, -p.size * 0.65, p.size, p.size * 1.3);
    ctx.restore();
  });
}

function drawPlayer() {
  // Estela
  player.trail.forEach((t) => {
    ctx.fillStyle = "rgba(56, 189, 248, " + t.alpha * 0.4 + ")";
    ctx.beginPath();
    ctx.roundRect(t.x, t.y, player.w, player.h, 8);
    ctx.fill();
  });

  // Rectángulo azul
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.roundRect(player.x, player.y, player.w, player.h, 8);
  ctx.fill();

  if (playerSkin) {
    // Tu imagen, recortada al rectángulo
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(player.x, player.y, player.w, player.h, 8);
    ctx.clip();
    ctx.drawImage(playerSkin, player.x, player.y, player.w, player.h);
    ctx.restore();
  } else {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(player.x + 10, player.y + 5, player.w - 20, 5);
  }

  // Escudo
  if (state.shield) {
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x + player.w / 2, player.y + player.h / 2, 34, 0, 6.283);
    ctx.stroke();
  }
}

function drawShovel(h) {
  ctx.save();
  ctx.translate(h.x + h.w / 2, h.y + h.h / 2);
  ctx.rotate(h.rotation);

  // Mango
  ctx.fillStyle = "#d97706";
  ctx.fillRect(-3, -h.h / 2, 6, h.h * 0.65);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(-7, -h.h / 2, 14, 5);

  // Hoja de la pala
  ctx.fillStyle = "#9ca3af";
  ctx.beginPath();
  ctx.moveTo(-10, 4);
  ctx.lineTo(10, 4);
  ctx.lineTo(7, h.h / 2);
  ctx.lineTo(-7, h.h / 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawPickup(p) {
  ctx.save();
  ctx.translate(p.x, p.y);

  if (p.kind === "star") drawVerity(p.r);
  else if (p.kind === "falsity" || p.kind === "cruelty") drawFace(p.r, p.kind);
  else drawPowerUp(p.r, p.kind);

  ctx.restore();
}

// Verity: carita feliz amarilla
function drawVerity(r) {
  ctx.fillStyle = "#b45309";
  ctx.beginPath();
  ctx.arc(0, 2, r, 0, 6.283);
  ctx.fill();

  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 6.283);
  ctx.fill();

  // Brillo
  ctx.fillStyle = "rgba(255, 255, 255, .4)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.4, -r * 0.5, r * 0.3, r * 0.16, -0.6, 0, 6.283);
  ctx.fill();

  // Ojos
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.15, r * 0.1, r * 0.18, 0, 0, 6.283);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.32, -r * 0.15, r * 0.1, r * 0.18, 0, 0, 6.283);
  ctx.fill();

  // Sonrisa
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -r * 0.1, r * 0.58, 0.18 * Math.PI, 0.82 * Math.PI);
  ctx.stroke();
}

// Falsity (azul, cara neutra) y Cruelty (roja, cara enojada)
function drawFace(r, kind) {
  const isFalsity = kind === "falsity";

  ctx.fillStyle = isFalsity ? "#1e3a8a" : "#7f1d1d";
  ctx.beginPath();
  ctx.arc(0, 2, r, 0, 6.283);
  ctx.fill();

  ctx.fillStyle = isFalsity ? "#3b5bdb" : "#ef1c1c";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 6.283);
  ctx.fill();

  // Brillo
  ctx.fillStyle = "rgba(255, 255, 255, .28)";
  ctx.beginPath();
  ctx.ellipse(r * 0.35, -r * 0.5, r * 0.3, r * 0.14, 0.6, 0, 6.283);
  ctx.fill();

  ctx.fillStyle = "#0a0a0a";
  ctx.strokeStyle = "#0a0a0a";
  ctx.lineCap = "round";
  ctx.lineWidth = 2;

  if (isFalsity) {
    // Ojos medio cerrados y boca recta
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(side * r * 0.34 - r * 0.13, -r * 0.2);
      ctx.lineTo(side * r * 0.34 + r * 0.13, -r * 0.2);
      ctx.arc(side * r * 0.34, -r * 0.2, r * 0.13, 0, Math.PI);
      ctx.fill();
    });
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, r * 0.4);
    ctx.lineTo(r * 0.5, r * 0.4);
    ctx.stroke();
  } else {
    // Ojos enojados con cejas y boca torcida
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.32, -r * 0.05, r * 0.12, r * 0.2, 0, 0, 6.283);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(side * r * 0.62, -r * 0.5);
      ctx.lineTo(side * r * 0.1, -r * 0.27);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, r * 0.45);
    ctx.quadraticCurveTo(0, r * 0.3, r * 0.5, r * 0.42);
    ctx.stroke();
  }
}

// Escudo, reloj de arena y pala dorada
function drawPowerUp(r, kind) {
  const color =
    kind === "shield" ? "#38bdf8" : kind === "slow" ? "#c084fc" : "#f59e0b";

  // Círculo de fondo
  ctx.fillStyle = "rgba(15, 23, 42, .85)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 6.283);
  ctx.fill();
  ctx.stroke();

  // Dibujo de adentro
  ctx.fillStyle = color;
  ctx.beginPath();

  if (kind === "shield") {
    ctx.moveTo(-7, -7);
    ctx.lineTo(0, -10);
    ctx.lineTo(7, -7);
    ctx.lineTo(6, 3);
    ctx.lineTo(0, 10);
    ctx.lineTo(-6, 3);
  } else if (kind === "slow") {
    ctx.moveTo(-6, -8);
    ctx.lineTo(6, -8);
    ctx.lineTo(0, 0);
    ctx.lineTo(6, 8);
    ctx.lineTo(-6, 8);
    ctx.lineTo(0, 0);
  } else {
    ctx.rect(-1.5, -10, 3, 11);
    ctx.rect(-5, -10, 10, 2.5);
    ctx.moveTo(-5, 1);
    ctx.lineTo(5, 1);
    ctx.lineTo(3, 10);
    ctx.lineTo(-3, 10);
  }

  ctx.closePath();
  ctx.fill();
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

function drawFloatTexts() {
  ctx.font = "bold 15px sans-serif";
  floatTexts.forEach((f) => {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
}

// Textos fijos: nivel, Veritys y cámara lenta
function drawTexts() {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 13px sans-serif";

  if (state.running) {
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("Nivel " + currentLevel(), 14, 24);

    ctx.textAlign = "right";
    ctx.fillStyle = "#facc15";
    ctx.fillText("Veritys: " + veritys, W - 14, 24);
    ctx.textAlign = "left";
  }

  if (state.slowTimer > 0) {
    ctx.fillStyle = "#e9d5ff";
    ctx.fillText("CÁMARA LENTA: " + state.slowTimer.toFixed(1) + "s", 14, 42);
  }
}


/* ---------- 12. Controles ---------- */

// Teclado
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return; // no molestar mientras escribes tu nombre

  const key = e.key.toLowerCase();

  if (key === "arrowleft" || key === "a") {
    state.keys.left = true;
    state.pointerX = null;
  }
  if (key === "arrowright" || key === "d") {
    state.keys.right = true;
    state.pointerX = null;
  }
  if (key === " ") {
    e.preventDefault();
    usePala();
  }
  if (key === "p" || key === "escape") togglePause();
  if (key === "enter" && !state.running) resetGame();
});

addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  if (key === "arrowleft" || key === "a") state.keys.left = false;
  if (key === "arrowright" || key === "d") state.keys.right = false;
});

// Dedo o mouse
function setPointerX(clientX) {
  const rect = canvas.getBoundingClientRect();
  state.pointerX = (clientX - rect.left) * (W / rect.width);
}

$("wrap").addEventListener("pointerdown", (e) => {
  if (state.paused) {
    togglePause();
    return;
  }
  if (!state.running) return;
  dragging = true;
  setPointerX(e.clientX);
});

addEventListener("pointermove", (e) => {
  if (dragging && state.running) setPointerX(e.clientX);
});

addEventListener("pointerup", () => {
  dragging = false;
  state.pointerX = null;
});

// Botones
$("startBtn").onclick = resetGame;
$("againBtn").onclick = resetGame;
$("use").onclick = usePala;

$("mute").onclick = () => {
  muted = !muted;
  $("mute").textContent = muted ? "Sonido: no" : "Sonido: sí";
};

// Pausa automática si cambias de pestaña
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.running && !state.paused) togglePause();
});


/* ---------- 13. Clasificación ---------- */

// Dibuja la lista de los 10 mejores
function renderRanking(rows) {
  const list = $("rank");
  list.textContent = "";

  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Aún no hay puntajes. Sé el primero.";
    list.appendChild(empty);
    return;
  }

  rows.forEach((row, i) => {
    const item = document.createElement("li");

    const name = document.createElement("span");
    name.className = "nm";
    name.textContent = i + 1 + ". " + row.name;

    const points = document.createElement("span");
    points.className = "pts";
    points.textContent = row.score + " x" + (row.combo || 1);

    item.append(name, points);
    list.appendChild(item);
  });
}

// Clasificación guardada solo en este dispositivo
function showLocalRanking() {
  $("rankSrc").textContent = "Solo en este dispositivo";
  const top = localRanking.slice().sort((a, b) => b.score - a.score).slice(0, 10);
  renderRanking(top);
}

// Si la página permite base de datos compartida, la usa
async function connectSharedRanking() {
  try {
    if (!(window.claude && claude.use)) return;

    db = await claude.use("db");
    if (!db) return;

    $("rankSrc").textContent = "Compartida con todos los jugadores";
    unsubscribe = db
      .collection("scores")
      .orderBy("score", "desc")
      .limit(10)
      .onSnapshot(
        (snapshot) => renderRanking(snapshot.docs.map((d) => d.data())),
        () => {
          db = null;
          showLocalRanking();
        }
      );
  } catch (e) {
    db = null;
  }
}

async function saveScore() {
  if (scoreSaved) return;
  scoreSaved = true;
  $("saveBtn").disabled = true;

  const name = $("nameIn").value.trim().slice(0, 12) || "Anónimo";
  try { localStorage.setItem("elb_name", name); } catch (e) {}

  const row = {
    name,
    score: lastScore,
    combo: lastCombo,
    level: lastLevel,
    t: Date.now()
  };

  // 1) Intentar en la clasificación compartida
  let saved = false;
  if (db) {
    try {
      await db.collection("scores").add(row);
      saved = true;
    } catch (e) {}
  }
  if (saved) {
    $("saveMsg").textContent = "¡Listo, ya estás en la clasificación!";
    return;
  }

  // 2) Si no se pudo, guardar en este dispositivo
  if (unsubscribe) {
    try { unsubscribe(); } catch (e) {}
    unsubscribe = null;
  }
  const hadSharedDb = !!db;
  db = null;

  localRanking.push(row);
  localRanking = localRanking.sort((a, b) => b.score - a.score).slice(0, 30);
  try { localStorage.setItem("elb_rank", JSON.stringify(localRanking)); } catch (e) {}

  showLocalRanking();
  $("saveMsg").textContent = hadSharedDb
    ? "No se pudo subir; quedó guardado en este dispositivo."
    : "Guardado en este dispositivo.";
}

$("saveBtn").onclick = saveScore;
$("nameIn").addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveScore();
});


/* ---------- 14. Tienda ---------- */

// Actualiza todo lo que se ve en la tienda
function updateShop() {
  $("wal").textContent = veritys;
  $("buyBox").style.display = skinOwned ? "none" : "";
  $("skinCtl").style.display = skinOwned ? "flex" : "none";
  $("clrBtn").style.display = playerSkin ? "" : "none";

  $("progBar").style.width = Math.min(100, (veritys / SKIN_COST) * 100) + "%";
  $("progTxt").textContent =
    veritys >= SKIN_COST ? "¡Ya te alcanza!" : veritys + " de " + SKIN_COST + " Veritys";
  $("buyBtn").disabled = veritys < SKIN_COST;

  // Vista previa del rectángulo
  const preview = $("prevBox");
  preview.classList.toggle("skinned", !!playerSkin);
  preview.style.backgroundImage = playerSkin ? 'url("' + playerSkin.src + '")' : "";

  // Fondo de atrás
  $("bgBuyBox").style.display = bgOwned ? "none" : "";
  $("bgCtl").style.display = bgOwned ? "flex" : "none";
  $("bgClrBtn").style.display = pageBg ? "" : "none";

  $("bgProgBar").style.width = Math.min(100, (veritys / BG_COST) * 100) + "%";
  $("bgProgTxt").textContent =
    veritys >= BG_COST ? "¡Ya te alcanza!" : veritys + " de " + BG_COST + " Veritys";
  $("bgBuyBtn").disabled = veritys < BG_COST;

  const bgPreview = $("bgPrev");
  bgPreview.style.backgroundImage = pageBg ? 'url("' + pageBg.src + '")' : "";
}

function addVeritys(amount) {
  veritys += amount;
  try { localStorage.setItem("elb_v", String(veritys)); } catch (e) {}
  updateShop();
}

// Comprar el permiso de poner tu imagen
$("buyBtn").onclick = () => {
  if (veritys < SKIN_COST) {
    $("shopMsg").textContent = "Te faltan " + (SKIN_COST - veritys) + " Veritys.";
    return;
  }

  veritys -= SKIN_COST;
  skinOwned = true;
  try {
    localStorage.setItem("elb_v", String(veritys));
    localStorage.setItem("elb_own", "1");
  } catch (e) {}

  $("shopMsg").textContent = "Comprado. Ahora elige tu imagen.";
  updateShop();
};

// Elegir imagen: se recorta a la forma del rectángulo y se guarda
$("imgIn").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 184;
      c.height = 88;

      const scale = Math.max(184 / img.width, 88 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      c.getContext("2d").drawImage(img, (184 - w) / 2, (88 - h) / 2, w, h);

      const url = c.toDataURL("image/jpeg", 0.85);
      playerSkin = new Image();
      playerSkin.src = url;
      try { localStorage.setItem("elb_skin", url); } catch (err) {}

      $("shopMsg").textContent = "Imagen puesta.";
      updateShop();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
};

// Quitar la imagen y volver al rectángulo azul
$("clrBtn").onclick = () => {
  playerSkin = null;
  try { localStorage.removeItem("elb_skin"); } catch (e) {}
  $("shopMsg").textContent = "Imagen quitada.";
  updateShop();
};


// Comprar el permiso de cambiar el fondo de atrás
$("bgBuyBtn").onclick = () => {
  if (veritys < BG_COST) {
    $("shopMsg").textContent = "Te faltan " + (BG_COST - veritys) + " Veritys.";
    return;
  }

  veritys -= BG_COST;
  bgOwned = true;
  try {
    localStorage.setItem("elb_v", String(veritys));
    localStorage.setItem("elb_bgown", "1");
  } catch (e) {}

  $("shopMsg").textContent = "Comprado. Ahora elige tu fondo.";
  updateShop();
};

// Elegir fondo: se achica (máx. 1280 px) para que entre en el guardado
$("bgIn").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);

      const url = c.toDataURL("image/jpeg", 0.8);
      const next = new Image();
      next.onload = () => {
        pageBg = next;
        drawPageCity();
        updateShop();
      };
      next.src = url;

      let saved = true;
      try { localStorage.setItem("elb_bg", url); } catch (err) { saved = false; }
      $("shopMsg").textContent = saved
        ? "Fondo puesto."
        : "Fondo puesto, pero es muy pesado y no se va a guardar al cerrar.";
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
};

// Quitar el fondo y volver a la ciudad
$("bgClrBtn").onclick = () => {
  pageBg = null;
  try { localStorage.removeItem("elb_bg"); } catch (e) {}
  $("shopMsg").textContent = "Fondo quitado.";
  drawPageCity();
  updateShop();
};


/* ---------- 15. Arranque ---------- */

// Bucle principal: se repite en cada cuadro
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// Crea las hojas y los edificios del fondo del juego
function createBackground() {
  for (let i = 0; i < 14; i++) {
    papers.push({
      x: Math.random() * W,
      y: Math.random() * H,
      size: Math.random() * 8 + 9,
      speed: Math.random() * 30 + 25,
      rot: Math.random() * 6,
      rotSpeed: (Math.random() - 0.5) * 1.5
    });
  }

  for (let x = -10; x < W; ) {
    const w = 36 + Math.random() * 30;
    const h = 110 + Math.random() * 190;
    const cols = Math.floor(w / 12);
    const rows = Math.floor(h / 16);

    buildings.push({
      x,
      w,
      h,
      cols,
      lights: Array.from({ length: cols * rows }, () => Math.random() < 0.32)
    });
    x += w + 4;
  }
}

// Lee lo que quedó guardado en el navegador
function loadSavedData() {
  try {
    bestScore = Number(localStorage.getItem(BEST_KEY) || 0);
    localRanking = JSON.parse(localStorage.getItem("elb_rank") || "[]");
    veritys = Number(localStorage.getItem("elb_v") || 0);
    skinOwned = localStorage.getItem("elb_own") === "1";

    bgOwned = localStorage.getItem("elb_bgown") === "1";
    const savedBg = localStorage.getItem("elb_bg");
    if (savedBg) {
      pageBg = new Image();
      pageBg.onload = drawPageCity;   // cuando cargue, redibuja el fondo
      pageBg.src = savedBg;
    }

    const savedSkin = localStorage.getItem("elb_skin");
    if (savedSkin) {
      playerSkin = new Image();
      playerSkin.src = savedSkin;
    }
  } catch (e) {
    // si el navegador no deja guardar, se empieza de cero
  }
}

loadSavedData();
createBackground();
drawPageCity();
addEventListener("resize", drawPageCity);

showLocalRanking();
connectSharedRanking();
updateShop();
updateHud();
requestAnimationFrame(loop);
