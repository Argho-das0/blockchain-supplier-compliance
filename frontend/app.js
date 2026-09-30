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

function log(message) {
  const output = document.getElementById("stats-output");
  if (output) {
    output.innerHTML = `<p>${message}</p>` + output.innerHTML;
  }
  console.log(message);
}

function getReadContract() {
  const readProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);
}

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
      log("✅ Wallet connected: " + userAddress);
    } catch (err) {
      log("❌ Error connecting wallet: " + err.message);
    }
  } else {
    log("MetaMask not detected. Please install MetaMask.");
  }
});

document.getElementById("register-supplier").addEventListener("click", async () => {
  try {
    const readContract = getReadContract();
    const fee = await readContract.REGISTRATION_FEE();
    const tx = await contract.registerSupplier({ value: fee });
    log("Registration tx sent: " + tx.hash);
    await tx.wait();
    log("✅ Supplier registered successfully!");
  } catch (err) {
    log("❌ Registration failed: " + (err.reason || err.message));
  }
});

document.getElementById("register-resource").addEventListener("click", async () => {
  try {
    const type = document.getElementById("resource-type").value;
    const qty = document.getElementById("resource-quantity").value;
    if (!qty || Number(qty) <= 0) {
      log("❌ Enter a quantity greater than zero.");
      return;
    }
    const tx = await contract.registerResource(type, qty);
    log("Resource registration tx: " + tx.hash);
    await tx.wait();
    log("✅ Resource registered successfully!");
  } catch (err) {
    log("❌ Resource registration failed: " + (err.reason || err.message));
  }
});

document.getElementById("update-quantity").addEventListener("click", async () => {
  try {
    const type = document.getElementById("resource-type").value;
    const qty = document.getElementById("resource-quantity").value;
    if (!qty || Number(qty) <= 0) {
      log("❌ Enter a quantity greater than zero.");
      return;
    }
    const tx = await contract.updateResourceQuantity(type, qty);
    log("Update tx: " + tx.hash);
    await tx.wait();
    log("✅ Quantity updated and 24h compliance timer refreshed!");
  } catch (err) {
    log("❌ Update failed: " + (err.reason || err.message));
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

    const timeStatus = document.getElementById("time-status");
    if (timeStatus) timeStatus.innerText = `Fast-forwarded: ${label}`;
    log(`⏩ Advanced blockchain time by ${label}.`);
  } catch (err) {
    log("❌ Failed to advance time: " + err.message);
  }
}

document.getElementById("skip-1-day").addEventListener("click", () => advanceBlockchainTime(90000, "25 Hours"));
document.getElementById("skip-3-days").addEventListener("click", () => advanceBlockchainTime(259200, "3 Days"));
document.getElementById("skip-10-days").addEventListener("click", () => advanceBlockchainTime(864000, "10 Days"));

// ═══════════════════════════════════════════════════════════
// CHECK COMPLIANCE & DEACTIVATE
// ═══════════════════════════════════════════════════════════
document.getElementById("check-compliance").addEventListener("click", async () => {
  try {
    const readContract = getReadContract();
    const infoBefore = await readContract.getSupplierInfo(userAddress);
    if (!infoBefore[2]) {
      log("❌ Wallet is not registered as a supplier.");
      return;
    }

    if (!infoBefore[3]) {
      log("⚠️ Supplier is already INACTIVE (deactivated).");
      return;
    }

    const ownerAddress = await readContract.owner();
    if (userAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      log("❌ Only the compliance officer (" + ownerAddress.slice(0, 8) + "...) can trigger deactivation.");
      return;
    }

    const tx = await contract.checkAndDeactivate(userAddress);
    log("Check compliance tx sent: " + tx.hash);
    await tx.wait();

    const infoAfter = await readContract.getSupplierInfo(userAddress);
    if (!infoAfter[3]) {
      log("🚨 Supplier non-compliant! Status changed to INACTIVE.");
    } else {
      log("✅ Supplier is currently COMPLIANT (within the 24-hour update window).");
    }
  } catch (err) {
    log("❌ Compliance check failed: " + (err.reason || err.message));
  }
});

// ═══════════════════════════════════════════════════════════
// CALCULATE PENALTY
// ═══════════════════════════════════════════════════════════
document.getElementById("calculate-penalty").addEventListener("click", async () => {
  try {
    const readContract = getReadContract();
    const info = await readContract.getSupplierInfo(userAddress);
    if (!info[2]) {
      log("❌ Wallet is not registered as a supplier.");
      return;
    }

    if (info[3]) {
      log("ℹ️ Supplier is currently ACTIVE. Penalty applies only after deactivation.");
      return;
    }

    const penalty = await readContract.calculatePenalty(userAddress);
    log(`💰 Calculated Penalty: ${penalty.toString()} wei`);
  } catch (err) {
    log("❌ Penalty calculation failed: " + (err.reason || err.message));
  }
});

// ═══════════════════════════════════════════════════════════
// PAY PENALTY & REACTIVATE
// ═══════════════════════════════════════════════════════════
document.getElementById("pay-penalty").addEventListener("click", async () => {
  try {
    const readContract = getReadContract();
    const info = await readContract.getSupplierInfo(userAddress);
    if (!info[2]) {
      log("❌ Wallet is not registered as a supplier.");
      return;
    }

    if (info[3]) {
      log("ℹ️ Supplier is already ACTIVE. No penalty payment required.");
      return;
    }

    const penalty = await readContract.calculatePenalty(userAddress);
    log(`Submitting penalty payment of ${penalty.toString()} wei into escrow...`);

    const tx = await contract.payPenaltyAndReactivate({
      value: penalty.toString(),
      gasLimit: 300000
    });

    log("Payment tx sent: " + tx.hash);
    await tx.wait();
    log("🎉 Penalty paid! Funds held in escrow. Reactivated. Compliance timers reset.");
    log("ℹ️  Stay compliant for 30 days to get the full refund.");
  } catch (err) {
    log("❌ Penalty payment failed: " + (err.reason || err.message));
  }
});

// ═══════════════════════════════════════════════════════════
// LOAD ESCROW STATUS
// ═══════════════════════════════════════════════════════════
document.getElementById("load-escrow").addEventListener("click", async () => {
  try {
    const readContract = getReadContract();
    const info = await readContract.getEscrowInfo(userAddress);

    const balance = info[0];
    const releaseTime = info[1];
    const releasable = info[2];
    const forfeitEligible = info[3];

    if (balance.toString() === "0") {
      document.getElementById("escrow-status").innerHTML =
        `<p>No penalty currently held in escrow for this wallet.</p>`;
      return;
    }

    const releaseDate = new Date(Number(releaseTime) * 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    const daysLeft = Math.max(0, Math.ceil((Number(releaseTime) - nowSec) / 86400));

    let statusText;
    if (releasable) {
      statusText = "✅ Ready to release — 30-day window complete and supplier active";
    } else if (forfeitEligible) {
      statusText = "❌ Eligible for forfeit — supplier inactive within window";
    } else {
      statusText = "⏳ Awaiting compliance window";
    }

    document.getElementById("escrow-status").innerHTML = `
      <p><strong>Amount in escrow:</strong> ${balance.toString()} wei</p>
      <p><strong>Release date:</strong> ${releaseDate.toLocaleString()}</p>
      <p><strong>Days remaining:</strong> ${daysLeft}</p>
      <p><strong>Status:</strong> ${statusText}</p>
    `;
  } catch (err) {
    log("❌ Failed to load escrow: " + (err.reason || err.message));
  }
});

// ═══════════════════════════════════════════════════════════
// LOAD REPUTATION
// ═══════════════════════════════════════════════════════════
document.getElementById("load-reputation").addEventListener("click", async () => {
  try {
    const readContract = getReadContract();
    const score = await readContract.getSupplierReputation(userAddress);
    const tier = await readContract.getReputationTier(userAddress);

    const n = Number(score);
    let barColor;
    if (n >= 180) barColor = "#8b5cf6";
    else if (n >= 150) barColor = "#eab308";
    else if (n >= 120) barColor = "#9ca3af";
    else if (n >= 80)  barColor = "#b45309";
    else               barColor = "#dc2626";

    const percentage = Math.min(100, (n / 200) * 100);

    document.getElementById("reputation-status").innerHTML = `
      <p><strong>Score:</strong> ${score.toString()} / 200</p>
      <p><strong>Tier:</strong> ${tier}</p>
      <div style="background:#e5e7eb; border-radius:6px; height:14px; margin-top:8px; overflow:hidden;">
        <div style="background:${barColor}; width:${percentage}%; height:100%;"></div>
      </div>
    `;
  } catch (err) {
    log("❌ Failed to load reputation: " + (err.reason || err.message));
  }
});

// ═══════════════════════════════════════════════════════════
// EMERGENCY PAUSE
// ═══════════════════════════════════════════════════════════
document.getElementById("check-pause-status").addEventListener("click", async () => {
  try {
    const readContract = getReadContract();
    const isPaused = await readContract.paused();
    document.getElementById("pause-status").innerHTML = isPaused
      ? `<p style="color:#dc2626;"><strong>⚠️ CONTRACT PAUSED</strong> — all state-changing operations are halted.</p>`
      : `<p style="color:#16a34a;"><strong>✅ Contract active</strong> — operations running normally.</p>`;
  } catch (err) {
    log("❌ Failed to check pause status: " + (err.reason || err.message));
  }
});

document.getElementById("pause-contract").addEventListener("click", async () => {
  try {
    const readContract = getReadContract();
    const ownerAddress = await readContract.owner();
    if (userAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      log("❌ Only the compliance officer (" + ownerAddress.slice(0, 8) + "...) can pause the contract.");
      return;
    }
    const tx = await contract.pause();
    log("Pause tx sent: " + tx.hash);
    await tx.wait();
    log("⏸️ Contract PAUSED. All state-changing operations halted.");
  } catch (err) {
    log("❌ Pause failed: " + (err.reason || err.message));
  }
});

document.getElementById("unpause-contract").addEventListener("click", async () => {
  try {
    const readContract = getReadContract();
    const ownerAddress = await readContract.owner();
    if (userAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      log("❌ Only the compliance officer (" + ownerAddress.slice(0, 8) + "...) can unpause the contract.");
      return;
    }
    const tx = await contract.unpause();
    log("Unpause tx sent: " + tx.hash);
    await tx.wait();
    log("▶️ Contract UNPAUSED. Operations resumed.");
  } catch (err) {
    log("❌ Unpause failed: " + (err.reason || err.message));
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
  el.innerHTML = `<div>[${time}] ${line}</div>` + el.innerHTML;
}

async function startListening() {
  if (listening) return;
  await loadContractAddress();
  const readContract = getReadContract();

  const handlers = [
    ["SupplierRegistered", (supplier, ts) => appendEvent(`🆕 SupplierRegistered: ${shorten(supplier)}`)],
    ["ResourceRegistered", (supplier, resource) => appendEvent(`📦 ResourceRegistered: ${resource} (${shorten(supplier)})`)],
    ["ResourceUpdated", (supplier, resource, qty) => appendEvent(`🔄 ResourceUpdated: ${resource} = ${qty.toString()}`)],
    ["SupplierDeactivated", (supplier, ts) => appendEvent(`🚨 SupplierDeactivated: ${shorten(supplier)}`)],
    ["PenaltyPaid", (supplier, amount) => appendEvent(`💰 PenaltyPaid: ${amount.toString()} wei`)],
    ["SupplierReactivated", (supplier, ts) => appendEvent(`✅ SupplierReactivated: ${shorten(supplier)}`)],
    ["EscrowDeposited", (supplier, amount, release) => appendEvent(`🔒 EscrowDeposited: ${amount.toString()} wei`)],
    ["EscrowReleased", (supplier, amount) => appendEvent(`💵 EscrowReleased: ${amount.toString()} wei`)],
    ["EscrowForfeited", (supplier, amount, recipient) => appendEvent(`💸 EscrowForfeited: ${amount.toString()} wei to ${shorten(recipient)}`)],
    ["ReputationChanged", (supplier, oldScore, newScore, reason) => appendEvent(`⭐ Reputation: ${oldScore} → ${newScore} (${reason})`)],
    ["ContractPaused", (by, ts) => appendEvent(`⏸️ ContractPaused by ${shorten(by)}`)],
    ["ContractUnpaused", (by, ts) => appendEvent(`▶️ ContractUnpaused by ${shorten(by)}`)],
  ];

  for (const [name, handler] of handlers) {
    const wrapped = (...args) => handler(...args);
    readContract.on(name, wrapped);
    eventListeners.push({ name, wrapped });
  }

  listening = true;
  document.getElementById("toggle-events").textContent = "Stop Listening";
  appendEvent("🎧 Listening for events...");
}

function stopListening() {
  if (!listening) return;
  const readContract = getReadContract();
  for (const { name, wrapped } of eventListeners) {
    readContract.off(name, wrapped);
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

document.getElementById("clear-events").addEventListener("click", () => {
  document.getElementById("event-log").innerHTML = `<p style="color:#94a3b8; margin:0;">Cleared.</p>`;
});

// ═══════════════════════════════════════════════════════════
// LOAD STATISTICS
// ═══════════════════════════════════════════════════════════
document.getElementById("load-stats").addEventListener("click", async () => {
  try {
    const readContract = getReadContract();
    const total = await readContract.getTotalRegisteredSuppliers();
    const active = await readContract.getActiveSuppliersCount();
    const inactive = await readContract.getInactiveSuppliersCount();
    const verified = await readContract.getVerifiedSuppliersCount();
    const penalties = await readContract.getTotalPenaltiesCollected();
    const escrowHeld = await readContract.getTotalEscrowHeld();
    const water = await readContract.getAggregateResourceQuantity(0);
    const clothing = await readContract.getAggregateResourceQuantity(1);
    const medicine = await readContract.getAggregateResourceQuantity(2);
    const food = await readContract.getAggregateResourceQuantity(3);

    // Reputation only exists for wallets that registered as suppliers.
    let reputationLine = "";
    try {
      const myReputation = await readContract.getSupplierReputation(userAddress);
      const myTier = await readContract.getReputationTier(userAddress);
      reputationLine = `<p>Your Reputation: ${myReputation} (${myTier})</p>`;
    } catch (e) {
      reputationLine = `<p>Your Reputation: Not registered</p>`;
    }

    document.getElementById("stats-output").innerHTML = `
      <p>Total Suppliers: ${total}</p>
      <p>Active Suppliers: ${active}</p>
      <p>Inactive Suppliers: ${inactive}</p>
      <p>Verified Suppliers: ${verified}</p>
      <p>Total Penalties Forfeited: ${penalties} wei</p>
      <p>Total Escrow Held: ${escrowHeld} wei</p>
      ${reputationLine}
      <h3>Aggregate Quantities</h3>
      <p>Water: ${water}</p>
      <p>Clothing: ${clothing}</p>
      <p>Medicine: ${medicine}</p>
      <p>Food: ${food}</p>
    `;
  } catch (err) {
    log("❌ Failed to load stats: " + (err.reason || err.message));
  }
});