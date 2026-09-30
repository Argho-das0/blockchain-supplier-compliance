/* ═══════════════════════════════════════════════════════════
   OVERVIEW — LIVING NETWORK CANVAS
   Interactive supplier network visualization
   ═══════════════════════════════════════════════════════════ */

(function () {
  const canvas = document.getElementById("overview-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  let nodes = [];
  let ripples = [];
  let mouse = { x: -9999, y: -9999 };

  const CONFIG = {
    nodeCount: 55,
    minRadius: 1.4,
    maxRadius: 3.4,
    connectDist: 190,
    cursorRadius: 160,
    rippleSpeed: 3.6
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
    const count = Math.min(CONFIG.nodeCount, Math.max(18, Math.floor((W * H) / 22000)));
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
        bright: 0
      });
    }
  }

  function addRipple(x, y) {
    ripples.push({ x: x, y: y, r: 0, maxR: 340, alpha: 0.55 });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;
      n.pulse += 0.02 * n.pulseRate;

      if (n.x < 0) { n.x = 0; n.vx *= -1; }
      if (n.x > W) { n.x = W; n.vx *= -1; }
      if (n.y < 0) { n.y = 0; n.vy *= -1; }
      if (n.y > H) { n.y = H; n.vy *= -1; }

      const dx = n.x - mouse.x;
      const dy = n.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      let targetBright = 0;
      if (d2 < CONFIG.cursorRadius * CONFIG.cursorRadius && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const force = (1 - d / CONFIG.cursorRadius) * 0.55;
        n.x += (dx / d) * force * 2.2;
        n.y += (dy / d) * force * 2.2;
        targetBright = 1 - d / CONFIG.cursorRadius;
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

      n.bright += (targetBright - n.bright) * 0.12;
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
          const alpha = baseAlpha + bright * 0.35;
          ctx.strokeStyle = "rgba(139,111,71," + alpha + ")";
          ctx.lineWidth = 0.6 + bright * 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (let k = ripples.length - 1; k >= 0; k--) {
      const rp = ripples[k];
      rp.r += CONFIG.rippleSpeed;
      rp.alpha *= 0.985;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(139,111,71," + rp.alpha + ")";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (rp.r > rp.maxR || rp.alpha < 0.02) ripples.splice(k, 1);
    }

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const pulse = 0.7 + Math.sin(n.pulse) * 0.3;
      const bright = n.bright;

      if (n.active || bright > 0.25) {
        const glowR = n.r * (5 + bright * 4) * pulse;
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
        grad.addColorStop(0, "rgba(139,111,71," + (0.55 + bright * 0.35) + ")");
        grad.addColorStop(1, "rgba(139,111,71,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + bright * 1.2, 0, Math.PI * 2);
      const coreAlpha = n.active
        ? 0.75 + bright * 0.25
        : 0.45 + bright * 0.4;
      ctx.fillStyle = n.active
        ? "rgba(139,111,71," + coreAlpha + ")"
        : "rgba(26,22,22," + coreAlpha * pulse + ")";
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("mousemove", function (e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  canvas.addEventListener("mouseleave", function () {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  canvas.addEventListener("click", function (e) {
    const rect = canvas.getBoundingClientRect();
    addRipple(e.clientX - rect.left, e.clientY - rect.top);
  });

  setInterval(function () {
    if (mouse.x < 0) {
      addRipple(W * (0.3 + Math.random() * 0.4), H * (0.3 + Math.random() * 0.4));
    }
  }, 4200);

  resize();
  draw();
})();