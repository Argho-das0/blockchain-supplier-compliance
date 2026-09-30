let CONTRACT_ADDRESS = null;

async function loadContractAddress() {
  if (CONTRACT_ADDRESS) return CONTRACT_ADDRESS;
  const res = await fetch("deployed-address.json?t=" + Date.now());
  const data = await res.json();
  CONTRACT_ADDRESS = data.address;
  console.log("Loaded contract address:", CONTRACT_ADDRESS);
  return CONTRACT_ADDRESS;
}

// A direct node provider that bypasses MetaMask's read cache.
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

// ═══════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
function toast(message, type) {
  type = type || "info";
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(function () {
    el.style.transition = "opacity .3s, transform .3s";
    el.style.opacity = "0";
    el.style.transform = "translateX(100%)";
    setTimeout(function () { el.remove(); }, 300);
  }, 4500);
}

// ═══════════════════════════════════════════════════════════
// LOG HELPER
// ═══════════════════════════════════════════════════════════
function log(message) {
  const output = document.getElementById("stats-output");
  if (output) {
    output.innerHTML = "<p>" + message + "</p>" + output.innerHTML;
  }
  console.log(message);
}

function getReadContract() {
  const readProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);
}

// ═══════════════════════════════════════════════════════════
// SIDEBAR NAVIGATION
// ═══════════════════════════════════════════════════════════
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
  document.querySelectorAll(".nav-item").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.section === name);
  });
  document.querySelectorAll(".section").forEach(function (sec) {
    sec.classList.toggle("active", sec.id === "section-" + name);
  });
  const info = PAGE_TITLES[name] || ["", ""];
  const tEl = document.getElementById("page-title");
  const sEl = document.getElementById("page-subtitle");
  if (tEl) tEl.textContent = info[0];
  if (sEl) sEl.textContent = info[1];
  const mainArea = document.querySelector(".main-area");
  if (mainArea) mainArea.scrollTop = 0;
}

document.querySelectorAll(".nav-item").forEach(function (btn) {
  btn.addEventListener("click", function () { switchSection(btn.dataset.section); });
});

// ═══════════════════════════════════════════════════════════
// OVERVIEW REFRESH
// ═══════════════════════════════════════════════════════════
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
    document.getElementById("ov-escrow").textContent = escrow.toString() + " wei";
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
      "<p><strong>Status:</strong> " + (info[3] ? "✅ Active" : "❌ Inactive") + "</p>" +
      "<p><strong>Reputation:</strong> " + reputation.toString() + " <span style='color:#6b7280;'>(" + tier + ")</span></p>" +
      "<p><strong>Resources:</strong> " + info[5].toString() + "</p>";
  } catch (err) {
    console.error("refreshOverview failed:", err.message);
  }
}

document.getElementById("refresh-overview").addEventListener("click", refreshOverview);

// ═══════════════════════════════════════════════════════════
// WALLET CONNECT
// ═══════════════════════════════════════════════════════════
document.getElementById("connect-wallet").addEventListener("click", async () => {
  if (window.ethereum) {
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

      log("✅ Wallet connected: " + userAddress);
      toast("Wallet connected", "success");

      if (!listening) {
        await startListening();
      }
      await refreshOverview();
    } catch (err) {
      log("❌ Error connecting wallet: " + err.message);
      toast("Connection failed: " + err.message, "error");
    }
  } else {
    log("MetaMask not detected. Please install MetaMask.");
    toast("MetaMask not detected", "error");
  }
});

// ═══════════════════════════════════════════════════════════
// REGISTER SUPPLIER
// ═══════════════════════════════════════════════════════════
document.getElementById("register-supplier").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const fee = await rc.REGISTRATION_FEE();
    const tx = await contract.registerSupplier({ value: fee });
    log("Registration tx sent: " + tx.hash);
    toast("Registration submitted…", "info");
    await tx.wait();
    log("✅ Supplier registered successfully!");
    toast("Supplier registered", "success");
    await refreshOverview();
  } catch (err) {
    const msg = err.reason || err.message;
    log("❌ Registration failed: " + msg);
    toast("Registration failed: " + msg, "error");
  }
});

// ═══════════════════════════════════════════════════════════
// RESOURCE MANAGEMENT
// ═══════════════════════════════════════════════════════════
document.getElementById("register-resource").addEventListener("click", async () => {
  try {
    const type = document.getElementById("resource-type").value;
    const qty = document.getElementById("resource-quantity").value;
    if (!qty || Number(qty) <= 0) {
      log("❌ Enter a quantity greater than zero.");
      toast("Enter a quantity greater than zero", "warn");
      return;
    }
    const tx = await contract.registerResource(type, qty);
    log("Resource registration tx: " + tx.hash);
    toast("Resource registration submitted…", "info");
    await tx.wait();
    log("✅ Resource registered successfully!");
    toast("Resource registered", "success");
    await refreshOverview();
  } catch (err) {
    const msg = err.reason || err.message;
    log("❌ Resource registration failed: " + msg);
    toast("Resource registration failed: " + msg, "error");
  }
});

document.getElementById("update-quantity").addEventListener("click", async () => {
  try {
    const type = document.getElementById("resource-type").value;
    const qty = document.getElementById("resource-quantity").value;
    if (!qty || Number(qty) <= 0) {
      log("❌ Enter a quantity greater than zero.");
      toast("Enter a quantity greater than zero", "warn");
      return;
    }
    const tx = await contract.updateResourceQuantity(type, qty);
    log("Update tx: " + tx.hash);
    toast("Update submitted…", "info");
    await tx.wait();
    log("✅ Quantity updated and 24h compliance timer refreshed!");
    toast("Quantity updated", "success");
    await refreshOverview();
  } catch (err) {
    const msg = err.reason || err.message;
    log("❌ Update failed: " + msg);
    toast("Update failed: " + msg, "error");
  }
});

// ═══════════════════════════════════════════════════════════
// COMPLIANCE COUNTDOWN
// ═══════════════════════════════════════════════════════════
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
    const icons = ["💧", "👕", "💊", "🍚"];
    let html = "";

    for (let i = 0; i < 4; i++) {
      const qty = await rc.getSupplierResourceQuantity(userAddress, i);
      if (qty.toString() === "0") continue;

      const remaining = await rc.remainingComplianceTime(userAddress, i);
      const seconds = Number(remaining);

      let color, status;
      if (seconds === 0) {
        color = "#dc2626"; status = "EXPIRED — will be deactivated";
      } else if (seconds < 3600) {
        color = "#ea580c"; status = "URGENT — under 1 hour remaining";
      } else if (seconds < 21600) {
        color = "#eab308"; status = "Approaching deadline";
      } else {
        color = "#16a34a"; status = "Compliant";
      }

      html +=
        '<div style="margin-bottom:12px; padding:14px; background:#fff; border-left:4px solid ' + color + '; border-radius:10px; box-shadow:0 1px 2px rgba(0,0,0,.04);">' +
        '<div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">' +
        '<span style="font-size:18px;">' + icons[i] + '</span>' +
        '<strong>' + resourceNames[i] + '</strong>' +
        '<span style="color:#6b7280; font-size:12px;">— quantity ' + qty.toString() + '</span>' +
        '</div>' +
        '<div style="color:' + color + '; font-weight:600; font-size:13px;">' + status + '</div>' +
        '<div style="font-family:monospace; font-size:12.5px; color:#4b5563; margin-top:4px;">Time remaining: ' + formatDuration(seconds) + '</div>' +
        '</div>';
    }

    if (!html) html = "<p class='muted'>No resources registered yet.</p>";
    document.getElementById("countdown-output").innerHTML = html;
  } catch (err) {
    log("❌ Failed to load countdown: " + (err.reason || err.message));
    toast("Countdown failed", "error");
  }
});

// ═══════════════════════════════════════════════════════════
// TIME SIMULATION
// ═══════════════════════════════════════════════════════════
async function advanceBlockchainTime(seconds, label) {
  try {
    const localProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
    await localProvider.send("evm_increaseTime", [seconds]);
    await localProvider.send("evm_mine", []);
    document.getElementById("time-status").innerText = "Fast-forwarded: " + label;
    log("⏩ Advanced blockchain time by " + label + ".");
    toast("Time advanced by " + label, "success");
  } catch (err) {
    log("❌ Failed to advance time: " + err.message);
    toast("Time advance failed (Sepolia doesn't support this)", "error");
  }
}

document.getElementById("skip-1-day").addEventListener("click", function () { advanceBlockchainTime(90000, "25 Hours"); });
document.getElementById("skip-3-days").addEventListener("click", function () { advanceBlockchainTime(259200, "3 Days"); });
document.getElementById("skip-10-days").addEventListener("click", function () { advanceBlockchainTime(864000, "10 Days"); });

// ═══════════════════════════════════════════════════════════
// CHECK COMPLIANCE
// ═══════════════════════════════════════════════════════════
document.getElementById("check-compliance").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const infoBefore = await rc.getSupplierInfo(userAddress);
    if (!infoBefore[2]) {
      toast("Wallet is not registered as a supplier", "warn");
      return;
    }
    if (!infoBefore[3]) {
      toast("Supplier is already INACTIVE", "warn");
      return;
    }
    const ownerAddress = await rc.owner();
    if (userAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      toast("Only the compliance officer can deactivate", "error");
      return;
    }
    const tx = await contract.checkAndDeactivate(userAddress);
    log("Check compliance tx sent: " + tx.hash);
    toast("Compliance check submitted…", "info");
    await tx.wait();
    const infoAfter = await rc.getSupplierInfo(userAddress);
    if (!infoAfter[3]) {
      log("🚨 Supplier non-compliant! Status changed to INACTIVE.");
      toast("Supplier deactivated", "warn");
    } else {
      log("✅ Supplier is currently COMPLIANT.");
      toast("Supplier is compliant", "success");
    }
    await refreshOverview();
  } catch (err) {
    const msg = err.reason || err.message;
    log("❌ Compliance check failed: " + msg);
    toast("Compliance check failed: " + msg, "error");
  }
});

// ═══════════════════════════════════════════════════════════
// CALCULATE PENALTY
// ═══════════════════════════════════════════════════════════
document.getElementById("calculate-penalty").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const info = await rc.getSupplierInfo(userAddress);
    if (!info[2]) { toast("Wallet is not registered", "warn"); return; }
    if (info[3]) { toast("Supplier is active — no penalty applies", "warn"); return; }
    const penalty = await rc.calculatePenalty(userAddress);
    log("💰 Calculated Penalty: " + penalty.toString() + " wei");
    toast("Penalty: " + penalty.toString() + " wei", "info");
  } catch (err) {
    log("❌ Penalty calculation failed: " + (err.reason || err.message));
    toast("Penalty calculation failed", "error");
  }
});

// ═══════════════════════════════════════════════════════════
// PAY PENALTY
// ═══════════════════════════════════════════════════════════
document.getElementById("pay-penalty").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const info = await rc.getSupplierInfo(userAddress);
    if (!info[2]) { toast("Wallet is not registered", "warn"); return; }
    if (info[3]) { toast("Supplier is already active", "warn"); return; }
    const penalty = await rc.calculatePenalty(userAddress);
    log("Submitting penalty payment of " + penalty.toString() + " wei into escrow...");
    toast("Submitting penalty…", "info");
    const tx = await contract.payPenaltyAndReactivate({
      value: penalty.toString(),
      gasLimit: 300000
    });
    log("Payment tx sent: " + tx.hash);
    await tx.wait();
    log("🎉 Penalty paid! Funds held in escrow.");
    toast("Penalty paid — supplier reactivated", "success");
    await refreshOverview();
  } catch (err) {
    const msg = err.reason || err.message;
    log("❌ Penalty payment failed: " + msg);
    toast("Penalty payment failed: " + msg, "error");
  }
});

// ═══════════════════════════════════════════════════════════
// ESCROW
// ═══════════════════════════════════════════════════════════
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
    if (releasable) statusText = "✅ Ready to release";
    else if (forfeitEligible) statusText = "❌ Eligible for forfeit";
    else statusText = "⏳ Awaiting compliance window";

    document.getElementById("escrow-status").innerHTML =
      "<p><strong>Amount in escrow:</strong> <code>" + balance.toString() + " wei</code></p>" +
      "<p><strong>Release date:</strong> " + releaseDate.toLocaleString() + "</p>" +
      "<p><strong>Days remaining:</strong> " + daysLeft + "</p>" +
      "<p><strong>Status:</strong> " + statusText + "</p>";
  } catch (err) {
    log("❌ Failed to load escrow: " + (err.reason || err.message));
    toast("Escrow load failed", "error");
  }
});

// ═══════════════════════════════════════════════════════════
// REPUTATION
// ═══════════════════════════════════════════════════════════
document.getElementById("load-reputation").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const score = await rc.getSupplierReputation(userAddress);
    const tier = await rc.getReputationTier(userAddress);
    const n = Number(score);
    let barColor;
    if (n >= 180) barColor = "#8b5cf6";
    else if (n >= 150) barColor = "#eab308";
    else if (n >= 120) barColor = "#9ca3af";
    else if (n >= 80)  barColor = "#b45309";
    else               barColor = "#dc2626";
    const percentage = Math.min(100, (n / 200) * 100);

    document.getElementById("reputation-status").innerHTML =
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
      '<span style="font-size:24px; font-weight:700; font-family:monospace;">' + score.toString() + '</span>' +
      '<span style="font-size:12px; color:#6b7280;">/ 200</span>' +
      '</div>' +
      '<p style="margin:6px 0;"><strong>Tier:</strong> ' + tier + '</p>' +
      '<div style="background:#e5e7eb; border-radius:6px; height:14px; margin-top:8px; overflow:hidden;">' +
      '<div style="background:' + barColor + '; width:' + percentage + '%; height:100%; transition:width .4s;"></div>' +
      '</div>';
  } catch (err) {
    log("❌ Failed to load reputation: " + (err.reason || err.message));
    toast("Reputation load failed", "error");
  }
});

// ═══════════════════════════════════════════════════════════
// EMERGENCY PAUSE
// ═══════════════════════════════════════════════════════════
document.getElementById("check-pause-status").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const isPaused = await rc.paused();
    document.getElementById("pause-status").innerHTML = isPaused
      ? '<p style="color:#dc2626;"><strong>⚠️ CONTRACT PAUSED</strong> — state changes halted.</p>'
      : '<p style="color:#16a34a;"><strong>✅ Contract active</strong> — operations running normally.</p>';
  } catch (err) {
    log("❌ Failed to check pause status: " + (err.reason || err.message));
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
    log("Pause tx sent: " + tx.hash);
    toast("Pausing…", "info");
    await tx.wait();
    log("⏸️ Contract PAUSED.");
    toast("Contract paused", "warn");
  } catch (err) {
    const msg = err.reason || err.message;
    log("❌ Pause failed: " + msg);
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
    log("Unpause tx sent: " + tx.hash);
    toast("Unpausing…", "info");
    await tx.wait();
    log("▶️ Contract UNPAUSED.");
    toast("Contract resumed", "success");
  } catch (err) {
    const msg = err.reason || err.message;
    log("❌ Unpause failed: " + msg);
    toast("Unpause failed: " + msg, "error");
  }
});

// ═══════════════════════════════════════════════════════════
// LIVE EVENT LOG
// ═══════════════════════════════════════════════════════════
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
    ["SupplierRegistered", function (s) { appendEvent("🆕 SupplierRegistered: " + shorten(s)); }],
    ["ResourceRegistered", function (s, r) { appendEvent("📦 ResourceRegistered: " + r + " (" + shorten(s) + ")"); }],
    ["ResourceUpdated", function (s, r, q) { appendEvent("🔄 ResourceUpdated: " + r + " = " + q.toString()); }],
    ["SupplierDeactivated", function (s) { appendEvent("🚨 SupplierDeactivated: " + shorten(s)); }],
    ["PenaltyPaid", function (s, a) { appendEvent("💰 PenaltyPaid: " + a.toString() + " wei"); }],
    ["SupplierReactivated", function (s) { appendEvent("✅ SupplierReactivated: " + shorten(s)); }],
    ["EscrowDeposited", function (s, a) { appendEvent("🔒 EscrowDeposited: " + a.toString() + " wei"); }],
    ["EscrowReleased", function (s, a) { appendEvent("💵 EscrowReleased: " + a.toString() + " wei"); }],
    ["EscrowForfeited", function (s, a, r) { appendEvent("💸 EscrowForfeited: " + a.toString() + " wei to " + shorten(r)); }],
    ["ReputationChanged", function (s, o, n, reason) { appendEvent("⭐ Reputation: " + o + " → " + n + " (" + reason + ")"); }],
    ["ContractPaused", function (by) { appendEvent("⏸️ ContractPaused by " + shorten(by)); }],
    ["ContractUnpaused", function (by) { appendEvent("▶️ ContractUnpaused by " + shorten(by)); }]
  ];

  for (let i = 0; i < handlers.length; i++) {
    const name = handlers[i][0];
    const handler = handlers[i][1];
    const wrapped = function () { handler.apply(null, arguments); };
    rc.on(name, wrapped);
    eventListeners.push({ name: name, wrapped: wrapped });
  }

  listening = true;
  document.getElementById("toggle-events").textContent = "Stop Listening";
  appendEvent("🎧 Listening for events...");
}

function stopListening() {
  if (!listening) return;
  const rc = getReadContract();
  for (let i = 0; i < eventListeners.length; i++) {
    rc.off(eventListeners[i].name, eventListeners[i].wrapped);
  }
  eventListeners = [];
  listening = false;
  document.getElementById("toggle-events").textContent = "Start Listening";
  appendEvent("⏸️ Stopped listening.");
}

document.getElementById("toggle-events").addEventListener("click", async () => {
  if (listening) stopListening();
  else await startListening();
});

document.getElementById("clear-events").addEventListener("click", function () {
  document.getElementById("event-log").innerHTML =
    '<p style="color:#94a3b8; margin:0;">Cleared.</p>';
});

// ═══════════════════════════════════════════════════════════
// LOAD STATISTICS
// ═══════════════════════════════════════════════════════════
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
      "<h3>Aggregate Quantities</h3>" +
      "<p>Water: " + water + "</p>" +
      "<p>Clothing: " + clothing + "</p>" +
      "<p>Medicine: " + medicine + "</p>" +
      "<p>Food: " + food + "</p>";
  } catch (err) {
    log("❌ Failed to load stats: " + (err.reason || err.message));
  }
});