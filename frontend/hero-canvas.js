/* ═══════════════════════════════════════════════════════════
   HERO CANVAS — Animated Node Graph
   Supplier network visualization: pulsing nodes + connecting lines
   ═══════════════════════════════════════════════════════════ */

(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let W, H, DPR;
  let nodes = [];
  let mouse = { x: -9999, y: -9999 };
  let t = 0;

  const CONFIG = {
    nodeCount: 42,
    minRadius: 1.2,
    maxRadius: 3.2,
    connectDist: 220,
    mouseInfluence: 140,
    pulseSpeed: 0.02,
    parallax: 0.03
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
    const count = Math.min(CONFIG.nodeCount, Math.floor((W * H) / 24000));
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: CONFIG.minRadius + Math.random() * (CONFIG.maxRadius - CONFIG.minRadius),
        pulse: Math.random() * Math.PI * 2,
        pulseRate: 0.6 + Math.random() * 1.4,
        // some nodes are "active suppliers" — bigger, tinted
        active: Math.random() < 0.25
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    t += 1;

    // Update positions
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;
      n.pulse += CONFIG.pulseSpeed * n.pulseRate;

      // Gentle wrap
      if (n.x < -20) n.x = W + 20;
      if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = H + 20;
      if (n.y > H + 20) n.y = -20;

      // Cursor repulsion / attraction
      const dx = n.x - mouse.x;
      const dy = n.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < CONFIG.mouseInfluence * CONFIG.mouseInfluence && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const force = (1 - d / CONFIG.mouseInfluence) * 0.6;
        n.x += (dx / d) * force * 1.4;
        n.y += (dy / d) * force * 1.4;
      }
    }

    // Draw connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d < CONFIG.connectDist) {
          const alpha = (1 - d / CONFIG.connectDist) * 0.22;
          ctx.strokeStyle = `rgba(26, 22, 22, ${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Draw nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const pulse = 0.7 + Math.sin(n.pulse) * 0.3;

      if (n.active) {
        // Active supplier — bronze ring
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * (1 + pulse * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139, 111, 71, ${0.65 * pulse})`;
        ctx.fill();

        // outer glow ring
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 4 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(139, 111, 71, ${0.25 * (1 - pulse)})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else {
        // Regular node — ink
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(26, 22, 22, ${0.55 * pulse})`;
        ctx.fill();
      }
    }

    requestAnimationFrame(draw);
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }

  function onMouseLeave() {
    mouse.x = -9999;
    mouse.y = -9999;
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseleave', onMouseLeave);

  resize();
  draw();
})();