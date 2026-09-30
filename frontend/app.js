/* ═══════════════════════════════════════════════════════════
   APP.JS — Supplier Compliance (Blush/Editorial revamp v2)
   ═══════════════════════════════════════════════════════════ */

let CONTRACT_ADDRESS = null;

async function loadContractAddress() {
  if (CONTRACT_ADDRESS) return CONTRACT_ADDRESS;
  const res = await fetch("deployed-address.json?t=" + Date.now());
  const data = await res.json();
  CONTRACT_ADDRESS = data.address;
  console.log("Loaded contract address:", CONTRACT_ADDRESS);
  return CONTRACT_ADDRESS;
}

const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/alch_gaTL5mYEuDBwWzTZkOZL-";

const CONTRACT_ABI = [
  "function REGISTRATION_FEE() view returns (uint256)",
  "function COMPLIANCE_PERIOD() view returns (uint256)",
  "function ESCROW_PERIOD() view returns (uint256)",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function registerSupplier() payable",
  "function registerResource(uint8 _resourceType, uint256 _quantity)",
  "function updateResourceQuantity(uint8 _resourceType, uint256 _quantity)",
  "function checkAndDeactivate(address _supplier)",
  "function calculatePenalty(address _supplier) view returns (uint256)",
  "function payPenaltyAndReactivate() payable",
  "function pause()",
  "function unpause()",
  "function isResourceCompliant(address _supplier, uint8 _resourceType) view returns (bool)",
  "function remainingComplianceTime(address _supplier, uint8 _resourceType) view returns (uint256)",
  "function getTotalRegisteredSuppliers() view returns (uint256)",
  "function getActiveSuppliersCount() view returns (uint256)",
  "function getInactiveSuppliersCount() view returns (uint256)",
  "function getVerifiedSuppliersCount() view returns (uint256)",
  "function getSupplierInfo(address _supplier) view returns (address, uint256, bool, bool, uint256, uint256)",
  "function getAggregateResourceQuantity(uint8 _resourceType) view returns (uint256)",
  "function getTotalPenaltiesCollected() view returns (uint256)",
  "function getSupplierResourceQuantity(address _supplier, uint8 _resourceType) view returns (uint256)",
  "function getEscrowInfo(address _supplier) view returns (uint256, uint256, bool, bool)",
  "function getTotalEscrowHeld() view returns (uint256)",
  "function escrowBalance(address) view returns (uint256)",
  "function getSupplierReputation(address _supplier) view returns (uint256)",
  "function getReputationTier(address _supplier) view returns (string)",
  "event SupplierRegistered(address indexed supplier, uint256 timestamp)",
  "event ResourceRegistered(address indexed supplier, string resource)",
  "event ResourceUpdated(address indexed supplier, string resource, uint256 quantity)",
  "event SupplierDeactivated(address indexed supplier, uint256 timestamp)",
  "event PenaltyPaid(address indexed supplier, uint256 amount)",
  "event SupplierReactivated(address indexed supplier, uint256 timestamp)",
  "event EscrowDeposited(address indexed supplier, uint256 amount, uint256 releaseTime)",
  "event EscrowReleased(address indexed supplier, uint256 amount)",
  "event EscrowForfeited(address indexed supplier, uint256 amount, address recipient)",
  "event ReputationChanged(address indexed supplier, uint256 oldScore, uint256 newScore, string reason)",
  "event ContractPaused(address indexed by, uint256 timestamp)",
  "event ContractUnpaused(address indexed by, uint256 timestamp)"
];

let provider, signer, contract, userAddress;

/* ═══════════════════════════════════════════════════════════
   TOASTS
   ═══════════════════════════════════════════════════════════ */
function toast(message, type) {
  type = type || "info";
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(function () {
    el.style.transition = "opacity .35s, transform .35s";
    el.style.opacity = "0";
    el.style.transform = "translateY(12px)";
    setTimeout(function () { el.remove(); }, 350);
  }, 4500);
}

function log(message) {
  const output = document.getElementById("stats-output");
  if (output) output.innerHTML = "<p>" + message + "</p>" + output.innerHTML;
  console.log(message);
}

function getReadContract() {
  const readProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);
}

/* ═══════════════════════════════════════════════════════════
   LANDING ⇄ APP TRANSITION
   ═══════════════════════════════════════════════════════════ */
const landingEl = document.getElementById("landing");
const appEl = document.getElementById("app");

function showApp(targetSection) {
  landingEl.classList.add("exit");
  appEl.classList.add("visible");
  document.body.style.overflow = "auto";
  document.body.classList.add("app-active");
  setTimeout(function () {
    landingEl.style.display = "none";
    if (targetSection) switchSection(targetSection);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, 900);
}

function showLanding() {
  landingEl.style.display = "";
  window.scrollTo({ top: 0, behavior: "instant" });
  document.body.classList.remove("app-active");
  requestAnimationFrame(function () {
    landingEl.classList.remove("exit");
    appEl.classList.remove("visible");
    document.body.style.overflow = "hidden";
  });
}

document.getElementById("enter-app").addEventListener("click", function () {
  showApp("overview");
});
document.getElementById("back-to-landing").addEventListener("click", showLanding);

document.querySelectorAll("[data-jump]").forEach(function (link) {
  link.addEventListener("click", function (e) {
    e.preventDefault();
    showApp(link.dataset.jump);
  });
});

/* ═══════════════════════════════════════════════════════════
   RAIL NAVIGATION
   ═══════════════════════════════════════════════════════════ */
const PAGE_TITLES = {
  overview:   ["Overview", "Manage suppliers, resources, and compliance on-chain."],
  supplier:   ["Supplier Registration", "Join the network by paying the fixed registration fee."],
  resources:  ["Resources", "Register and update humanitarian resources."],
  compliance: ["Compliance & Penalty", "Enforce the 24-hour rule and manage penalties."],
  escrow:     ["Penalty Escrow", "Refundable deposits and aid fund forfeitures."],
  reputation: ["Reputation", "Track supplier reliability with on-chain scores."],
  admin:      ["Admin", "Compliance officer controls — pause and unpause."],
  events:     ["Event Log & Statistics", "Real-time events and aggregated ecosystem stats."]
};

function switchSection(name) {
  const currentSec = document.querySelector(".sec.active");
  const nextSec = document.getElementById("section-" + name);
  if (!nextSec) return;

  document.querySelectorAll(".rail-item").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.section === name);
  });

  if (currentSec && currentSec !== nextSec) {
    currentSec.style.transition = "opacity 0.25s ease, transform 0.25s ease";
    currentSec.style.opacity = "0";
    currentSec.style.transform = "translateX(-16px)";
    setTimeout(function () {
      currentSec.classList.remove("active");
      currentSec.style.opacity = "";
      currentSec.style.transform = "";
      currentSec.style.transition = "";
      nextSec.classList.add("active");
      nextSec.style.opacity = "0";
      nextSec.style.transform = "translateX(24px)";
      requestAnimationFrame(function () {
        nextSec.style.transition = "opacity 0.4s ease, transform 0.4s ease";
        nextSec.style.opacity = "1";
        nextSec.style.transform = "translateX(0)";
        setTimeout(function () {
          nextSec.style.transition = "";
          nextSec.style.opacity = "";
          nextSec.style.transform = "";
        }, 420);
      });
    }, 260);
  } else {
    nextSec.classList.add("active");
  }

  const info = PAGE_TITLES[name] || ["", ""];
  const tEl = document.getElementById("page-title");
  const sEl = document.getElementById("page-subtitle");
  if (tEl) {
    tEl.textContent = info[0];
    tEl.classList.remove("reveal");
    void tEl.offsetWidth;
    tEl.classList.add("reveal");
  }
  if (sEl) sEl.textContent = info[1];

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (name === "overview") setTimeout(animateStatNumbers, 400);
}

document.querySelectorAll(".rail-item").forEach(function (btn) {
  btn.addEventListener("click", function () { switchSection(btn.dataset.section); });
});

/* ═══════════════════════════════════════════════════════════
   STAT NUMBER COUNT-UP
   ═══════════════════════════════════════════════════════════ */
function animateValue(el, endValue, duration) {
  if (!el) return;
  const start = 0;
  const startTime = performance.now();
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (endValue - start) * eased);
    el.textContent = current.toString();
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = endValue.toString();
  }
  requestAnimationFrame(tick);
}

function animateStatNumbers() {
  const ids = ["ov-total", "ov-active", "ov-inactive", "ov-escrow"];
  ids.forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    const target = parseInt(el.textContent.replace(/[^0-9]/g, ""), 10);
    if (isNaN(target) || target === 0) return;
    animateValue(el, target, 900);
  });
}

/* ═══════════════════════════════════════════════════════════
   MAGNETIC BUTTONS
   ═══════════════════════════════════════════════════════════ */
function initMagneticButtons() {
  document.querySelectorAll(".pill.primary, .pill-enter").forEach(function (btn) {
    if (btn.dataset.magnetic === "1") return;
    btn.dataset.magnetic = "1";
    btn.addEventListener("mousemove", function (e) {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = "translate(" + (x * 0.12) + "px," + (y * 0.18) + "px)";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.transform = "";
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   OVERVIEW REFRESH
   ═══════════════════════════════════════════════════════════ */
async function refreshOverview() {
  try {
    await loadContractAddress();
    const rc = getReadContract();

    const total = await rc.getTotalRegisteredSuppliers();
    const active = await rc.getActiveSuppliersCount();
    const inactive = await rc.getInactiveSuppliersCount();
    const escrow = await rc.getTotalEscrowHeld();
    const water = await rc.getAggregateResourceQuantity(0);
    const clothing = await rc.getAggregateResourceQuantity(1);
    const medicine = await rc.getAggregateResourceQuantity(2);
    const food = await rc.getAggregateResourceQuantity(3);

    document.getElementById("ov-total").textContent = total.toString();
    document.getElementById("ov-active").textContent = active.toString();
    document.getElementById("ov-inactive").textContent = inactive.toString();
    document.getElementById("ov-escrow").textContent = escrow.toString();
    document.getElementById("ov-water").textContent = water.toString();
    document.getElementById("ov-clothing").textContent = clothing.toString();
    document.getElementById("ov-medicine").textContent = medicine.toString();
    document.getElementById("ov-food").textContent = food.toString();

    const el = document.getElementById("overview-status");
    if (!userAddress) {
      el.innerHTML = '<p class="muted">Connect your wallet to see your status.</p>';
      return;
    }
    const info = await rc.getSupplierInfo(userAddress);
    if (!info[2]) {
      el.innerHTML = '<p class="muted">You are not registered as a supplier yet.</p>';
      return;
    }
    const reputation = await rc.getSupplierReputation(userAddress);
    const tier = await rc.getReputationTier(userAddress);
    el.innerHTML =
      "<p><strong>Wallet:</strong> <code>" + userAddress + "</code></p>" +
      "<p><strong>Status:</strong> " + (info[3] ? "Active" : "Inactive") + "</p>" +
      "<p><strong>Reputation:</strong> " + reputation.toString() + " (" + tier + ")</p>" +
      "<p><strong>Resources:</strong> " + info[5].toString() + "</p>";
  } catch (err) {
    console.error("refreshOverview failed:", err.message);
  }
}

document.getElementById("refresh-overview").addEventListener("click", function () {
  refreshOverview().then(animateStatNumbers);
});

/* ═══════════════════════════════════════════════════════════
   WALLET CONNECT
   ═══════════════════════════════════════════════════════════ */
async function connectWallet() {
  if (!window.ethereum) {
    log("MetaMask not detected.");
    toast("MetaMask not detected", "error");
    return;
  }
  try {
    await loadContractAddress();
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    document.getElementById("account").textContent =
      userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
    document.getElementById("account-chip").classList.remove("hidden");
    document.getElementById("connect-label").textContent = "Connected";

    const heroBtn = document.getElementById("hero-connect");
    if (heroBtn) heroBtn.classList.add("connected");

    log("Wallet connected: " + userAddress);
    toast("Wallet connected", "success");

    if (!listening) await startListening();
    await refreshOverview();
  } catch (err) {
    log("Error connecting: " + err.message);
    toast("Connection failed: " + err.message, "error");
  }
}

document.getElementById("connect-wallet").addEventListener("click", connectWallet);
document.getElementById("hero-connect").addEventListener("click", connectWallet);

/* ═══════════════════════════════════════════════════════════
   REGISTER SUPPLIER
   ═══════════════════════════════════════════════════════════ */
document.getElementById("register-supplier").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const fee = await rc.REGISTRATION_FEE();
    const tx = await contract.registerSupplier({ value: fee });
    log("Registration tx sent: " + tx.hash);
    toast("Registration submitted…", "info");
    await tx.wait();
    log("Supplier registered successfully!");
    toast("Supplier registered", "success");
    await refreshOverview();
  } catch (err) {
    const msg = err.reason || err.message;
    log("Registration failed: " + msg);
    toast("Registration failed: " + msg, "error");
  }
});

/* ═══════════════════════════════════════════════════════════
   RESOURCE MANAGEMENT
   ═══════════════════════════════════════════════════════════ */
document.getElementById("register-resource").addEventListener("click", async () => {
  try {
    const type = document.getElementById("resource-type").value;
    const qty = document.getElementById("resource-quantity").value;
    if (!qty || Number(qty) <= 0) {
      log("Enter a quantity greater than zero.");
      toast("Enter a quantity greater than zero", "warn");
      return;
    }
    const tx = await contract.registerResource(type, qty);
    log("Resource registration tx: " + tx.hash);
    toast("Resource registration submitted…", "info");
    await tx.wait();
    log("Resource registered successfully!");
    toast("Resource registered", "success");
    await refreshOverview();
  } catch (err) {
    const msg = err.reason || err.message;
    log("Resource registration failed: " + msg);
    toast("Resource registration failed: " + msg, "error");
  }
});

document.getElementById("update-quantity").addEventListener("click", async () => {
  try {
    const type = document.getElementById("resource-type").value;
    const qty = document.getElementById("resource-quantity").value;
    if (!qty || Number(qty) <= 0) {
      log("Enter a quantity greater than zero.");
      toast("Enter a quantity greater than zero", "warn");
      return;
    }
    const tx = await contract.updateResourceQuantity(type, qty);
    log("Update tx: " + tx.hash);
    toast("Update submitted…", "info");
    await tx.wait();
    log("Quantity updated and 24h compliance timer refreshed!");
    toast("Quantity updated", "success");
    await refreshOverview();
  } catch (err) {
    const msg = err.reason || err.message;
    log("Update failed: " + msg);
    toast("Update failed: " + msg, "error");
  }
});

/* ═══════════════════════════════════════════════════════════
   COMPLIANCE COUNTDOWN
   ═══════════════════════════════════════════════════════════ */
function formatDuration(seconds) {
  if (seconds <= 0) return "EXPIRED";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(d + "d");
  if (h > 0) parts.push(h + "h");
  if (m > 0) parts.push(m + "m");
  if (d === 0 && h === 0) parts.push(s + "s");
  return parts.join(" ");
}

document.getElementById("load-countdown").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const resourceNames = ["Water", "Clothing", "Medicine", "Food"];
    let html = "";

    for (let i = 0; i < 4; i++) {
      const qty = await rc.getSupplierResourceQuantity(userAddress, i);
      if (qty.toString() === "0") continue;

      const remaining = await rc.remainingComplianceTime(userAddress, i);
      const seconds = Number(remaining);

      let color, status;
      if (seconds === 0) { color = "#8C3A2E"; status = "EXPIRED — will be deactivated"; }
      else if (seconds < 3600) { color = "#A65A2E"; status = "URGENT — under 1 hour remaining"; }
      else if (seconds < 21600) { color = "#8B6F47"; status = "Approaching deadline"; }
      else { color = "#3F6F4A"; status = "Compliant"; }

      html +=
        '<div style="margin-bottom:14px; padding:18px 20px; background:rgba(250,244,241,.5); border-left:2px solid ' + color + ';">' +
        '<div style="display:flex; align-items:baseline; gap:10px; margin-bottom:8px;">' +
        '<strong style="font-family:\'Instrument Serif\', serif; font-size:22px; font-weight:400;">' + resourceNames[i] + '</strong>' +
        '<span style="color:#8B7B78; font-size:11px; font-family:\'JetBrains Mono\', monospace;">qty ' + qty.toString() + '</span>' +
        '</div>' +
        '<div style="color:' + color + '; font-weight:600; font-size:12px;">' + status + '</div>' +
        '<div style="font-family:\'JetBrains Mono\', monospace; font-size:11.5px; color:#4A3F3E; margin-top:6px;">' + formatDuration(seconds) + ' remaining</div>' +
        '</div>';
    }

    if (!html) html = "<p class='muted'>No resources registered yet.</p>";
    document.getElementById("countdown-output").innerHTML = html;
  } catch (err) {
    log("Failed to load countdown: " + (err.reason || err.message));
    toast("Countdown failed", "error");
  }
});

/* ═══════════════════════════════════════════════════════════
   TIME SIMULATION
   ═══════════════════════════════════════════════════════════ */
async function advanceBlockchainTime(seconds, label) {
  try {
    const localProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
    await localProvider.send("evm_increaseTime", [seconds]);
    await localProvider.send("evm_mine", []);
    document.getElementById("time-status").innerText = "Fast-forwarded: " + label;
    log("Advanced blockchain time by " + label + ".");
    toast("Time advanced by " + label, "success");
  } catch (err) {
    log("Failed to advance time: " + err.message);
    toast("Time advance failed (Sepolia doesn't support this)", "error");
  }
}

document.getElementById("skip-1-day").addEventListener("click", function () { advanceBlockchainTime(90000, "25 Hours"); });
document.getElementById("skip-3-days").addEventListener("click", function () { advanceBlockchainTime(259200, "3 Days"); });
document.getElementById("skip-10-days").addEventListener("click", function () { advanceBlockchainTime(864000, "10 Days"); });

/* ═══════════════════════════════════════════════════════════
   CHECK COMPLIANCE
   ═══════════════════════════════════════════════════════════ */
document.getElementById("check-compliance").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const infoBefore = await rc.getSupplierInfo(userAddress);
    if (!infoBefore[2]) { toast("Wallet is not registered as a supplier", "warn"); return; }
    if (!infoBefore[3]) { toast("Supplier is already INACTIVE", "warn"); return; }
    const ownerAddress = await rc.owner();
    if (userAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      toast("Only the compliance officer can deactivate", "error");
      return;
    }
    const tx = await contract.checkAndDeactivate(userAddress);
    log("Check compliance tx: " + tx.hash);
    toast("Compliance check submitted…", "info");
    await tx.wait();
    const infoAfter = await rc.getSupplierInfo(userAddress);
    if (!infoAfter[3]) {
      log("Supplier non-compliant. Status changed to INACTIVE.");
      toast("Supplier deactivated", "warn");
    } else {
      log("Supplier is currently COMPLIANT.");
      toast("Supplier is compliant", "success");
    }
    await refreshOverview();
  } catch (err) {
    const msg = err.reason || err.message;
    log("Compliance check failed: " + msg);
    toast("Compliance check failed: " + msg, "error");
  }
});

/* ═══════════════════════════════════════════════════════════
   CALCULATE PENALTY
   ═══════════════════════════════════════════════════════════ */
document.getElementById("calculate-penalty").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const info = await rc.getSupplierInfo(userAddress);
    if (!info[2]) { toast("Wallet is not registered", "warn"); return; }
    if (info[3]) { toast("Supplier is active — no penalty applies", "warn"); return; }
    const penalty = await rc.calculatePenalty(userAddress);
    log("Calculated penalty: " + penalty.toString() + " wei");
    toast("Penalty: " + penalty.toString() + " wei", "info");
  } catch (err) {
    log("Penalty calculation failed: " + (err.reason || err.message));
    toast("Penalty calculation failed", "error");
  }
});

/* ═══════════════════════════════════════════════════════════
   PAY PENALTY
   ═══════════════════════════════════════════════════════════ */
document.getElementById("pay-penalty").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const info = await rc.getSupplierInfo(userAddress);
    if (!info[2]) { toast("Wallet is not registered", "warn"); return; }
    if (info[3]) { toast("Supplier is already active", "warn"); return; }
    const penalty = await rc.calculatePenalty(userAddress);
    log("Submitting penalty payment of " + penalty.toString() + " wei into escrow…");
    toast("Submitting penalty…", "info");
    const tx = await contract.payPenaltyAndReactivate({ value: penalty.toString(), gasLimit: 300000 });
    log("Payment tx: " + tx.hash);
    await tx.wait();
    log("Penalty paid. Funds held in escrow.");
    toast("Penalty paid — supplier reactivated", "success");
    await refreshOverview();
  } catch (err) {
    const msg = err.reason || err.message;
    log("Penalty payment failed: " + msg);
    toast("Penalty payment failed: " + msg, "error");
  }
});

/* ═══════════════════════════════════════════════════════════
   ESCROW
   ═══════════════════════════════════════════════════════════ */
document.getElementById("load-escrow").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const info = await rc.getEscrowInfo(userAddress);
    const balance = info[0];
    const releaseTime = info[1];
    const releasable = info[2];
    const forfeitEligible = info[3];

    if (balance.toString() === "0") {
      document.getElementById("escrow-status").innerHTML =
        '<p class="muted">No penalty currently held in escrow for this wallet.</p>';
      return;
    }
    const releaseDate = new Date(Number(releaseTime) * 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    const daysLeft = Math.max(0, Math.ceil((Number(releaseTime) - nowSec) / 86400));
    let statusText;
    if (releasable) statusText = "Ready to release";
    else if (forfeitEligible) statusText = "Eligible for forfeit";
    else statusText = "Awaiting compliance window";

    document.getElementById("escrow-status").innerHTML =
      "<p><strong>Amount in escrow:</strong> <code>" + balance.toString() + " wei</code></p>" +
      "<p><strong>Release date:</strong> " + releaseDate.toLocaleString() + "</p>" +
      "<p><strong>Days remaining:</strong> " + daysLeft + "</p>" +
      "<p><strong>Status:</strong> " + statusText + "</p>";
  } catch (err) {
    log("Failed to load escrow: " + (err.reason || err.message));
    toast("Escrow load failed", "error");
  }
});

/* ═══════════════════════════════════════════════════════════
   REPUTATION
   ═══════════════════════════════════════════════════════════ */
document.getElementById("load-reputation").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const score = await rc.getSupplierReputation(userAddress);
    const tier = await rc.getReputationTier(userAddress);
    const n = Number(score);

    let barColor;
    if (n >= 180) barColor = "#8B6F47";
    else if (n >= 150) barColor = "#A65A2E";
    else if (n >= 120) barColor = "#8B7B78";
    else barColor = "#8C3A2E";

    const percentage = Math.min(100, (n / 200) * 100);

    document.getElementById("reputation-status").innerHTML =
      '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:16px;">' +
      '<span style="font-family:\'Instrument Serif\', serif; font-size:72px; line-height:.9;">' + score.toString() + '</span>' +
      '<span style="font-family:\'JetBrains Mono\', monospace; font-size:11px; color:#8B7B78;">/ 200 · ' + tier.toUpperCase() + '</span>' +
      '</div>' +
      '<div style="background:rgba(26,22,22,.08); height:2px; margin-top:12px; overflow:hidden;">' +
      '<div style="background:' + barColor + '; width:0%; height:100%; transition:width 0.9s cubic-bezier(.22,1,.36,1);"></div>' +
      '</div>';

    setTimeout(function () {
      const bar = document.querySelector("#reputation-status > div > div");
      if (bar) bar.style.width = percentage + "%";
    }, 50);
  } catch (err) {
    log("Failed to load reputation: " + (err.reason || err.message));
    toast("Reputation load failed", "error");
  }
});

/* ═══════════════════════════════════════════════════════════
   EMERGENCY PAUSE
   ═══════════════════════════════════════════════════════════ */
document.getElementById("check-pause-status").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const isPaused = await rc.paused();
    document.getElementById("pause-status").innerHTML = isPaused
      ? '<p style="color:#8C3A2E;"><strong>CONTRACT PAUSED</strong> — state changes halted.</p>'
      : '<p style="color:#3F6F4A;"><strong>Contract active</strong> — operations running normally.</p>';
  } catch (err) {
    log("Failed to check pause status: " + (err.reason || err.message));
  }
});

document.getElementById("pause-contract").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const ownerAddress = await rc.owner();
    if (userAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      toast("Only the compliance officer can pause", "error");
      return;
    }
    const tx = await contract.pause();
    log("Pause tx: " + tx.hash);
    toast("Pausing…", "info");
    await tx.wait();
    log("Contract PAUSED.");
    toast("Contract paused", "warn");
  } catch (err) {
    const msg = err.reason || err.message;
    log("Pause failed: " + msg);
    toast("Pause failed: " + msg, "error");
  }
});

document.getElementById("unpause-contract").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const ownerAddress = await rc.owner();
    if (userAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      toast("Only the compliance officer can unpause", "error");
      return;
    }
    const tx = await contract.unpause();
    log("Unpause tx: " + tx.hash);
    toast("Unpausing…", "info");
    await tx.wait();
    log("Contract UNPAUSED.");
    toast("Contract resumed", "success");
  } catch (err) {
    const msg = err.reason || err.message;
    log("Unpause failed: " + msg);
    toast("Unpause failed: " + msg, "error");
  }
});

/* ═══════════════════════════════════════════════════════════
   LIVE EVENT LOG
   ═══════════════════════════════════════════════════════════ */
let eventListeners = [];
let listening = false;

function shorten(addr) {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function appendEvent(line) {
  const el = document.getElementById("event-log");
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  el.innerHTML = "<div>[" + time + "] " + line + "</div>" + el.innerHTML;
}

async function startListening() {
  if (listening) return;
  await loadContractAddress();
  const rc = getReadContract();

  const handlers = [
    ["SupplierRegistered", function (s) { appendEvent("SupplierRegistered: " + shorten(s)); }],
    ["ResourceRegistered", function (s, r) { appendEvent("ResourceRegistered: " + r + " (" + shorten(s) + ")"); }],
    ["ResourceUpdated", function (s, r, q) { appendEvent("ResourceUpdated: " + r + " = " + q.toString()); }],
    ["SupplierDeactivated", function (s) { appendEvent("SupplierDeactivated: " + shorten(s)); }],
    ["PenaltyPaid", function (s, a) { appendEvent("PenaltyPaid: " + a.toString() + " wei"); }],
    ["SupplierReactivated", function (s) { appendEvent("SupplierReactivated: " + shorten(s)); }],
    ["EscrowDeposited", function (s, a) { appendEvent("EscrowDeposited: " + a.toString() + " wei"); }],
    ["EscrowReleased", function (s, a) { appendEvent("EscrowReleased: " + a.toString() + " wei"); }],
    ["EscrowForfeited", function (s, a, r) { appendEvent("EscrowForfeited: " + a.toString() + " wei to " + shorten(r)); }],
    ["ReputationChanged", function (s, o, n, reason) { appendEvent("Reputation: " + o + " to " + n + " (" + reason + ")"); }],
    ["ContractPaused", function (by) { appendEvent("ContractPaused by " + shorten(by)); }],
    ["ContractUnpaused", function (by) { appendEvent("ContractUnpaused by " + shorten(by)); }]
  ];

  for (let i = 0; i < handlers.length; i++) {
    const name = handlers[i][0];
    const handler = handlers[i][1];
    const wrapped = function () { handler.apply(null, arguments); };
    rc.on(name, wrapped);
    eventListeners.push({ name: name, wrapped: wrapped });
  }

  listening = true;
  document.getElementById("toggle-events").textContent = "Stop";
  appendEvent("Listening for events…");
}

function stopListening() {
  if (!listening) return;
  const rc = getReadContract();
  for (let i = 0; i < eventListeners.length; i++) {
    rc.off(eventListeners[i].name, eventListeners[i].wrapped);
  }
  eventListeners = [];
  listening = false;
  document.getElementById("toggle-events").textContent = "Start";
  appendEvent("Stopped listening.");
}

document.getElementById("toggle-events").addEventListener("click", async () => {
  if (listening) stopListening();
  else await startListening();
});

document.getElementById("clear-events").addEventListener("click", function () {
  document.getElementById("event-log").innerHTML = '<p class="muted">Cleared.</p>';
});

/* ═══════════════════════════════════════════════════════════
   LOAD STATISTICS
   ═══════════════════════════════════════════════════════════ */
document.getElementById("load-stats").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const total = await rc.getTotalRegisteredSuppliers();
    const active = await rc.getActiveSuppliersCount();
    const inactive = await rc.getInactiveSuppliersCount();
    const verified = await rc.getVerifiedSuppliersCount();
    const penalties = await rc.getTotalPenaltiesCollected();
    const escrowHeld = await rc.getTotalEscrowHeld();
    const water = await rc.getAggregateResourceQuantity(0);
    const clothing = await rc.getAggregateResourceQuantity(1);
    const medicine = await rc.getAggregateResourceQuantity(2);
    const food = await rc.getAggregateResourceQuantity(3);

    let reputationLine = "";
    try {
      const myReputation = await rc.getSupplierReputation(userAddress);
      const myTier = await rc.getReputationTier(userAddress);
      reputationLine = "<p>Your Reputation: " + myReputation + " (" + myTier + ")</p>";
    } catch (e) {
      reputationLine = "<p>Your Reputation: Not registered</p>";
    }

    document.getElementById("stats-output").innerHTML =
      "<p>Total Suppliers: " + total + "</p>" +
      "<p>Active Suppliers: " + active + "</p>" +
      "<p>Inactive Suppliers: " + inactive + "</p>" +
      "<p>Verified Suppliers: " + verified + "</p>" +
      "<p>Total Penalties Forfeited: " + penalties + " wei</p>" +
      "<p>Total Escrow Held: " + escrowHeld + " wei</p>" +
      reputationLine +
      "<p style='margin-top:16px;'><strong>Aggregate Quantities</strong></p>" +
      "<p>Water: " + water + "</p>" +
      "<p>Clothing: " + clothing + "</p>" +
      "<p>Medicine: " + medicine + "</p>" +
      "<p>Food: " + food + "</p>";
  } catch (err) {
    log("Failed to load stats: " + (err.reason || err.message));
  }
});

/* ═══════════════════════════════════════════════════════════
   CURSOR SPOTLIGHT
   ═══════════════════════════════════════════════════════════ */
(function initSpotlight() {
  const spot = document.getElementById("cursor-spotlight");
  if (!spot) return;
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let currentX = targetX;
  let currentY = targetY;

  document.addEventListener("mousemove", function (e) {
    targetX = e.clientX;
    targetY = e.clientY;
  });

  function animate() {
    currentX += (targetX - currentX) * 0.12;
    currentY += (targetY - currentY) * 0.12;
    spot.style.left = currentX + "px";
    spot.style.top = currentY + "px";
    requestAnimationFrame(animate);
  }
  animate();
})();

/* ═══════════════════════════════════════════════════════════
   RAIL + BUTTON CURSOR TRACKING (radial glow)
   ═══════════════════════════════════════════════════════════ */
function trackCursor(element) {
  element.addEventListener("mousemove", function (e) {
    const rect = element.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    element.style.setProperty("--mx", x + "%");
    element.style.setProperty("--my", y + "%");
  });
}

document.querySelectorAll(".rail-item, .pill").forEach(trackCursor);

/* ═══════════════════════════════════════════════════════════
   AMBIENT APP CANVAS (faint background node graph)
   ═══════════════════════════════════════════════════════════ */
(function initAppCanvas() {
  const appRoot = document.querySelector(".app");
  if (!appRoot) return;

  const canvas = document.createElement("canvas");
  canvas.id = "app-canvas";
  appRoot.insertBefore(canvas, appRoot.firstChild);

  const ctx = canvas.getContext("2d");
  let W, H, DPR, nodes = [];
  let mouse = { x: -9999, y: -9999 };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  function build() {
    nodes = [];
    const count = Math.min(30, Math.floor((W * H) / 40000));
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: 1 + Math.random() * 1.5,
        pulse: Math.random() * Math.PI * 2
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx; n.y += n.vy; n.pulse += 0.015;
      if (n.x < -20) n.x = W + 20;
      if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = H + 20;
      if (n.y > H + 20) n.y = -20;

      const dx = n.x - mouse.x, dy = n.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 150 * 150 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const force = (1 - d / 150) * 0.4;
        n.x += (dx / d) * force;
        n.y += (dy / d) * force;
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 200) {
          ctx.strokeStyle = "rgba(139,111,71," + (1 - d / 200) * 0.12 + ")";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const p = 0.6 + Math.sin(n.pulse) * 0.4;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(26,22,22," + 0.18 * p + ")";
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  document.addEventListener("mousemove", function (e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  resize();
  draw();
})();

/* ═══════════════════════════════════════════════════════════
   SCROLL REVEALS
   ═══════════════════════════════════════════════════════════ */
(function initScrollReveals() {
  const obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll(".block, .stat-row").forEach(function (el) {
    el.style.opacity = "0";
    el.style.transform = "translateY(24px)";
    el.style.transition = "opacity 0.7s cubic-bezier(.4,0,.2,1), transform 0.7s cubic-bezier(.4,0,.2,1)";
    obs.observe(el);
  });
})();

/* ═══════════════════════════════════════════════════════════
   MUTATION OBSERVER — re-track dynamically added buttons
   ═══════════════════════════════════════════════════════════ */
new MutationObserver(function () {
  document.querySelectorAll(".pill:not([data-tracked])").forEach(function (el) {
    el.setAttribute("data-tracked", "1");
    trackCursor(el);
  });
  initMagneticButtons();
}).observe(document.body, { childList: true, subtree: true });

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */
document.body.style.overflow = "hidden";
initMagneticButtons();