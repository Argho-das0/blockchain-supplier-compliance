/* ═══════════════════════════════════════════════════════════
   OVERVIEW — LIVING NETWORK CANVAS v2
   Full interactivity: hover, click, ripples, cursor trail
   ═══════════════════════════════════════════════════════════ */

(function () {
  const canvas = document.getElementById("overview-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  let nodes = [];
  let ripples = [];
  let trails = [];
  let mouse = { x: -9999, y: -9999, lastX: -9999, lastY: -9999, speed: 0 };
  let idleTimer = 0;

  const CONFIG = {
    nodeCount: 60,
    minRadius: 1.4,
    maxRadius: 3.4,
    connectDist: 180,
    cursorRadius: 170,
    nodeHoverRadius: 55,
    rippleSpeed: 3.6,
    trailLife: 40
  };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildNodes();
  }

  function buildNodes() {
    nodes = [];
    const count = Math.min(CONFIG.nodeCount, Math.max(22, Math.floor((W * H) / 18000)));
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: CONFIG.minRadius + Math.random() * (CONFIG.maxRadius - CONFIG.minRadius),
        pulse: Math.random() * Math.PI * 2,
        pulseRate: 0.4 + Math.random() * 1.1,
        active: Math.random() < 0.22,
        bright: 0,
        hoverScale: 0,
        ping: 0
      });
    }
  }

  function addRipple(x, y, strength) {
    ripples.push({
      x: x, y: y,
      r: 0,
      maxR: 340 + (strength || 0) * 120,
      alpha: 0.55 + (strength || 0) * 0.15,
      lineWidth: 1 + (strength || 0) * 0.6
    });
  }

  function addTrail(x, y) {
    trails.push({ x: x, y: y, life: CONFIG.trailLife, r: 2 });
  }

  function pingNode(n) {
    n.ping = 1;
    for (let j = 0; j < nodes.length; j++) {
      if (nodes[j] === n) continue;
      const dx = nodes[j].x - n.x;
      const dy = nodes[j].y - n.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < CONFIG.connectDist) {
        nodes[j].bright = Math.max(nodes[j].bright, (1 - d / CONFIG.connectDist) * 0.5);
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    idleTimer++;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;
      n.pulse += 0.02 * n.pulseRate;
      n.ping *= 0.94;

      if (n.x < 0) { n.x = 0; n.vx *= -1; }
      if (n.x > W) { n.x = W; n.vx *= -1; }
      if (n.y < 0) { n.y = 0; n.vy *= -1; }
      if (n.y > H) { n.y = H; n.vy *= -1; }

      const dx = n.x - mouse.x;
      const dy = n.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      let targetBright = 0;
      let targetHover = 0;

      if (d2 < CONFIG.cursorRadius * CONFIG.cursorRadius && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const force = (1 - d / CONFIG.cursorRadius) * 0.5;
        n.x += (dx / d) * force * 2.0;
        n.y += (dy / d) * force * 2.0;
        targetBright = 1 - d / CONFIG.cursorRadius;
      }

      if (d2 < CONFIG.nodeHoverRadius * CONFIG.nodeHoverRadius) {
        targetHover = 1 - Math.sqrt(d2) / CONFIG.nodeHoverRadius;
        targetBright = Math.max(targetBright, targetHover);
      }

      for (let k = 0; k < ripples.length; k++) {
        const rp = ripples[k];
        const rx = n.x - rp.x;
        const ry = n.y - rp.y;
        const rd = Math.sqrt(rx * rx + ry * ry);
        const ring = Math.abs(rd - rp.r);
        if (ring < 40) {
          targetBright = Math.max(targetBright, (1 - ring / 40) * rp.alpha);
        }
      }

      n.bright += (targetBright - n.bright) * 0.14;
      n.hoverScale += (targetHover - n.hoverScale) * 0.18;
    }

    if (idleTimer % 260 === 0 && nodes.length) {
      const pick = nodes[Math.floor(Math.random() * nodes.length)];
      pingNode(pick);
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < CONFIG.connectDist) {
          const baseAlpha = (1 - d / CONFIG.connectDist) * 0.18;
          const bright = Math.max(a.bright, b.bright);
          const alpha = baseAlpha + bright * 0.4;
          ctx.strokeStyle = "rgba(139,111,71," + alpha + ")";
          ctx.lineWidth = 0.6 + bright * 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (let k = trails.length - 1; k >= 0; k--) {
      const t = trails[k];
      t.life -= 1;
      t.r *= 0.94;
      if (t.life <= 0) { trails.splice(k, 1); continue; }
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(139,111,71," + (t.life / CONFIG.trailLife) * 0.5 + ")";
      ctx.fill();
    }

    for (let k = ripples.length - 1; k >= 0; k--) {
      const rp = ripples[k];
      rp.r += CONFIG.rippleSpeed;
      rp.alpha *= 0.985;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(139,111,71," + rp.alpha + ")";
      ctx.lineWidth = rp.lineWidth;
      ctx.stroke();

      if (rp.r > 20) {
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r - 18, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(139,111,71," + rp.alpha * 0.4 + ")";
        ctx.lineWidth = rp.lineWidth * 0.5;
        ctx.stroke();
      }

      if (rp.r > rp.maxR || rp.alpha < 0.02) ripples.splice(k, 1);
    }

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const pulse = 0.7 + Math.sin(n.pulse) * 0.3;
      const bright = n.bright;
      const scale = 1 + n.hoverScale * 0.9;
      const radius = (n.r + bright * 1.4) * scale;

      if (n.active || bright > 0.15 || n.hoverScale > 0.1) {
        const glowR = n.r * (5 + bright * 6 + n.hoverScale * 5) * pulse;
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
        grad.addColorStop(0, "rgba(139,111,71," + (0.5 + bright * 0.4 + n.hoverScale * 0.3) + ")");
        grad.addColorStop(1, "rgba(139,111,71,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      if (n.ping > 0.02) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 8 * (1 - n.ping), 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(139,111,71," + n.ping * 0.6 + ")";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      const coreAlpha = n.active
        ? 0.75 + bright * 0.25
        : 0.45 + bright * 0.45;
      ctx.fillStyle = n.active
        ? "rgba(139,111,71," + coreAlpha + ")"
        : "rgba(26,22,22," + Math.min(1, coreAlpha * pulse) + ")";
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("mousemove", function (e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - mouse.lastX;
    const dy = y - mouse.lastY;
    const speed = Math.sqrt(dx * dx + dy * dy);
    mouse.speed = speed;

    mouse.x = x;
    mouse.y = y;
    mouse.lastX = x;
    mouse.lastY = y;

    if (speed > 3 && Math.random() < 0.5) {
      addTrail(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12);
    }
  });

  canvas.addEventListener("mouseleave", function () {
    mouse.x = -9999;
    mouse.y = -9999;
    mouse.lastX = -9999;
    mouse.lastY = -9999;
  });

  canvas.addEventListener("click", function (e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    addRipple(x, y, 1);
    setTimeout(function () { addRipple(x, y, 0.5); }, 120);
    setTimeout(function () { addRipple(x, y, 0.25); }, 240);
  });

  setInterval(function () {
    if (mouse.x < 0 && nodes.length) {
      const pick = nodes[Math.floor(Math.random() * nodes.length)];
      pingNode(pick);
    }
  }, 3800);

  function connectHudToCanvas() {
    const hudStats = document.querySelectorAll(".ov-hud-stat");
    hudStats.forEach(function (stat) {
      stat.addEventListener("click", function () {
        const rect = stat.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 - canvasRect.left;
        const cy = rect.top + rect.height / 2 - canvasRect.top;

        addRipple(cx, cy, 1.5);
        setTimeout(function () { addRipple(cx, cy, 1); }, 100);
        setTimeout(function () { addRipple(cx, cy, 0.6); }, 220);

        let sorted = nodes.slice().sort(function (a, b) {
          const da = (a.x - cx) * (a.x - cx) + (a.y - cy) * (a.y - cy);
          const db = (b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy);
          return da - db;
        });
        for (let i = 0; i < Math.min(6, sorted.length); i++) {
          setTimeout(function (node) { return function () { pingNode(node); }; }(sorted[i]), i * 60);
        }
      });
    });

    const caption = document.querySelector(".ov-caption");
    if (caption) {
      caption.style.pointerEvents = "auto";
      caption.style.cursor = "pointer";
      caption.addEventListener("click", function () {
        for (let i = 0; i < nodes.length; i += 4) {
          (function (n) { setTimeout(function () { pingNode(n); }, i * 12); })(nodes[i]);
        }
        addRipple(W / 2, H / 2, 2);
      });
    }
  }

  resize();
  draw();
  connectHudToCanvas();
})();