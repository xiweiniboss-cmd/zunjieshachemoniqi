/** Original, self-contained scenery for the REDLINE braking challenge. */
export class TrackScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.lastTravel = 0;
    this.grain = this.makeGrain();
    this.resize();
  }

  makeGrain() {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const ctx = tile.getContext('2d');
    const pixels = ctx.createImageData(128, 128);
    let seed = 721369;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = 34 + (seed >>> 25);
      pixels.data[i] = n;
      pixels.data[i + 1] = n + 2;
      pixels.data[i + 2] = n + 4;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return tile;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || window.innerWidth);
    const height = Math.max(1, rect.height || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width === this.width && height === this.height && dpr === this.dpr) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.asphaltPattern = this.ctx.createPattern(this.grain, 'repeat');
  }

  render(snapshot = {}, timeSeconds = 0) {
    this.resize();
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const mobile = w < 700;
    const horizon = h * (mobile ? 0.38 : 0.425);
    const travel = snapshot.paused ? this.lastTravel : Number(snapshot.travel) || 0;
    this.lastTravel = travel;
    const active = ['accelerating', 'braking'].includes(snapshot.phase) && !snapshot.paused;
    const danger = active && snapshot.force >= 1450;
    const tremor = danger ? Math.min(2.2, (snapshot.force - 1400) / 120) : 0;
    ctx.save();
    ctx.translate(Math.sin(timeSeconds * 67) * tremor, Math.cos(timeSeconds * 49) * tremor * 0.65);
    this.drawSky(w, h, horizon, mobile);
    this.drawTrack(w, h, horizon, travel, snapshot.speed || 0, mobile);
    this.drawCockpit(w, h, snapshot.force || 0, mobile);
    ctx.restore();

    // A restrained filmic vignette keeps the glass bright and the controls readable.
    const vignette = ctx.createRadialGradient(w * 0.5, h * 0.36, w * 0.12, w * 0.5, h * 0.5, Math.max(w, h) * 0.68);
    vignette.addColorStop(0, 'rgba(1,5,9,0)');
    vignette.addColorStop(0.7, 'rgba(1,5,9,0.08)');
    vignette.addColorStop(1, 'rgba(1,5,9,0.58)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  drawSky(w, h, horizon, mobile) {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + 90);
    sky.addColorStop(0, '#14232d');
    sky.addColorStop(0.4, '#31424a');
    sky.addColorStop(0.77, '#79685d');
    sky.addColorStop(1, '#c49370');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    if (this.duskBackdropKey !== `${w}:${h}`) {
      this.duskBackdrop = this.makeDuskBackdrop(w, h, horizon);
      this.duskBackdropKey = `${w}:${h}`;
    }
    ctx.drawImage(this.duskBackdrop, 0, 0, w, horizon + 70);

    // Landscape silhouettes at the track edge connect the mountains and road.
    const verge = ctx.createLinearGradient(0, horizon, 0, h);
    verge.addColorStop(0, '#33433f');
    verge.addColorStop(0.25, '#24332e');
    verge.addColorStop(1, '#111d1b');
    ctx.fillStyle = verge;
    ctx.fillRect(0, horizon + 2, w, h - horizon);
    const haze = ctx.createLinearGradient(0, horizon - 8, 0, horizon + 55);
    haze.addColorStop(0, 'rgba(199,166,133,0.2)');
    haze.addColorStop(1, 'rgba(132,133,121,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 8, w, 65);

    if (!mobile) {
      // A line of distant cypress trees; no distracting objects enter the roadway.
      ctx.fillStyle = '#243631';
      for (let i = 0; i < 38; i++) {
        const x = (i / 37) * w;
        if (Math.abs(x - w * 0.5) < w * 0.11) continue;
        const size = 9 + Math.sin(i * 2.7) * 4;
        ctx.beginPath();
        ctx.moveTo(x, horizon - size);
        ctx.lineTo(x + size * 0.25, horizon + 6);
        ctx.lineTo(x - size * 0.3, horizon + 6);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  makeDuskBackdrop(w, h, horizon) {
    // Cached atmosphere and seeded ridge detail remain perfectly still while paused.
    const texture = document.createElement('canvas');
    const scale = Math.min(this.dpr, 1.5);
    texture.width = Math.ceil(w * scale);
    texture.height = Math.ceil((horizon + 70) * scale);
    const ctx = texture.getContext('2d');
    ctx.scale(scale, scale);
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + 30);
    sky.addColorStop(0, '#243744');
    sky.addColorStop(0.36, '#455461');
    sky.addColorStop(0.67, '#928477');
    sky.addColorStop(0.87, '#bc9876');
    sky.addColorStop(1, '#b7a78a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 70);
    const sunX = w * 0.2;
    const sunY = horizon - h * 0.15;
    const glow = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, Math.max(w * 0.31, h * 0.28));
    glow.addColorStop(0, 'rgba(255,192,107,0.72)');
    glow.addColorStop(0.11, 'rgba(251,172,95,0.51)');
    glow.addColorStop(0.43, 'rgba(235,131,76,0.25)');
    glow.addColorStop(1, 'rgba(222,128,79,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, horizon + 50);
    ctx.beginPath();
    ctx.arc(sunX, sunY, Math.max(7, h * 0.012), 0, Math.PI * 2);
    ctx.fillStyle = '#ffd29b';
    ctx.fill();

    // Elongated, translucent cloud bands give the broad sky layered depth.
    for (let layer = 0; layer < 9; layer++) {
      const y = horizon * (0.16 + layer * 0.081);
      const cloud = ctx.createLinearGradient(0, y - 7, 0, y + 24);
      cloud.addColorStop(0, 'rgba(64,75,89,0)');
      cloud.addColorStop(0.28, `rgba(63,73,85,${0.06 + layer * 0.009})`);
      cloud.addColorStop(0.55, 'rgba(214,175,143,0.10)');
      cloud.addColorStop(1, 'rgba(165,141,123,0)');
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.moveTo(-30, y);
      ctx.bezierCurveTo(w * 0.22, y - 14 + layer * 2, w * 0.39, y + 14, w * 0.61, y - 6);
      ctx.bezierCurveTo(w * 0.8, y - 18, w * 0.95, y + 2, w + 30, y - 2);
      ctx.lineTo(w + 30, y + 27);
      ctx.bezierCurveTo(w * 0.6, y + 12, w * 0.2, y + 26, -30, y + 18);
      ctx.closePath();
      ctx.fill();
    }

    this.mountain(ctx, w, h, horizon, 0.13, ['#858282', '#707777'], 31, true);
    this.mountain(ctx, w, h, horizon + 4, 0.094, ['#647174', '#465c62'], 59, true);
    this.mountain(ctx, w, h, horizon + 9, 0.045, ['#465b5a', '#2d4344'], 97, false);
    const haze = ctx.createLinearGradient(0, horizon - h * 0.035, 0, horizon + 20);
    haze.addColorStop(0, 'rgba(231,179,132,0)');
    haze.addColorStop(0.65, 'rgba(225,188,151,0.24)');
    haze.addColorStop(1, 'rgba(194,169,138,0.32)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - h * 0.04, w, h * 0.08);
    return texture;
  }

  mountain(ctx, w, h, horizon, heightRatio, colors, seed, facets) {
    const ridge = [];
    const count = 240;
    let random = seed;
    const next = () => {
      random = (random * 1664525 + 1013904223) >>> 0;
      return random / 4294967296;
    };
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const alpine = Math.exp(-(((t - 0.055) / 0.085) ** 2)) * 0.75
        + Math.exp(-(((t - 0.335) / 0.09) ** 2)) * 0.9
        + Math.exp(-(((t - 0.78) / 0.15) ** 2)) * 1.15
        + Math.exp(-(((t - 0.955) / 0.09) ** 2)) * 0.7;
      const detail = Math.sin(t * 57 + seed) * 0.13 + Math.sin(t * 137 + seed) * 0.052 + (next() - 0.5) * 0.05;
      ridge.push({ x: t * w, y: horizon - h * heightRatio * Math.max(0.14, 0.32 + alpine + detail) });
    }
    ctx.beginPath();
    ctx.moveTo(0, horizon + 20);
    ridge.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(w, horizon + 25);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, horizon - h * heightRatio * 1.6, 0, horizon + 20);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (facets) {
      for (let i = 5; i < count - 5; i += 9) {
        const peak = ridge[i];
        const reach = 20 + next() * 35;
        const depth = Math.min(h * 0.12, (horizon - peak.y) * 0.9);
        ctx.beginPath();
        ctx.moveTo(peak.x, peak.y);
        ctx.lineTo(peak.x + reach, peak.y + depth);
        ctx.lineTo(peak.x - reach * 0.18, peak.y + depth * 0.58);
        ctx.closePath();
        ctx.fillStyle = i % 3 ? 'rgba(42,64,72,0.14)' : 'rgba(232,213,185,0.19)';
        ctx.fill();
        if (horizon - peak.y > h * heightRatio * 0.8) {
          const snowDepth = Math.min(20, depth * 0.2);
          ctx.beginPath();
          ctx.moveTo(peak.x - 4, peak.y + 1);
          ctx.lineTo(peak.x + 4, peak.y - 1);
          ctx.lineTo(peak.x + reach * 0.2, peak.y + snowDepth);
          ctx.lineTo(peak.x + 2, peak.y + snowDepth * 0.51);
          ctx.lineTo(peak.x - reach * 0.15, peak.y + snowDepth * 0.9);
          ctx.closePath();
          ctx.fillStyle = 'rgba(235,217,198,0.35)';
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawTrack(w, h, horizon, travel, speed, mobile) {
    const ctx = this.ctx;
    const center = w * 0.5;
    const vanishingWidth = w * (mobile ? 0.048 : 0.027);
    const roadBottom = h + 120;
    const roadHalf = w * (mobile ? 1.25 : 0.88);
    const project = (distance, lane) => {
      const depth = 1 / (1 + distance * 0.065);
      return {
        x: center + lane * (vanishingWidth + roadHalf * depth),
        y: horizon + (roadBottom - horizon) * depth,
        depth,
      };
    };

    // Asphalt and gravel shoulder share a vanishing point, with the shoulder outside the road.
    ctx.beginPath();
    ctx.moveTo(center - vanishingWidth * 1.5, horizon);
    ctx.lineTo(center + vanishingWidth * 1.5, horizon);
    ctx.lineTo(center + roadHalf * 1.15, roadBottom);
    ctx.lineTo(center - roadHalf * 1.15, roadBottom);
    ctx.closePath();
    ctx.fillStyle = '#8b8478';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(center - vanishingWidth, horizon);
    ctx.lineTo(center + vanishingWidth, horizon);
    ctx.lineTo(center + roadHalf, roadBottom);
    ctx.lineTo(center - roadHalf, roadBottom);
    ctx.closePath();
    const asphalt = ctx.createLinearGradient(0, horizon, 0, h);
    asphalt.addColorStop(0, '#727370');
    asphalt.addColorStop(0.2, '#545c5d');
    asphalt.addColorStop(0.55, '#343e42');
    asphalt.addColorStop(1, '#20282e');
    ctx.fillStyle = asphalt;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.16;
    ctx.translate(0, travel % 128);
    ctx.fillStyle = this.asphaltPattern || '#3a4145';
    ctx.fillRect(0, -128, w, h + 256);
    ctx.restore();

    const sheen = ctx.createLinearGradient(center - w * 0.3, 0, center + w * 0.3, 0);
    sheen.addColorStop(0, 'rgba(5,10,15,0.11)');
    sheen.addColorStop(0.48, 'rgba(233,205,169,0.09)');
    sheen.addColorStop(1, 'rgba(5,10,15,0.13)');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center - vanishingWidth, horizon);
    ctx.lineTo(center + vanishingWidth, horizon);
    ctx.lineTo(center + roadHalf, roadBottom);
    ctx.lineTo(center - roadHalf, roadBottom);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = sheen;
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.restore();

    // Distance-space marks advance toward the viewer as total travelled metres increase.
    const offset = ((travel % 18) + 18) % 18;
    for (let i = 26; i >= -1; i--) {
      const distance = i * 18 + 18 - offset;
      if (distance < 1) continue;
      for (const lane of [-0.34, 0.34]) {
        this.roadQuad(project, distance, distance + 7, lane - 0.007, lane + 0.007, '#d1d0bf');
      }
    }
    for (const side of [-1, 1]) {
      this.roadQuad(project, 0, 520, side * 0.954, side * 0.972, '#d0cdc0');
      this.roadQuad(project, 0, 520, side * 1.018, side * 1.04, '#747c73');
      this.drawGuardrail(project, side, travel, horizon, mobile);
    }

    const fog = ctx.createLinearGradient(0, horizon, 0, horizon + h * 0.2);
    fog.addColorStop(0, 'rgba(169,162,145,0.31)');
    fog.addColorStop(0.5, 'rgba(131,140,134,0.07)');
    fog.addColorStop(1, 'rgba(110,122,118,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, horizon, w, h * 0.22);

    // Fine transverse texture hints at speed without producing continuous UI shake.
    if (speed > 30) {
      ctx.save();
      ctx.strokeStyle = `rgba(222,216,201,${Math.min(0.09, speed / 2100)})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        const d = 6 + i * 2 + ((travel * 0.6) % 2);
        const a = project(d, -0.78);
        const b = project(d + 0.01, 0.78);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  roadQuad(project, near, far, left, right, color) {
    const ctx = this.ctx;
    const a = project(near, left);
    const b = project(near, right);
    const c = project(far, right);
    const d = project(far, left);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  drawGuardrail(project, side, travel, horizon, mobile) {
    const ctx = this.ctx;
    const offset = ((travel % 13) + 13) % 13;
    const points = [];
    for (let i = 38; i >= 0; i--) {
      const distance = i * 13 + 13 - offset;
      if (distance <= 0) continue;
      const p = project(distance, side * 1.15);
      const height = 70 * p.depth;
      const width = Math.max(0.65, 11 * p.depth);
      ctx.fillStyle = '#4a5552';
      ctx.fillRect(p.x - width / 2, p.y - height, width, height + 10 * p.depth);
      ctx.fillStyle = '#b5b6a9';
      ctx.fillRect(p.x - width / 2, p.y - height, width * 0.36, height);
      if (i % 2 === 0) {
        ctx.fillStyle = '#dc835a';
        ctx.fillRect(p.x - width * 0.5, p.y - height - 3 * p.depth, width, Math.max(1, 9 * p.depth));
      }
      points.push({ x: p.x, y: p.y - height * 0.74, depth: p.depth });
    }
    if (points.length < 2) return;
    for (const layer of [0, 1]) {
      ctx.beginPath();
      points.forEach((p, i) => {
        const y = p.y + layer * 12 * p.depth;
        if (i === 0) ctx.moveTo(p.x, y); else ctx.lineTo(p.x, y);
      });
      ctx.strokeStyle = layer ? '#4d5956' : '#a3aca5';
      ctx.lineWidth = mobile ? 3 : 4;
      ctx.stroke();
    }
  }

  drawCockpit(w, h, force, mobile) {
    const ctx = this.ctx;
    const dashTop = mobile ? h * 0.66 : Math.max(h * 0.58, h - 320);

    // Windshield surround / A pillars.
    const pillar = ctx.createLinearGradient(0, 0, w * 0.19, 0);
    pillar.addColorStop(0, '#04080c');
    pillar.addColorStop(0.5, '#10191e');
    pillar.addColorStop(0.9, '#222b2e');
    pillar.addColorStop(1, '#080e12');
    ctx.fillStyle = pillar;
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(w * 0.025, -5);
    ctx.lineTo(w * (mobile ? 0.17 : 0.175), dashTop + 70);
    ctx.lineTo(w * 0.01, h);
    ctx.lineTo(-5, h);
    ctx.closePath();
    ctx.fill();
    const rightPillar = ctx.createLinearGradient(w, 0, w * 0.81, 0);
    rightPillar.addColorStop(0, '#04080c');
    rightPillar.addColorStop(0.5, '#10191e');
    rightPillar.addColorStop(0.9, '#222b2e');
    rightPillar.addColorStop(1, '#080e12');
    ctx.fillStyle = rightPillar;
    ctx.beginPath();
    ctx.moveTo(w + 5, -5);
    ctx.lineTo(w * 0.975, -5);
    ctx.lineTo(w * (mobile ? 0.83 : 0.825), dashTop + 70);
    ctx.lineTo(w * 0.99, h);
    ctx.lineTo(w + 5, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(159,172,176,0.16)';
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side === -1 ? w * 0.024 : w * 0.976, 0);
      ctx.lineTo(side === -1 ? w * 0.175 : w * 0.825, dashTop + 70);
      ctx.stroke();
    }

    // Leather dashboard, bowed gently up around the wheel binnacle.
    const dash = ctx.createLinearGradient(0, dashTop - 25, 0, h);
    dash.addColorStop(0, '#1b232a');
    dash.addColorStop(0.035, '#303940');
    dash.addColorStop(0.07, '#171f26');
    dash.addColorStop(0.4, '#111921');
    dash.addColorStop(1, '#080e14');
    ctx.beginPath();
    ctx.moveTo(-40, dashTop + 40);
    ctx.bezierCurveTo(w * 0.13, dashTop - 2, w * 0.25, dashTop + 4, w * 0.34, dashTop + 20);
    ctx.bezierCurveTo(w * 0.41, dashTop - 12, w * 0.59, dashTop - 12, w * 0.66, dashTop + 20);
    ctx.bezierCurveTo(w * 0.77, dashTop + 1, w * 0.87, dashTop - 2, w + 40, dashTop + 40);
    ctx.lineTo(w + 40, h + 20);
    ctx.lineTo(-40, h + 20);
    ctx.closePath();
    ctx.fillStyle = dash;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = this.asphaltPattern || '#27323a';
    ctx.fillRect(0, dashTop - 20, w, h - dashTop + 40);
    ctx.restore();

    const reflection = ctx.createLinearGradient(0, dashTop - 4, 0, dashTop + 50);
    reflection.addColorStop(0, 'rgba(199,187,164,0.19)');
    reflection.addColorStop(1, 'rgba(122,146,157,0)');
    ctx.strokeStyle = reflection;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, dashTop + 34);
    ctx.bezierCurveTo(w * 0.14, dashTop + 4, w * 0.26, dashTop + 14, w * 0.34, dashTop + 25);
    ctx.bezierCurveTo(w * 0.41, dashTop - 7, w * 0.59, dashTop - 7, w * 0.66, dashTop + 25);
    ctx.bezierCurveTo(w * 0.75, dashTop + 12, w * 0.87, dashTop + 3, w, dashTop + 34);
    ctx.stroke();

    // Stitched seams and subtle brushed trim frame the overlay controls.
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(149,164,170,0.22)';
    ctx.beginPath();
    ctx.moveTo(w * 0.015, dashTop + 54);
    ctx.bezierCurveTo(w * 0.15, dashTop + 22, w * 0.25, dashTop + 24, w * 0.32, dashTop + 39);
    ctx.moveTo(w * 0.68, dashTop + 39);
    ctx.bezierCurveTo(w * 0.75, dashTop + 24, w * 0.85, dashTop + 22, w * 0.985, dashTop + 54);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!mobile) {
      for (const side of [-1, 1]) {
        const x = side < 0 ? w * 0.205 : w * 0.795;
        this.drawVent(x, dashTop + 25, w * 0.068, 15);
      }
      const trim = ctx.createLinearGradient(0, h - 100, 0, h - 92);
      trim.addColorStop(0, '#4a565d');
      trim.addColorStop(0.2, '#788086');
      trim.addColorStop(0.45, '#28343c');
      trim.addColorStop(1, '#121b22');
      ctx.fillStyle = trim;
      ctx.fillRect(0, h - 100, w, 5);
      ctx.fillStyle = 'rgba(7,13,18,0.36)';
      ctx.fillRect(0, h - 92, w, 92);
    }

    this.drawWheel(w, h, mobile);

    // A very light cabin warning reflection accompanies the game's force warning.
    if (force >= 1450) {
      const warning = ctx.createRadialGradient(w * 0.82, h * 0.86, 0, w * 0.82, h * 0.86, w * 0.25);
      warning.addColorStop(0, 'rgba(223,91,51,0.08)');
      warning.addColorStop(1, 'rgba(223,91,51,0)');
      ctx.fillStyle = warning;
      ctx.fillRect(0, dashTop, w, h - dashTop);
    }
  }

  drawVent(x, y, width, height) {
    const ctx = this.ctx;
    ctx.fillStyle = '#03080c';
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y, width, height, 6);
    ctx.fill();
    ctx.strokeStyle = '#2a353b';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 1; i < 4; i++) {
      ctx.fillStyle = i === 1 ? '#46535a' : '#27333b';
      ctx.fillRect(x - width / 2 + 5, y + i * 3, width - 10, 1.2);
    }
  }

  drawWheel(w, h, mobile) {
    const ctx = this.ctx;
    const x = w * 0.5;
    const y = h * (mobile ? 0.96 : 0.935);
    const rx = Math.min(w * (mobile ? 0.405 : 0.22), h * 0.285);
    const ry = rx * 0.89;
    const thickness = mobile ? 17 : 27;

    // The gauge floats inside the upper opening; spokes stay below its readout.
    ctx.save();
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 12;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#02060a';
    ctx.lineWidth = thickness + 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const leather = ctx.createLinearGradient(0, y - ry, 0, y + ry);
    leather.addColorStop(0, '#35434d');
    leather.addColorStop(0.09, '#1a262f');
    leather.addColorStop(0.3, '#0a131c');
    leather.addColorStop(0.75, '#15232d');
    leather.addColorStop(1, '#303b43');
    ctx.strokeStyle = leather;
    ctx.lineWidth = thickness;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(x, y, rx - thickness * 0.39, ry - thickness * 0.39, 0, Math.PI * 1.07, Math.PI * 1.92);
    ctx.strokeStyle = 'rgba(128,153,165,0.26)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y, rx + thickness * 0.3, ry + thickness * 0.3, 0, Math.PI * 1.11, Math.PI * 1.89);
    ctx.strokeStyle = 'rgba(166,176,168,0.12)';
    ctx.stroke();

    // Center marker and stitched hand grips.
    ctx.strokeStyle = '#c97950';
    ctx.lineWidth = mobile ? 4 : 6;
    ctx.beginPath();
    ctx.moveTo(x, y - ry - thickness * 0.38);
    ctx.lineTo(x, y - ry + thickness * 0.4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(159,174,180,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    for (const range of [[Math.PI * 0.86, Math.PI * 1.13], [Math.PI * 1.87, Math.PI * 2.14]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, range[0], range[1]);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const hubY = y + ry * 0.32;
    const graphite = ctx.createLinearGradient(0, hubY - ry * 0.15, 0, hubY + ry * 0.5);
    graphite.addColorStop(0, '#3c4851');
    graphite.addColorStop(0.15, '#26333e');
    graphite.addColorStop(1, '#0d1720');
    ctx.fillStyle = graphite;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * rx * 0.21, hubY - ry * 0.04);
      ctx.lineTo(x + side * rx * 0.89, y + ry * 0.08);
      ctx.lineTo(x + side * rx * 0.89, y + ry * 0.28);
      ctx.lineTo(x + side * rx * 0.2, hubY + ry * 0.17);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#53616b';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.13, hubY + ry * 0.15);
    ctx.lineTo(x + rx * 0.13, hubY + ry * 0.15);
    ctx.lineTo(x + rx * 0.06, y + ry * 0.9);
    ctx.lineTo(x - rx * 0.06, y + ry * 0.9);
    ctx.closePath();
    ctx.fill();
    const hub = ctx.createRadialGradient(x - rx * 0.12, hubY - ry * 0.07, 2, x, hubY, rx * 0.34);
    hub.addColorStop(0, '#34424c');
    hub.addColorStop(0.4, '#1c2a34');
    hub.addColorStop(1, '#08121c');
    ctx.beginPath();
    ctx.ellipse(x, hubY, rx * 0.32, ry * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = hub;
    ctx.fill();
    ctx.strokeStyle = '#3e4e59';
    ctx.lineWidth = 1;
    ctx.stroke();
    // An original abstract emblem, deliberately without text.
    ctx.strokeStyle = 'rgba(146,165,175,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 13, hubY + 2);
    ctx.lineTo(x - 3, hubY - 7);
    ctx.lineTo(x + 4, hubY + 5);
    ctx.lineTo(x + 13, hubY - 5);
    ctx.stroke();
    ctx.restore();
  }
}
