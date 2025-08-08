(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // UI Elements
  const woodEl = document.getElementById('woodCount');
  const stoneEl = document.getElementById('stoneCount');
  const btnGatherer = document.getElementById('btnGatherer');
  const btnWarrior = document.getElementById('btnWarrior');
  const btnDefender = document.getElementById('btnDefender');

  // Device pixel ratio handling
  let DPR = window.devicePixelRatio || 1;
  function resizeCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    DPR = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    // Enemy triangle
    ctx.shadowColor = 'rgba(255,90,90,0.55)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#771b1b';
    triangle(e.radius + 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    triangle(e.radius + 2); ctx.stroke();
    ctx.fillStyle = e.color;
    triangle(e.radius * 0.7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Game constants
  const COSTS = {
    gatherer: { wood: 50, stone: 0 },
    warrior: { wood: 70, stone: 30 },
    defender: { wood: 40, stone: 110 },
  };

  const UNIT_TEMPLATES = {
    gatherer: {
      speed: 1.6,
      radius: 10,
      color: '#82ffb0',
      hp: 40,
      carryCapacity: 25,
      harvestRate: 10, // per second
      attack: 0,
      range: 0,
      attackCooldown: 0,
    },
    warrior: {
      speed: 2.25,
      radius: 11,
      color: '#ff8c59',
      hp: 70,
      attack: 12,
      range: 18,
      attackCooldown: 0.5,
    },
    defender: {
      speed: 1.25,
      radius: 12,
      color: '#7fb0ff',
      hp: 120,
      armor: 0.4,
      attack: 8,
      range: 18,
      attackCooldown: 0.9,
    },
  };

  const RESOURCE_TEMPLATES = {
    tree: {
      color: '#7fff94',
      amount: 240,
      radius: 14,
    },
    rock: {
      color: '#c7d6ff',
      amount: 280,
      radius: 15,
    },
  };

  const Game = {
    time: 0,
    wood: 100,
    stone: 60,
    world: { w: 3000, h: 2000 },
    cam: { x: 0, y: 0, speed: 520 },
    units: [],
    enemies: [],
    resources: [], // {id, type, x,y, amount, radius}
    pings: [], // visual command pings
    fort: { x: 160, y: 0, w: 64, h: 64, hp: 500, maxHp: 500 },
    nextId: 1,
    selection: new Set(),
    nextWaveAt: 6, // seconds
    gameOver: false,
  };

  function updateResourceUI() {
    woodEl.textContent = Math.max(0, Math.floor(Game.wood)).toString();
    stoneEl.textContent = Math.max(0, Math.floor(Game.stone)).toString();
  }

  // Initialize fort position in world
  Game.fort.y = Math.floor(Game.world.h / 2);
  // Center camera on fort initially
  {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    Game.cam.x = clamp(Game.fort.x - vw * 0.5, 0, Math.max(0, Game.world.w - vw));
    Game.cam.y = clamp(Game.fort.y - vh * 0.5, 0, Math.max(0, Game.world.h - vh));
  }

  // Helpers
  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  // Enemy templates
  const ENEMY_TEMPLATES = {
    raider: { speed: 1.8, radius: 11, color: '#ff5a5a', hp: 60, attack: 9, range: 18, attackCooldown: 0.7 }
  };

  // Spawn initial resources across world
  function placeResources() {
    const W = Game.world.w;
    const H = Game.world.h;

    const tries = 70;
    for (let i = 0; i < tries; i++) {
      const type = Math.random() < 0.58 ? 'tree' : 'rock';
      const tmpl = RESOURCE_TEMPLATES[type];
      const margin = 80;
      const x = clamp(Math.random() * (W - 120) + 60, 60, W - 60);
      const y = clamp(Math.random() * (H - 120) + 60, 60, H - 60);

      // Avoid overlapping fort area
      const cx = Game.fort.x, cy = Game.fort.y;
      if (Math.abs(x - cx) < 140 && Math.abs(y - cy) < 140) continue;

      Game.resources.push({
        id: Game.nextId++,
        type,
        x, y,
        amount: tmpl.amount,
        radius: tmpl.radius,
      });
    }
  }
  placeResources();

  // Spawn initial units (one gatherer to begin)
  function spawnUnit(type, x, y) {
    const t = UNIT_TEMPLATES[type];
    const id = Game.nextId++;
    const u = {
      id,
      type,
      x, y,
      vx: 0, vy: 0,
      speed: t.speed,
      radius: t.radius,
      color: t.color,
      hp: t.hp,
      armor: t.armor || 0,
      attack: t.attack || 0,
      range: t.range || 0,
      attackCooldown: t.attackCooldown || 0,
      atkTimer: 0,
      selected: false,
      state: 'idle', // idle | move | gather | return
      moveTarget: null, // {x,y}
      gatherTargetId: null, // resource id
      carrying: 0,
      carryingType: null,
      carryCapacity: t.carryCapacity || 0,
      harvestRate: t.harvestRate || 0,
      faction: 'player',
    };
    Game.units.push(u);
    return u;
  }

  function spawnEnemy(type, x, y) {
    const t = ENEMY_TEMPLATES[type];
    const id = Game.nextId++;
    const e = {
      id,
      type,
      x, y,
      vx: 0, vy: 0,
      speed: t.speed,
      radius: t.radius,
      color: t.color,
      hp: t.hp,
      armor: 0,
      attack: t.attack,
      range: t.range,
      attackCooldown: t.attackCooldown,
      atkTimer: 0,
      targetUnitId: null,
    };
    Game.enemies.push(e);
    return e;
  }

  function canAfford(type) {
    const c = COSTS[type];
    return Game.wood >= c.wood && Game.stone >= c.stone;
  }
  function payCost(type) {
    const c = COSTS[type];
    Game.wood -= c.wood;
    Game.stone -= c.stone;
    updateResourceUI();
  }

  function trainUnit(type) {
    if (!canAfford(type)) return false;
    payCost(type);
    // Spawn near fort with small jitter
    const angle = Math.random() * Math.PI * 2;
    const r = 24 + Math.random() * 12;
    const sx = Game.fort.x + Math.cos(angle) * r;
    const sy = Game.fort.y + Math.sin(angle) * r;
    spawnUnit(type, sx, sy);
    // visual ping
    Game.pings.push({ x: sx, y: sy, age: 0, max: 0.5, color: '#99b8ff' });
    return true;
  }

  // Hook up buttons
  btnGatherer.addEventListener('click', () => { trainUnit('gatherer'); });
  btnWarrior.addEventListener('click', () => { trainUnit('warrior'); });
  btnDefender.addEventListener('click', () => { trainUnit('defender'); });

  // Begin with one gatherer
  spawnUnit('gatherer', Game.fort.x + 48, Game.fort.y);
  updateResourceUI();

  // Input handling
  canvas.style.cursor = 'crosshair';
  const keys = Object.create(null);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k === 'arrowup' || k === 'arrowleft' || k === 'arrowdown' || k === 'arrowright') {
      keys[k] = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (keys[k]) keys[k] = false;
  });

  function screenToWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) + Game.cam.x,
      y: (e.clientY - rect.top) + Game.cam.y,
    };
  }

  function pickUnitAt(pt) {
    // Return closest unit within radius threshold
    let best = null;
    let bestD = Infinity;
    for (const u of Game.units) {
      const dx = pt.x - u.x;
      const dy = pt.y - u.y;
      const d = Math.hypot(dx, dy);
      if (d <= u.radius + 6 && d < bestD) { best = u; bestD = d; }
    }
    return best;
  }

  function findResourceAt(pt) {
    for (const r of Game.resources) {
      const dx = pt.x - r.x;
      const dy = pt.y - r.y;
      const d = Math.hypot(dx, dy);
      if (d <= r.radius + 10) return r;
    }
    return null;
  }

  function clearSelection() {
    for (const u of Game.units) u.selected = false;
    Game.selection.clear();
  }

  function addToSelection(u) {
    if (!u) return;
    u.selected = true;
    Game.selection.add(u.id);
  }

  function issueMoveCommand(pt) {
    for (const u of Game.units) if (u.selected) {
      u.state = 'move';
      u.moveTarget = { x: pt.x, y: pt.y };
      u.gatherTargetId = null;
    }
    Game.pings.push({ x: pt.x, y: pt.y, age: 0, max: 0.6, color: '#74a2ff' });
  }

  function issueGatherCommand(resource) {
    // Assign only to selected gatherers
    for (const u of Game.units) if (u.selected && u.type === 'gatherer') {
      u.gatherTargetId = resource.id;
      u.state = 'gather';
      u.moveTarget = { x: resource.x, y: resource.y };
    }
    Game.pings.push({ x: resource.x, y: resource.y, age: 0, max: 0.6, color: '#7fff94' });
  }

  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });

  canvas.addEventListener('mousedown', (e) => {
    const pt = screenToWorld(e);

    // Right click or Alt+Left-click => command
    if (e.button === 2 || (e.button === 0 && (e.altKey || e.metaKey))) {
      const res = findResourceAt(pt);
      if (res) issueGatherCommand(res); else issueMoveCommand(pt);
      return;
    }

    // Left click => select
    if (e.button === 0) {
      const u = pickUnitAt(pt);
      if (!e.shiftKey) clearSelection();
      if (u) addToSelection(u);
    }
  });

  // Physics and AI
  function stepUnit(u, dt) {
    const speed = u.speed;

    if (u.state === 'move' && u.moveTarget) {
      const dx = u.moveTarget.x - u.x;
      const dy = u.moveTarget.y - u.y;
      const d = Math.hypot(dx, dy);
      if (d > 2) {
        u.vx = (dx / d) * speed;
        u.vy = (dy / d) * speed;
        u.x += u.vx * dt * 60;
        u.y += u.vy * dt * 60;
      } else {
        u.state = 'idle';
        u.moveTarget = null;
        u.vx = u.vy = 0;
      }
    }

    if (u.type === 'gatherer') {
      // Gathering behavior
      if (u.state === 'gather') {
        // If resource missing, return to base if carrying, else idle
        const res = Game.resources.find(r => r.id === u.gatherTargetId);
        if (!res || res.amount <= 0) {
          if (u.carrying > 0) {
            u.state = 'return';
            u.moveTarget = { x: Game.fort.x, y: Game.fort.y };
          } else {
            u.state = 'idle';
            u.gatherTargetId = null;
          }
        } else {
          // Move towards resource, then harvest
          const dx = res.x - u.x;
          const dy = res.y - u.y;
          const d = Math.hypot(dx, dy);
          if (d > res.radius + 6) {
            u.vx = (dx / d) * u.speed;
            u.vy = (dy / d) * u.speed;
            u.x += u.vx * dt * 60;
            u.y += u.vy * dt * 60;
          } else {
            // harvest
            if (u.carrying < u.carryCapacity && res.amount > 0) {
              const amount = u.harvestRate * dt;
              const take = Math.min(amount, res.amount, u.carryCapacity - u.carrying);
              if (take > 0) { u.carryingType = res.type; }
              u.carrying += take;
              res.amount -= take;
            }
            if (u.carrying >= u.carryCapacity || res.amount <= 0) {
              u.state = 'return';
              u.moveTarget = { x: Game.fort.x, y: Game.fort.y };
            }
          }
        }
      } else if (u.state === 'return') {
        const dx = Game.fort.x - u.x;
        const dy = Game.fort.y - u.y;
        const d = Math.hypot(dx, dy);
        if (d > (Game.fort.w * 0.3 + 8)) {
          u.vx = (dx / d) * u.speed;
          u.vy = (dy / d) * u.speed;
          u.x += u.vx * dt * 60;
          u.y += u.vy * dt * 60;
        } else {
          // Deposit
          if (u.carrying > 0) {
            if (u.carryingType === 'rock') Game.stone += u.carrying; else Game.wood += u.carrying;
            updateResourceUI();
          }
          u.carrying = 0;
          u.carryingType = null;
          if (u.gatherTargetId) {
            const res = Game.resources.find(r => r.id === u.gatherTargetId);
            if (res && res.amount > 0) {
              u.state = 'gather';
              u.moveTarget = { x: res.x, y: res.y };
            } else {
              u.state = 'idle';
              u.moveTarget = null;
              u.gatherTargetId = null;
            }
          } else {
            u.state = 'idle';
            u.moveTarget = null;
          }
        }
      }
    }

    // Gentle separation to avoid stacking
    for (const v of Game.units) {
      if (v === u) continue;
      const dx = u.x - v.x;
      const dy = u.y - v.y;
      const d = Math.hypot(dx, dy);
      const minDist = (u.radius + v.radius) * 0.9;
      if (d > 0 && d < minDist) {
        const push = (minDist - d) * 0.01;
        u.x += (dx / d) * push * 60 * (u.selected ? 1.2 : 1);
        u.y += (dy / d) * push * 60 * (u.selected ? 1.2 : 1);
      }
    }

    // Keep in world
    const W = Game.world.w;
    const H = Game.world.h;
    u.x = clamp(u.x, 8, W - 8);
    u.y = clamp(u.y, 8, H - 8);
  }

  function cleanupResources() {
    Game.resources = Game.resources.filter(r => r.amount > 0.1);
  }

  // Enemy behavior
  function stepEnemy(e, dt) {
    // Choose target: nearest player unit within 220, else fort
    let target = null;
    let td = Infinity;
    for (const u of Game.units) {
      const d = Math.hypot(u.x - e.x, u.y - e.y);
      if (d < td) { td = d; target = u; }
    }
    const pursueUnit = target && td < 220;
    const tx = pursueUnit ? target.x : Game.fort.x;
    const ty = pursueUnit ? target.y : Game.fort.y;

    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d > e.range + 2) {
      e.vx = (dx / d) * e.speed;
      e.vy = (dy / d) * e.speed;
      e.x += e.vx * dt * 60;
      e.y += e.vy * dt * 60;
    }

    // Attack if in range
    e.atkTimer -= dt;
    const inRangeFort = Math.hypot(Game.fort.x - e.x, Game.fort.y - e.y) <= e.range + (Game.fort.w * 0.3);
    if (pursueUnit && td <= e.range + 2) {
      if (e.atkTimer <= 0) {
        // deal damage to target
        const mult = 1 - (target.armor || 0);
        target.hp -= e.attack * mult;
        e.atkTimer = e.attackCooldown;
      }
    } else if (inRangeFort) {
      if (e.atkTimer <= 0) {
        Game.fort.hp -= e.attack;
        e.atkTimer = e.attackCooldown;
        if (Game.fort.hp <= 0) Game.gameOver = true;
      }
    }

    // Keep in world
    e.x = clamp(e.x, 8, Game.world.w - 8);
    e.y = clamp(e.y, 8, Game.world.h - 8);
  }

  function removeDead() {
    Game.units = Game.units.filter(u => u.hp > 0);
    Game.enemies = Game.enemies.filter(e => e.hp > 0);
  }

  function stepPlayerCombat(dt) {
    for (const u of Game.units) {
      if ((u.attack || 0) <= 0) continue;
      // Find nearest enemy
      let best = null, bd = Infinity;
      for (const e of Game.enemies) {
        const d = Math.hypot(e.x - u.x, e.y - u.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) continue;

      // If within extended perceive range, optionally chase when idle
      if (bd < 200 && u.state !== 'gather' && u.state !== 'return') {
        if (bd > u.range + 2 && (!u.moveTarget || Math.hypot(u.moveTarget.x - best.x, u.moveTarget.y - best.y) > 6)) {
          u.state = 'move';
          u.moveTarget = { x: best.x, y: best.y };
        }
      }

      // Attack if in range
      u.atkTimer = Math.max(0, (u.atkTimer || 0) - dt);
      if (bd <= u.range + 2 && u.atkTimer <= 0) {
        const damage = (u.attack || 0);
        best.hp -= damage;
        u.atkTimer = u.attackCooldown || 0.8;
      }
    }
  }

  // Render helpers
  function drawFort() {
    const { x, y, w, h } = Game.fort;
    ctx.save();
    ctx.translate(x, y);
    // Glow
    ctx.shadowColor = 'rgba(120,160,255,0.7)';
    ctx.shadowBlur = 18;
    // Base body
    ctx.fillStyle = '#1e2b54';
    roundRect(ctx, -w/2, -h/2, w, h, 10);
    ctx.fill();
    // Door
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2f417e';
    roundRect(ctx, -10, h/2 - 24, 20, 18, 4);
    ctx.fill();
    // Banner
    ctx.fillStyle = '#5a78ff';
    ctx.fillRect(w/2 - 10, -h/2 - 20, 6, 20);
    ctx.fillStyle = '#9ab2ff';
    ctx.beginPath();
    ctx.moveTo(w/2 - 4, -h/2 - 20);
    ctx.lineTo(w/2 + 6, -h/2 - 20);
    ctx.lineTo(w/2 + 1, -h/2 - 6);
    ctx.closePath();
    ctx.fill();
    // HP bar
    ctx.shadowBlur = 0;
    const frac = clamp(Game.fort.hp / Game.fort.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -w/2, -h/2 - 16, w, 8, 4); ctx.fill();
    ctx.fillStyle = '#8ef7b8';
    roundRect(ctx, -w/2, -h/2 - 16, w * frac, 8, 4); ctx.fill();
    ctx.restore();
  }

  function drawResource(r) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.shadowColor = r.type === 'tree' ? 'rgba(120,255,170,0.55)' : 'rgba(200,220,255,0.55)';
    ctx.shadowBlur = 16;
    if (r.type === 'tree') {
      // Tree: simple circle
      ctx.fillStyle = '#2a8554';
      circle(ctx, 0, 0, r.radius);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      circle(ctx, 0, 0, r.radius); ctx.stroke();
      ctx.fillStyle = '#74f7a1';
      circle(ctx, -4, -3, r.radius * 0.6);
      ctx.fill();
    } else {
      // Rock: polygon
      ctx.fillStyle = '#b0c2ea';
      polygon(6, r.radius);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      polygon(6, r.radius); ctx.stroke();
      ctx.fillStyle = '#e2e8ff';
      polygon(6, r.radius * 0.6);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // Resource bar
    const frac = clamp(r.amount / RESOURCE_TEMPLATES[r.type].amount, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, -18, r.radius + 8, 36, 6, 3); ctx.fill();
    ctx.fillStyle = r.type === 'tree' ? '#80ffaf' : '#cbd6ff';
    roundRect(ctx, -18, r.radius + 8, 36 * frac, 6, 3); ctx.fill();
    ctx.restore();
  }

  function drawUnit(u) {
    ctx.save();
    ctx.translate(u.x, u.y);

    // Selection ring
    if (u.selected) {
      ctx.strokeStyle = 'rgba(140,180,255,0.9)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(120,160,255,0.6)';
      ctx.shadowBlur = 12;
      circle(ctx, 0, 0, u.radius + 6);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Unit body with glow
    ctx.shadowColor = glowColorFor(u.type);
    ctx.shadowBlur = 14;

    if (u.type === 'gatherer') {
      ctx.fillStyle = '#2a8554';
      circle(ctx, 0, 0, u.radius);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      circle(ctx, 0, 0, u.radius); ctx.stroke();
      ctx.fillStyle = u.color;
      circle(ctx, -3, -3, u.radius * 0.6);
      ctx.fill();
    } else if (u.type === 'warrior') {
      ctx.fillStyle = '#a3471f';
      triangle(u.radius + 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      triangle(u.radius + 2); ctx.stroke();
      ctx.fillStyle = u.color;
      triangle(u.radius * 0.7);
      ctx.fill();
    } else if (u.type === 'defender') {
      ctx.fillStyle = '#1b2d59';
      roundRect(ctx, -u.radius, -u.radius, u.radius*2, u.radius*2, 5);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, -u.radius, -u.radius, u.radius*2, u.radius*2, 5); ctx.stroke();
      ctx.fillStyle = u.color;
      roundRect(ctx, -u.radius*0.6, -u.radius*0.6, u.radius*1.2, u.radius*1.2, 3);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // Carry indicator for gatherers
    if (u.type === 'gatherer' && u.carryCapacity > 0) {
      const frac = clamp(u.carrying / u.carryCapacity, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, -12, u.radius + 8, 24, 5, 2);
      ctx.fill();
      ctx.fillStyle = '#8ef7b8';
      roundRect(ctx, -12, u.radius + 8, 24 * frac, 5, 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPings(dt) {
    for (const p of Game.pings) {
      p.age += dt;
    }
    Game.pings = Game.pings.filter(p => p.age < p.max);
    for (const p of Game.pings) {
      const t = p.age / p.max;
      const r = 10 + t * 26;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 14;
      circle(ctx, p.x, p.y, r);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Primitives
  function circle(c, x, y, r) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.closePath();
  }
  function triangle(csize) {
    ctx.beginPath();
    ctx.moveTo(0, -csize);
    ctx.lineTo(csize * 0.86, csize * 0.6);
    ctx.lineTo(-csize * 0.86, csize * 0.6);
    ctx.closePath();
  }
  function polygon(corners, radius) {
    ctx.beginPath();
    for (let i = 0; i < corners; i++) {
      const a = (i / corners) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }
  function glowColorFor(type) {
    if (type === 'gatherer') return 'rgba(130,255,176,0.55)';
    if (type === 'warrior') return 'rgba(255,140,89,0.55)';
    return 'rgba(130,170,255,0.55)';
  }

  // Main loop
  let last = 0;
  function update(ts) {
    const dt = Math.min(0.033, (ts - last) / 1000 || 0.016);
    last = ts;
    Game.time += dt;

    // Camera movement (WASD / Arrows)
    const W = window.innerWidth, H = window.innerHeight;
    let cx = 0, cy = 0;
    if (keys['w'] || keys['arrowup']) cy -= 1;
    if (keys['s'] || keys['arrowdown']) cy += 1;
    if (keys['a'] || keys['arrowleft']) cx -= 1;
    if (keys['d'] || keys['arrowright']) cx += 1;
    if (cx !== 0 || cy !== 0) {
      const len = Math.hypot(cx, cy) || 1;
      Game.cam.x += (cx/len) * Game.cam.speed * dt;
      Game.cam.y += (cy/len) * Game.cam.speed * dt;
      Game.cam.x = clamp(Game.cam.x, 0, Math.max(0, Game.world.w - W));
      Game.cam.y = clamp(Game.cam.y, 0, Math.max(0, Game.world.h - H));
    }

    // Update units
    for (const u of Game.units) stepUnit(u, dt);
    // Update enemies
    for (const e of Game.enemies) stepEnemy(e, dt);

    // Combat
    stepPlayerCombat(dt);
    removeDead();
    cleanupResources();

    // Spawn waves
    if (!Game.gameOver) {
      if (Game.time >= Game.nextWaveAt) {
        // spawn a small wave
        const count = 3 + Math.floor(Game.time / 45);
        for (let i = 0; i < count; i++) {
          const x = Game.world.w - 160 + Math.random() * 40;
          const y = 120 + Math.random() * (Game.world.h - 240);
          spawnEnemy('raider', x, y);
        }
        Game.nextWaveAt = Game.time + Math.max(12, 22 - Math.floor(Game.time / 30));
      }
    }

    // Render
    render(dt);

    requestAnimationFrame(update);
  }

  function render(dt) {
    const W = window.innerWidth;
    const H = window.innerHeight;

    ctx.clearRect(0, 0, W, H);

    // World space
    ctx.save();
    ctx.translate(-Game.cam.x, -Game.cam.y);

    // Subtle grid aligned to world
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#7da0ff';
    ctx.lineWidth = 1;
    const spacing = 64;
    const left = Game.cam.x;
    const right = Game.cam.x + W;
    const top = Game.cam.y + 80; // leave HUD area clean
    const bottom = Game.cam.y + H;
    let x0 = Math.floor(left / spacing) * spacing;
    let y0 = Math.floor(top / spacing) * spacing;
    for (let x = x0; x <= right; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, top); ctx.lineTo(x + 0.5, bottom); ctx.stroke();
    }
    for (let y = y0; y <= bottom; y += spacing) {
      ctx.beginPath(); ctx.moveTo(left, y + 0.5); ctx.lineTo(right, y + 0.5); ctx.stroke();
    }
    ctx.restore();

    // Fort
    drawFort();
    // Resources
    for (const r of Game.resources) drawResource(r);
    // Units (player)
    for (const u of Game.units) drawUnit(u);
    // Enemies
    for (const e of Game.enemies) drawEnemy(e);
    // Pings
    drawPings(dt);

    ctx.restore();

    // Game over overlay
    if (Game.gameOver) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffd1d1';
      ctx.font = 'bold 28px Montserrat, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Fort destroyed! Refresh to restart.', W/2, H/2);
      ctx.restore();
    }
  }

  requestAnimationFrame(update);

  // On resize, keep camera within world
  window.addEventListener('resize', () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    Game.cam.x = clamp(Game.cam.x, 0, Math.max(0, Game.world.w - W));
    Game.cam.y = clamp(Game.cam.y, 0, Math.max(0, Game.world.h - H));
  });
})();
