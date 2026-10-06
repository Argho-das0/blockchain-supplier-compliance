let CONTRACT_ADDRESS = null;

async function loadContractAddress() {
  if (CONTRACT_ADDRESS) return CONTRACT_ADDRESS;
  const res = await fetch("deployed-address.json?t=" + Date.now());
  const data = await res.json();
  CONTRACT_ADDRESS = data.address;
  console.log("Loaded contract address:", CONTRACT_ADDRESS);
  return CONTRACT_ADDRESS;
}

const RPC_URL = "http://127.0.0.1:8545";
const HARDHAT_CHAIN_ID_HEX = "0x7a69";
const HARDHAT_CHAIN_PARAMS = {
  chainId: HARDHAT_CHAIN_ID_HEX,
  chainName: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["http://127.0.0.1:8545"],
};

async function ensureHardhatNetwork() {
  if (!window.ethereum) throw new Error("MetaMask not detected");
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HARDHAT_CHAIN_ID_HEX }],
    });
  } catch (err) {
    if (err.code === 4902 || err?.data?.originalError?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [HARDHAT_CHAIN_PARAMS],
      });
    } else throw err;
  }
}

const CONTRACT_ABI = [
  "function REGISTRATION_FEE() view returns (uint256)",
  "function COMPLIANCE_PERIOD() view returns (uint256)",
  "function ESCROW_PERIOD() view returns (uint256)",
  "function admin() view returns (address)",
  "function getAdmin() view returns (address)",
  "function isAdmin(address) view returns (bool)",
  "function aidFundAddress() view returns (address)",
  "function paused() view returns (bool)",
  "function setAdmin(address)",
  "function setAidFundAddress(address)",
  "function pause()",
  "function unpause()",
  "function applyAsSupplier(string,uint8) payable returns (uint256)",
  "function approveSupplier(uint256)",
  "function approveAllPending()",
  "function rejectSupplier(uint256)",
  "function checkAndDeactivate(uint256)",
  "function registerResource(uint256,uint8,uint256)",
  "function updateResourceQuantity(uint256,uint8,uint256)",
  "function isResourceCompliant(uint256,uint8) view returns (bool)",
  "function remainingComplianceTime(uint256,uint8) view returns (uint256)",
  "function getSupplierResourceQuantity(uint256,uint8) view returns (uint256)",
  "function calculatePenalty(uint256) view returns (uint256)",
  "function payPenaltyAndReactivate(uint256) payable",
  "function releaseEscrow(uint256)",
  "function forfeitEscrow(uint256)",
  "function getEscrowInfo(uint256) view returns (uint256,uint256,bool,bool)",
  "function nextSupplierId() view returns (uint256)",
  "function getSupplier(uint256) view returns (uint256,address,string,uint8,uint8,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint8)",
  "function getLastDeactivationDays(uint256) view returns (uint256)",
  "function getComplianceRatio(uint256) view returns (uint256)",
  "function getTrustTier(uint256) view returns (uint8)",
  "function predictDeactivationPenalty(uint256) view returns (uint256)",
  "function getMySupplierIds() view returns (uint256[])",
  "function getSupplierIdsOf(address) view returns (uint256[])",
  "function getAllSupplierIds() view returns (uint256[])",
  "function getStats() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
  "function getTotalFundsCollected() view returns (uint256)",
  "function getTypeCounts() view returns (uint256[])",
  "function getTopPerformers(uint256) view returns (uint256[],uint256[])",
  "function getFrequentDefaulters(uint256) view returns (uint256[],uint256[])",
  "function getAggregateResourceQuantity(uint8) view returns (uint256)",
  "event SupplierApplied(uint256 indexed,address indexed,string,uint8,uint256)",
  "event SupplierApproved(uint256 indexed,uint256)",
  "event SupplierRejected(uint256 indexed,uint256,uint256)",
  "event SupplierDeactivated(uint256 indexed,uint256,uint256)",
  "event SupplierReactivated(uint256 indexed,uint256)",
  "event ResourceRegistered(uint256 indexed,string,uint256)",
  "event ResourceUpdated(uint256 indexed,string,uint256,uint256)",
  "event PenaltyPaid(uint256 indexed,uint256,uint256)",
  "event EscrowDeposited(uint256 indexed,uint256,uint256,uint256)",
  "event EscrowReleased(uint256 indexed,uint256,uint256)",
  "event EscrowForfeited(uint256 indexed,uint256,address,uint256)",
  "event ReputationChanged(uint256 indexed,uint256,uint256,string,uint256)",
  "event ContractPaused(address indexed,uint256)",
  "event ContractUnpaused(address indexed,uint256)",
  "event AdminChanged(address indexed,address indexed)",
  "event AidFundAddressUpdated(address indexed)"
];

const TYPE_NAMES  = ["NGO","Vendor","Corporate","Individual","Government","Healthcare","Educational","Religious","Other"];
const STATE_NAMES = ["Pending","Active","Inactive","Rejected"];
const RESOURCE_NAMES = ["Water","Clothing","Medicine","Food"];
const TRUST_NAMES = ["New","Developing","Trusted","Established"];

let provider, signer, contract, userAddress;
let isAdminUser = false;
let selectedSupplierId = null;
let analyticsCache = null;
let analyticsCharts = {};

function log(message) {
  const out = document.getElementById("stats-output");
  if (out) out.innerHTML = `<p>${message}</p>` + out.innerHTML;
  console.log(message);
}

function getReadContract() {
  const readProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);
}

function shorten(addr) {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function tierColor(score) {
  if (score >= 180) return "#8b5cf6";
  if (score >= 150) return "#eab308";
  if (score >= 120) return "#9ca3af";
  if (score >= 80)  return "#b45309";
  return "#dc2626";
}

function tierName(score) {
  if (score >= 180) return "Platinum";
  if (score >= 150) return "Gold";
  if (score >= 120) return "Silver";
  if (score >= 80)  return "Bronze";
  return "Probation";
}

function trustName(tier) {
  return TRUST_NAMES[Number(tier)] || "New";
}

function trustColor(tier) {
  const t = Number(tier);
  if (t === 3) return "#16a34a";
  if (t === 2) return "#2563eb";
  if (t === 1) return "#eab308";
  return "#dc2626";
}

// ============================================================
// ROLE ROUTING
// ============================================================
function showAdminDashboard() {
  document.getElementById("admin-dashboard").style.display = "block";
  document.getElementById("supplier-dashboard").style.display = "none";
  document.getElementById("not-connected-section").style.display = "none";
  const badge = document.getElementById("role-badge");
  badge.style.display = "inline-block";
  badge.className = "role-badge admin";
  badge.textContent = "Admin";
}

function showSupplierDashboard() {
  document.getElementById("admin-dashboard").style.display = "none";
  document.getElementById("supplier-dashboard").style.display = "block";
  document.getElementById("not-connected-section").style.display = "none";
  const badge = document.getElementById("role-badge");
  badge.style.display = "inline-block";
  badge.className = "role-badge supplier";
  badge.textContent = "Supplier";
}

// ============================================================
// ADMIN TABS
// ============================================================
function activateAdminTab(tabName) {
  document.querySelectorAll("#admin-dashboard .tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll("#admin-dashboard .tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === "tab-" + tabName);
  });

  if (tabName === "suppliers") {
    loadAdminSuppliers().catch(err => console.warn(err));
  } else if (tabName === "analytics") {
    if (!analyticsCache) refreshAnalytics().catch(err => console.warn(err));
    else renderAnalytics(analyticsCache.metrics);
  } else if (tabName === "overview") {
    loadAdminDashboard().catch(err => console.warn(err));
  }
}

document.querySelectorAll("#admin-dashboard .tab-btn").forEach(btn => {
  btn.addEventListener("click", () => activateAdminTab(btn.dataset.tab));
});

// ============================================================
// CONNECT
// ============================================================
async function connectWallet(interactive) {
  if (!window.ethereum) {
    if (interactive) log("MetaMask not detected.");
    return false;
  }
  try {
    await loadContractAddress();
    provider = new ethers.providers.Web3Provider(window.ethereum);

    if (interactive) {
      await provider.send("eth_requestAccounts", []);
    } else {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) return false;
    }

    await ensureHardhatNetwork();
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();

    const net = await provider.getNetwork();
    if (Number(net.chainId) !== 31337) {
      log("❌ Wrong chain: " + net.chainId);
      return false;
    }

    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    document.getElementById("account").textContent = shorten(userAddress);

    const readContract = getReadContract();
    const adminAddr = await readContract.getAdmin();
    isAdminUser = adminAddr.toLowerCase() === userAddress.toLowerCase();

    if (isAdminUser) {
      showAdminDashboard();
      activateAdminTab("overview");
      await loadAdminDashboard();
      refreshAnalytics().catch(e => console.warn("analytics failed:", e));
    } else {
      showSupplierDashboard();
      await loadMySuppliers();
    }

    if (interactive) log("✅ Connected: " + userAddress + (isAdminUser ? " (admin)" : " (supplier)"));

    if (!listening) await startListening();
    return true;
  } catch (err) {
    if (interactive) log("❌ Connect failed: " + (err.reason || err.message));
    console.warn(err);
    return false;
  }
}

document.getElementById("connect-wallet").addEventListener("click", () => connectWallet(true));

if (window.ethereum) {
  window.ethereum.on("chainChanged", async (chainId) => {
    if (chainId !== HARDHAT_CHAIN_ID_HEX) {
      try { await ensureHardhatNetwork(); } catch (e) { console.warn(e); }
    }
    window.location.reload();
  });
  window.ethereum.on("accountsChanged", () => window.location.reload());
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
document.getElementById("admin-refresh").addEventListener("click", loadAdminDashboard);
document.getElementById("admin-approve-all").addEventListener("click", async () => {
  try {
    const tx = await contract.approveAllPending();
    log("Approve-all tx: " + tx.hash);
    await tx.wait();
    log("✅ All pending suppliers approved.");
    await loadAdminDashboard();
    await refreshAnalytics();
  } catch (err) { log("❌ " + (err.reason || err.message)); }
});

async function loadAdminDashboard() {
  await Promise.all([
    loadAdminSummary(),
    loadAdminFunds(),
    loadAdminPending(),
    loadAdminDefaulters(),
    loadAdminTop(),
    loadAdminTypes(),
    loadAdminResources()
  ]);
}

async function loadAdminSummary() {
  const rc = getReadContract();
  const s = await rc.getStats();
  const html = `
    <div class="summary-grid">
      <div class="summary-card"><div class="value">${s[0]}</div><div class="label">Total Approved</div></div>
      <div class="summary-card"><div class="value">${s[1]}</div><div class="label">Active</div></div>
      <div class="summary-card"><div class="value">${s[2]}</div><div class="label">Inactive</div></div>
      <div class="summary-card"><div class="value">${s[3]}</div><div class="label">Pending</div></div>
      <div class="summary-card"><div class="value">${s[4]}</div><div class="label">Rejected</div></div>
    </div>`;
  document.getElementById("admin-summary-output").innerHTML = html;
}

async function loadAdminFunds() {
  const rc = getReadContract();
  const s = await rc.getStats();
  const reg  = s[5];
  const pen  = s[6];
  const esc  = s[7];
  const ref  = s[8];
  const total = reg.add(pen);
  document.getElementById("admin-funds-output").innerHTML = `
    <table class="kv">
      <tr><th>Registration fees retained</th><td>${reg.toString()} wei</td></tr>
      <tr><th>Penalties forfeited to aid fund</th><td>${pen.toString()} wei</td></tr>
      <tr><th>Escrow currently held</th><td>${esc.toString()} wei</td></tr>
      <tr><th>Escrow refunded</th><td>${ref.toString()} wei</td></tr>
      <tr><th>Total funds collected (reg + penalties)</th><td>${total.toString()} wei</td></tr>
    </table>`;
}

async function loadAdminPending() {
  const rc = getReadContract();
  const nextId = Number(await rc.nextSupplierId());
  let rows = "";
  for (let id = 1; id <= nextId; id++) {
    const s = await rc.getSupplier(id);
    if (Number(s[4]) !== 0) continue;
    rows += `
      <tr>
        <td>${s[0]}</td>
        <td>${s[2]}</td>
        <td><span class="type-chip">${TYPE_NAMES[Number(s[3])]}</span></td>
        <td>${shorten(s[1])}</td>
        <td>
          <button class="success btn-sm" onclick="approveOne(${s[0]})">Approve</button>
          <button class="danger btn-sm" onclick="rejectOne(${s[0]})">Reject</button>
        </td>
      </tr>`;
  }
  document.getElementById("admin-pending-output").innerHTML = rows
    ? `<table><tr><th>ID</th><th>Name</th><th>Type</th><th>Wallet</th><th>Actions</th></tr>${rows}</table>`
    : "<p>No pending applications.</p>";
}

window.approveOne = async (id) => {
  try {
    const tx = await contract.approveSupplier(id);
    log("Approve tx: " + tx.hash);
    await tx.wait();
    log("✅ Approved supplier #" + id);
    await loadAdminDashboard();
    await refreshAnalytics();
  } catch (err) { log("❌ " + (err.reason || err.message)); }
};

window.rejectOne = async (id) => {
  try {
    const tx = await contract.rejectSupplier(id);
    log("Reject tx: " + tx.hash);
    await tx.wait();
    log("🚫 Rejected supplier #" + id);
    await loadAdminDashboard();
    await refreshAnalytics();
  } catch (err) { log("❌ " + (err.reason || err.message)); }
};

async function loadAdminSuppliers() {
  const rc = getReadContract();
  const nextId = Number(await rc.nextSupplierId());
  const search = (document.getElementById("admin-search").value || "").toLowerCase();
  const filterType = document.getElementById("admin-filter-type").value;
  const filterState = document.getElementById("admin-filter-state").value;

  let rows = "";
  for (let id = 1; id <= nextId; id++) {
    const s = await rc.getSupplier(id);
    const name = s[2];
    const type = Number(s[3]);
    const state = Number(s[4]);
    if (search && !name.toLowerCase().includes(search)) continue;
    if (filterType !== "" && type !== Number(filterType)) continue;
    if (filterState !== "" && state !== Number(filterState)) continue;

    const rep = Number(s[5]);
    const trust = Number(s[13]);
    const compliant = Number(s[10]);
    const missed = Number(s[11]);
    const cycles = Number(s[12]);

    const btn = state === 1 ? `<button class="danger btn-sm" onclick="deactivateOne(${id})">Deactivate</button>` : "";
    rows += `
      <tr>
        <td>${s[0]}</td>
        <td>${name}</td>
        <td><span class="type-chip">${TYPE_NAMES[type]}</span></td>
        <td>${shorten(s[1])}</td>
        <td><span class="state-chip state-${STATE_NAMES[state]}">${STATE_NAMES[state]}</span></td>
        <td><span class="state-chip" style="background:${trustColor(trust)}; color:white;">${trustName(trust)}</span></td>
        <td>${rep} (${tierName(rep)})</td>
        <td>${compliant} / ${compliant + missed}</td>
        <td>${cycles}</td>
        <td>${s[6].toString()}</td>
        <td>${btn}</td>
      </tr>`;
  }
  document.getElementById("admin-suppliers-output").innerHTML = rows
    ? `<table>
         <tr>
           <th>ID</th><th>Name</th><th>Type</th><th>Wallet</th><th>State</th>
           <th>Trust</th><th>Reputation</th><th>Updates</th><th>Cycles</th>
           <th>Penalties Paid</th><th>Action</th>
         </tr>${rows}</table>`
    : "<p>No suppliers match filters.</p>";
}

window.deactivateOne = async (id) => {
  try {
    const tx = await contract.checkAndDeactivate(id);
    log("Deactivate tx: " + tx.hash);
    await tx.wait();
    log("🚨 Deactivated supplier #" + id);
    await loadAdminDashboard();
    await refreshAnalytics();
    if (document.getElementById("tab-suppliers").classList.contains("active")) {
      await loadAdminSuppliers();
    }
  } catch (err) { log("❌ " + (err.reason || err.message)); }
};

["admin-search", "admin-filter-type", "admin-filter-state"].forEach(elId =>
  document.getElementById(elId).addEventListener("input", loadAdminSuppliers)
);

async function loadAdminDefaulters() {
  const rc = getReadContract();
  const res = await rc.getFrequentDefaulters(10);
  const ids = res[0], amounts = res[1];
  if (!ids.length) {
    document.getElementById("admin-defaulters-output").innerHTML = "<p>No defaulters yet.</p>";
    return;
  }
  let rows = "";
  for (let i = 0; i < ids.length; i++) {
    const s = await rc.getSupplier(ids[i]);
    rows += `<tr>
      <td>${s[0]}</td><td>${s[2]}</td>
      <td><span class="type-chip">${TYPE_NAMES[Number(s[3])]}</span></td>
      <td>${shorten(s[1])}</td>
      <td>${amounts[i].toString()} wei</td>
      <td>${s[7]}</td>
      <td>${s[10]} / ${Number(s[10]) + Number(s[11])}</td>
    </tr>`;
  }
  document.getElementById("admin-defaulters-output").innerHTML = `
    <table>
      <tr><th>ID</th><th>Name</th><th>Type</th><th>Wallet</th><th>Penalties Paid</th><th>Deactivations</th><th>Updates</th></tr>
      ${rows}
    </table>`;
}

async function loadAdminTop() {
  const rc = getReadContract();
  const res = await rc.getTopPerformers(10);
  const ids = res[0], scores = res[1];
  if (!ids.length) {
    document.getElementById("admin-top-output").innerHTML = "<p>No active suppliers yet.</p>";
    return;
  }
  let rows = "";
  for (let i = 0; i < ids.length; i++) {
    const s = await rc.getSupplier(ids[i]);
    const trust = Number(s[13]);
    rows += `<tr>
      <td>#${i + 1}</td>
      <td>${s[0]}</td><td>${s[2]}</td>
      <td><span class="type-chip">${TYPE_NAMES[Number(s[3])]}</span></td>
      <td>${scores[i].toString()}</td>
      <td>${tierName(Number(scores[i]))}</td>
      <td><span class="state-chip" style="background:${trustColor(trust)}; color:white;">${trustName(trust)}</span></td>
      <td>${s[8]}</td>
    </tr>`;
  }
  document.getElementById("admin-top-output").innerHTML = `
    <table>
      <tr><th>Rank</th><th>ID</th><th>Name</th><th>Type</th><th>Score</th><th>Rep Tier</th><th>Trust</th><th>Resources</th></tr>
      ${rows}
    </table>`;
}

async function loadAdminTypes() {
  const rc = getReadContract();
  const counts = await rc.getTypeCounts();
  let total = 0;
  for (let i = 0; i < counts.length; i++) total += Number(counts[i]);
  let rows = "";
  for (let i = 0; i < counts.length; i++) {
    const c = Number(counts[i]);
    const pct = total === 0 ? 0 : Math.round((c / total) * 100);
    rows += `<tr>
      <td><span class="type-chip">${TYPE_NAMES[i]}</span></td>
      <td>${c}</td>
      <td>${pct}%</td>
    </tr>`;
  }
  document.getElementById("admin-types-output").innerHTML = `
    <table>
      <tr><th>Type</th><th>Count</th><th>Share</th></tr>
      ${rows}
      <tr><th>Total</th><th>${total}</th><th>100%</th></tr>
    </table>`;
}

async function loadAdminResources() {
  const rc = getReadContract();
  const q = [];
  for (let i = 0; i < 4; i++) q.push(await rc.getAggregateResourceQuantity(i));
  document.getElementById("admin-resources-output").innerHTML = `
    <table>
      <tr><th>Resource</th><th>Total Quantity</th></tr>
      ${RESOURCE_NAMES.map((n, i) => `<tr><td>${n}</td><td>${q[i].toString()}</td></tr>`).join("")}
    </table>`;
}

// ============================================================
// ANALYTICS
// ============================================================
async function loadAllEvents() {
  const rc = getReadContract();
  const names = [
    "SupplierApplied","SupplierApproved","SupplierRejected",
    "SupplierDeactivated","SupplierReactivated",
    "ResourceRegistered","ResourceUpdated",
    "PenaltyPaid","EscrowDeposited","EscrowReleased","EscrowForfeited",
    "ReputationChanged","ContractPaused","ContractUnpaused",
    "AdminChanged","AidFundAddressUpdated"
  ];
  const all = [];
  for (const name of names) {
    try {
      const logs = await rc.queryFilter(name, 0, "latest");
      for (const log of logs) {
        all.push({ name, block: log.blockNumber, args: log.args, txHash: log.transactionHash });
      }
    } catch (e) {
      console.warn("queryFilter failed for", name, e);
    }
  }
  all.sort((a, b) => a.block - b.block);

  const uniqueBlocks = [...new Set(all.map(e => e.block))];
  const blockTimes = {};
  for (const bn of uniqueBlocks) {
    try {
      const block = await rc.provider.getBlock(bn);
      blockTimes[bn] = block.timestamp;
    } catch (e) { blockTimes[bn] = 0; }
  }
  for (const ev of all) ev.timestamp = blockTimes[ev.block] || 0;

  return all;
}

function computeMetrics(events) {
  const suppliers = new Map();
  function get(id) {
    const k = id.toString();
    if (!suppliers.has(k)) {
      suppliers.set(k, {
        id: Number(id), name: "", type: 0, appliedAt: 0, approvedAt: 0,
        deactivations: 0, reactivations: 0, penaltiesPaid: 0n,
        resourceUpdates: 0, resourcesRegistered: 0,
        reputationNow: 100, escrowReleased: 0n, escrowForfeited: 0n, lastEventAt: 0,
      });
    }
    return suppliers.get(k);
  }

  for (const ev of events) {
    const a = ev.args;
    switch (ev.name) {
      case "SupplierApplied": {
        const s = get(a[0]);
        s.name = a[2];
        s.type = Number(a[3]);
        s.appliedAt = Number(a[4]) || ev.timestamp;
        break;
      }
      case "SupplierApproved": get(a[0]).approvedAt = Number(a[1]) || ev.timestamp; break;
      case "SupplierDeactivated": get(a[0]).deactivations++; break;
      case "SupplierReactivated": get(a[0]).reactivations++; break;
      case "PenaltyPaid": get(a[0]).penaltiesPaid += BigInt(a[1]); break;
      case "EscrowReleased": get(a[0]).escrowReleased += BigInt(a[1]); break;
      case "EscrowForfeited": get(a[0]).escrowForfeited += BigInt(a[1]); break;
      case "ResourceRegistered": get(a[0]).resourcesRegistered++; break;
      case "ResourceUpdated": get(a[0]).resourceUpdates++; break;
      case "ReputationChanged": get(a[0]).reputationNow = Number(a[2]); break;
    }
    if (a[0] !== undefined) get(a[0]).lastEventAt = Math.max(get(a[0]).lastEventAt, ev.timestamp);
  }

  const list = Array.from(suppliers.values());
  const totalPenaltiesPaid = list.reduce((acc, s) => acc + s.penaltiesPaid, 0n);
  const totalDeactivations = list.reduce((a, s) => a + s.deactivations, 0);
  const totalUpdates = list.reduce((a, s) => a + s.resourceUpdates, 0);
  const activeSuppliers = list.filter(s => s.approvedAt > 0 && s.reactivations >= s.deactivations);
  const avgRep = activeSuppliers.length
    ? Math.round(activeSuppliers.reduce((a, s) => a + s.reputationNow, 0) / activeSuppliers.length)
    : 0;

  const repBuckets = { Platinum: 0, Gold: 0, Silver: 0, Bronze: 0, Probation: 0 };
  for (const s of list) {
    const r = s.reputationNow;
    if (r >= 180) repBuckets.Platinum++;
    else if (r >= 150) repBuckets.Gold++;
    else if (r >= 120) repBuckets.Silver++;
    else if (r >= 80) repBuckets.Bronze++;
    else repBuckets.Probation++;
  }

  const typeCounts = new Array(TYPE_NAMES.length).fill(0);
  for (const s of list) typeCounts[s.type]++;

  const dayMs = 86400;
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - 30 * dayMs;
  const days = {};
  for (let t = startSec; t <= nowSec; t += dayMs) {
    const key = Math.floor(t / dayMs) * dayMs;
    days[key] = { applied: 0, penalties: 0n, deactivations: 0 };
  }
  for (const ev of events) {
    if (!ev.timestamp) continue;
    const key = Math.floor(ev.timestamp / dayMs) * dayMs;
    if (!days[key]) continue;
    if (ev.name === "SupplierApplied") days[key].applied++;
    if (ev.name === "PenaltyPaid") days[key].penalties += BigInt(ev.args[1]);
    if (ev.name === "SupplierDeactivated") days[key].deactivations++;
  }

  return {
    suppliers: list,
    totalPenaltiesPaid,
    totalDeactivations,
    totalUpdates,
    avgRep,
    activeCount: activeSuppliers.length,
    repBuckets,
    typeCounts,
    days,
    defaultRate: list.length ? Math.round((totalDeactivations / list.length) * 100) : 0,
  };
}

async function refreshAnalytics() {
  const refreshBtn = document.getElementById("analytics-refresh");
  if (refreshBtn) refreshBtn.disabled = true;
  try {
    const events = await loadAllEvents();
    const metrics = computeMetrics(events);
    analyticsCache = { events, metrics };
    renderAnalytics(metrics);
  } catch (e) {
    console.error("refreshAnalytics failed:", e);
    const out = document.getElementById("analytics-summary");
    if (out) out.innerHTML = `<p style="color:#dc2626;">❌ Analytics failed: ${e.message}</p>`;
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function renderAnalytics(m) {
  document.getElementById("analytics-summary").innerHTML = `
    <div class="summary-grid">
      <div class="summary-card"><div class="value">${m.suppliers.length}</div><div class="label">Suppliers</div></div>
      <div class="summary-card"><div class="value">${m.activeCount}</div><div class="label">Active</div></div>
      <div class="summary-card"><div class="value">${m.avgRep}</div><div class="label">Avg Reputation</div></div>
      <div class="summary-card"><div class="value">${m.defaultRate}%</div><div class="label">Default Rate</div></div>
      <div class="summary-card"><div class="value">${m.totalPenaltiesPaid.toString()}</div><div class="label">Penalties Paid (wei)</div></div>
    </div>`;

  const leaderboard = [...m.suppliers]
    .sort((a, b) => (b.penaltiesPaid > a.penaltiesPaid ? 1 : -1))
    .slice(0, 20);
  let lbRows = "";
  for (const s of leaderboard) {
    lbRows += `<tr>
      <td>${s.id}</td>
      <td>${s.name}</td>
      <td><span class="type-chip">${TYPE_NAMES[s.type]}</span></td>
      <td>${s.reputationNow} (${tierName(s.reputationNow)})</td>
      <td>${s.deactivations}</td>
      <td>${s.penaltiesPaid.toString()} wei</td>
      <td>${s.resourceUpdates}</td>
    </tr>`;
  }
  document.getElementById("analytics-leaderboard").innerHTML = `
    <table>
      <tr><th>ID</th><th>Name</th><th>Type</th><th>Reputation</th>
          <th>Deactivations</th><th>Penalties Paid</th><th>Updates</th></tr>
      ${lbRows}
    </table>`;

  renderRegistrationsChart(m);
  renderPenaltiesChart(m);
  renderReputationChart(m);
  renderTypeChart(m);
}

function renderRegistrationsChart(m) {
  const canvas = document.getElementById("chart-registrations");
  if (!canvas || typeof Chart === "undefined") return;
  const days = Object.keys(m.days).map(Number).sort((a, b) => a - b);
  const labels = days.map(t => new Date(t * 1000).toLocaleDateString());
  const data = days.map(t => m.days[t].applied);
  if (analyticsCharts.registrations) analyticsCharts.registrations.destroy();
  analyticsCharts.registrations = new Chart(canvas, {
    type: "line",
    data: { labels, datasets: [{ label: "New suppliers / day", data,
      borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.1)", fill: true, tension: 0.2 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function renderPenaltiesChart(m) {
  const canvas = document.getElementById("chart-penalties");
  if (!canvas || typeof Chart === "undefined") return;
  const days = Object.keys(m.days).map(Number).sort((a, b) => a - b);
  const labels = days.map(t => new Date(t * 1000).toLocaleDateString());
  const data = days.map(t => Number(m.days[t].penalties));
  if (analyticsCharts.penalties) analyticsCharts.penalties.destroy();
  analyticsCharts.penalties = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "Penalties paid (wei)", data, backgroundColor: "#dc2626" }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function renderReputationChart(m) {
  const canvas = document.getElementById("chart-reputation");
  if (!canvas || typeof Chart === "undefined") return;
  const labels = Object.keys(m.repBuckets);
  const data = labels.map(k => m.repBuckets[k]);
  if (analyticsCharts.reputation) analyticsCharts.reputation.destroy();
  analyticsCharts.reputation = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "Suppliers per tier", data,
      backgroundColor: ["#8b5cf6","#eab308","#9ca3af","#b45309","#dc2626"] }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function renderTypeChart(m) {
  const canvas = document.getElementById("chart-types");
  if (!canvas || typeof Chart === "undefined") return;
  const labels = TYPE_NAMES;
  const data = m.typeCounts;
  if (analyticsCharts.types) analyticsCharts.types.destroy();
  analyticsCharts.types = new Chart(canvas, {
    type: "doughnut",
    data: { labels, datasets: [{ data,
      backgroundColor: ["#2563eb","#16a34a","#f59e0b","#8b5cf6","#dc2626","#0891b2","#65a30d","#db2777","#64748b"] }] },
    options: { plugins: { legend: { position: "right" } } }
  });
}

function exportAnalyticsCSV() {
  if (!analyticsCache) { log("❌ No analytics loaded yet"); return; }
  const m = analyticsCache.metrics;
  const header = ["id","name","type","reputation","tier","deactivations","reactivations","penaltiesPaid","resourceUpdates","resourcesRegistered","appliedAt","approvedAt"];
  const lines = [header.join(",")];
  for (const s of m.suppliers) {
    lines.push([
      s.id, `"${s.name}"`, TYPE_NAMES[s.type], s.reputationNow, tierName(s.reputationNow),
      s.deactivations, s.reactivations, s.penaltiesPaid.toString(),
      s.resourceUpdates, s.resourcesRegistered, s.appliedAt, s.approvedAt
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `supplier-analytics-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  log("📥 Exported CSV");
}

const _analyticsRefreshBtn = document.getElementById("analytics-refresh");
if (_analyticsRefreshBtn) _analyticsRefreshBtn.addEventListener("click", () => refreshAnalytics());

const _analyticsExportBtn = document.getElementById("analytics-export");
if (_analyticsExportBtn) _analyticsExportBtn.addEventListener("click", exportAnalyticsCSV);

// ============================================================
// ADMIN CONTROLS
// ============================================================
document.getElementById("check-pause-status").addEventListener("click", async () => {
  const rc = getReadContract();
  const p = await rc.paused();
  document.getElementById("pause-status").innerHTML = p
    ? `<p style="color:#dc2626;"><strong>⚠️ CONTRACT PAUSED</strong></p>`
    : `<p style="color:#16a34a;"><strong>✅ Contract active</strong></p>`;
});

document.getElementById("pause-contract").addEventListener("click", async () => {
  try { const tx = await contract.pause(); await tx.wait(); log("⏸️ Paused"); }
  catch (err) { log("❌ " + (err.reason || err.message)); }
});
document.getElementById("unpause-contract").addEventListener("click", async () => {
  try { const tx = await contract.unpause(); await tx.wait(); log("▶️ Unpaused"); }
  catch (err) { log("❌ " + (err.reason || err.message)); }
});

document.getElementById("set-admin").addEventListener("click", async () => {
  const addr = document.getElementById("new-admin").value.trim();
  if (!addr) return log("❌ Enter address");
  try { const tx = await contract.setAdmin(addr); await tx.wait(); log("✅ Admin set to " + addr); }
  catch (err) { log("❌ " + (err.reason || err.message)); }
});

document.getElementById("set-aid-fund").addEventListener("click", async () => {
  const addr = document.getElementById("new-aid-fund").value.trim();
  if (!addr) return log("❌ Enter address");
  try { const tx = await contract.setAidFundAddress(addr); await tx.wait(); log("✅ Aid fund set to " + addr); }
  catch (err) { log("❌ " + (err.reason || err.message)); }
});

// ============================================================
// SUPPLIER — Apply
// ============================================================
document.getElementById("apply-supplier").addEventListener("click", async () => {
  try {
    const name = document.getElementById("supplier-name").value.trim();
    const type = document.getElementById("supplier-type").value;
    if (!name) return log("❌ Enter a supplier name");
    const rc = getReadContract();
    const fee = await rc.REGISTRATION_FEE();
    const tx = await contract.applyAsSupplier(name, type, { value: fee });
    log("Apply tx: " + tx.hash);
    await tx.wait();
    log("✅ Application submitted — status Pending admin approval.");
    await loadMySuppliers();
  } catch (err) { log("❌ " + (err.reason || err.message)); }
});

// ============================================================
// SUPPLIER — My suppliers
// ============================================================
document.getElementById("load-my-suppliers").addEventListener("click", loadMySuppliers);

async function loadMySuppliers() {
  const rc = getReadContract();
  const ids = await rc.getSupplierIdsOf(userAddress);
  if (!ids.length) {
    document.getElementById("my-suppliers-output").innerHTML = "<p>You have no suppliers yet. Register one above.</p>";
    return;
  }
  let rows = "";
  for (let i = 0; i < ids.length; i++) {
    const s = await rc.getSupplier(ids[i]);
    const state = Number(s[4]);
    const trust = Number(s[13]);
    rows += `<tr>
      <td>${s[0]}</td>
      <td>${s[2]}</td>
      <td><span class="type-chip">${TYPE_NAMES[Number(s[3])]}</span></td>
      <td><span class="state-chip state-${STATE_NAMES[state]}">${STATE_NAMES[state]}</span></td>
      <td>${s[5]} (${tierName(Number(s[5]))})</td>
      <td><span class="state-chip" style="background:${trustColor(trust)}; color:white;">${trustName(trust)}</span></td>
      <td><button class="btn-sm" onclick="selectSupplier(${s[0]})">Select</button></td>
    </tr>`;
  }
  document.getElementById("my-suppliers-output").innerHTML = `
    <table>
      <tr><th>ID</th><th>Name</th><th>Type</th><th>State</th><th>Reputation</th><th>Trust</th><th>Action</th></tr>
      ${rows}
    </table>`;
}

window.selectSupplier = async (id) => {
  selectedSupplierId = Number(id);
  await refreshSelectedSupplierPanel();
  log("Selected supplier #" + selectedSupplierId);
};

async function refreshSelectedSupplierPanel() {
  if (!selectedSupplierId) return;
  const rc = getReadContract();
  const s = await rc.getSupplier(selectedSupplierId);
  const state = Number(s[4]);
  const lastDays = s[9] !== undefined ? s[9].toString() : "—";
  const compliantUpdates = Number(s[10]);
  const missedUpdates = Number(s[11]);
  const successfulCycles = Number(s[12]);
  const trust = Number(s[13]);
  const totalTrack = compliantUpdates + missedUpdates;
  const ratioPct = totalTrack === 0 ? 0 : Math.round((compliantUpdates / totalTrack) * 100);

  // Predict penalty from the contract
  let predictedLoss = "—";
  try {
    const loss = await rc.predictDeactivationPenalty(selectedSupplierId);
    predictedLoss = loss.toString();
  } catch (e) { /* ignore */ }

  document.getElementById("selected-supplier-section").style.display = "block";
  document.getElementById("selected-supplier-info").innerHTML = `
    <p><strong>Supplier #${s[0]}</strong> — ${s[2]}</p>
    <p>Type: <span class="type-chip">${TYPE_NAMES[Number(s[3])]}</span></p>
    <p>State: <span class="state-chip state-${STATE_NAMES[state]}">${STATE_NAMES[state]}</span></p>
    <p>Trust tier: <span class="state-chip" style="background:${trustColor(trust)}; color:white;">${trustName(trust)}</span>
       (successful cycles: ${successfulCycles})</p>
    <p>Reputation: ${s[5]} (${tierName(Number(s[5]))})</p>
    <p>Track record: ${compliantUpdates} compliant / ${missedUpdates} missed
       → <strong>${ratioPct}%</strong> on-time</p>
    <p>Penalties paid: ${s[6].toString()} wei — Times deactivated: ${s[7]}</p>
    <p>Resources registered: ${s[8]}</p>
    <p>Last deactivation duration: ${lastDays} days</p>
    <p>Predicted reputation loss if deactivated now: <strong>${predictedLoss} points</strong></p>
  `;
}

// ============================================================
// SUPPLIER — Resource ops
// ============================================================
document.getElementById("register-resource").addEventListener("click", async () => {
  if (!selectedSupplierId) return log("❌ Select a supplier first");
  try {
    const type = document.getElementById("resource-type").value;
    const qty = document.getElementById("resource-quantity").value;
    if (!qty || Number(qty) <= 0) return log("❌ Quantity > 0 required");
    const tx = await contract.registerResource(selectedSupplierId, type, qty);
    log("Register tx: " + tx.hash);
    await tx.wait();
    log("✅ Resource registered for #" + selectedSupplierId);
    document.getElementById("load-countdown").click();
  } catch (err) { log("❌ " + (err.reason || err.message)); }
});

document.getElementById("update-quantity").addEventListener("click", async () => {
  if (!selectedSupplierId) return log("❌ Select a supplier first");
  try {
    const type = document.getElementById("resource-type").value;
    const qty = document.getElementById("resource-quantity").value;
    if (!qty || Number(qty) <= 0) return log("❌ Quantity > 0 required");
    const tx = await contract.updateResourceQuantity(selectedSupplierId, type, qty);
    log("Update tx: " + tx.hash);
    await tx.wait();
    log("✅ Quantity updated, compliance timer refreshed.");
    document.getElementById("load-countdown").click();
    await refreshSelectedSupplierPanel();
  } catch (err) { log("❌ " + (err.reason || err.message)); }
});

document.getElementById("load-countdown").addEventListener("click", async () => {
  if (!selectedSupplierId) return log("❌ Select a supplier first");
  try {
    const rc = getReadContract();
    let html = "";
    for (let i = 0; i < 4; i++) {
      const qty = await rc.getSupplierResourceQuantity(selectedSupplierId, i);
      if (qty.toString() === "0") continue;
      const remaining = Number(await rc.remainingComplianceTime(selectedSupplierId, i));
      let color, status;
      if (remaining === 0) { color = "#dc2626"; status = "EXPIRED"; }
      else if (remaining < 3600) { color = "#ea580c"; status = "URGENT"; }
      else if (remaining < 21600) { color = "#eab308"; status = "Approaching"; }
      else { color = "#16a34a"; status = "Compliant"; }
      html += `<div style="margin-bottom:10px; padding:10px; background:#f9fafb; border-left:4px solid ${color}; border-radius:6px;">
        <strong>${RESOURCE_NAMES[i]}</strong> — qty ${qty.toString()}<br>
        <span style="color:${color};">${status}</span><br>
        Time remaining: ${Math.floor(remaining/3600)}h ${Math.floor((remaining%3600)/60)}m
      </div>`;
    }
    document.getElementById("countdown-output").innerHTML = html || "<p>No resources registered.</p>";
  } catch (err) { log("❌ " + (err.reason || err.message)); }
});

// ============================================================
// SUPPLIER — Penalty / Escrow / Reputation
// ============================================================
document.getElementById("calculate-penalty").addEventListener("click", async () => {
  if (!selectedSupplierId) return log("❌ Select a supplier");
  try {
    const rc = getReadContract();
    const s = await rc.getSupplier(selectedSupplierId);
    const state = Number(s[4]);
    const trust = Number(s[13]);
    const compliantUpdates = Number(s[10]);
    const missedUpdates = Number(s[11]);
    const totalTrack = compliantUpdates + missedUpdates;
    const ratioPct = totalTrack === 0 ? 0 : Math.round((compliantUpdates / totalTrack) * 100);

    let predictedLoss = "—";
    try {
      const loss = await rc.predictDeactivationPenalty(selectedSupplierId);
      predictedLoss = loss.toString();
    } catch (e) { /* ignore */ }

    if (state === 1) {
      log("ℹ️ Supplier is Active. Penalty applies only after deactivation.");
      document.getElementById("compliance-status").innerHTML = `
        <p style="font-size:0.85rem;"><strong>Current track record:</strong>
           ${compliantUpdates} on-time / ${missedUpdates} missed
           (${ratioPct}% compliance). Trust tier: <strong>${trustName(trust)}</strong>.</p>
        <p style="font-size:0.85rem;">If deactivated right now, this supplier would lose
           <strong>${predictedLoss} reputation points</strong>.</p>
        <p style="font-size:0.82rem; color:#6b7280;">Penalty amount (wei) depends on days inactive:</p>
        <table class="kv">
          <tr><th>0–1 days inactive</th><td>200,000 wei</td></tr>
          <tr><th>2–7 days inactive</th><td>400,000 wei</td></tr>
          <tr><th>8–21 days inactive</th><td>800,000 wei</td></tr>
          <tr><th>22+ days inactive</th><td>1,000,000 wei</td></tr>
        </table>`;
      return;
    }

    const p = await rc.calculatePenalty(selectedSupplierId);
    document.getElementById("compliance-status").innerHTML =
      `<p><strong>💰 Penalty due: ${p.toString()} wei</strong></p>`;
    log("💰 Penalty: " + p.toString() + " wei");
  } catch (err) { log("❌ " + (err.reason || err.message)); }
});

document.getElementById("pay-penalty").addEventListener("click", async () => {
  if (!selectedSupplierId) return log("❌ Select a supplier");
  try {
    const rc = getReadContract();
    const p = await rc.calculatePenalty(selectedSupplierId);
    const tx = await contract.payPenaltyAndReactivate(selectedSupplierId, { value: p.toString(), gasLimit: 500000 });
    log("Pay tx: " + tx.hash);
    await tx.wait();
    log("🎉 Penalty paid: " + p.toString() + " wei, supplier reactivated.");
    await refreshSelectedSupplierPanel();
    document.getElementById("load-countdown").click();
    document.getElementById("load-escrow").click();
    document.getElementById("load-reputation").click();
  } catch (err) { log("❌ " + (err.reason || err.message)); }
});

document.getElementById("load-escrow").addEventListener("click", async () => {
  if (!selectedSupplierId) return log("❌ Select a supplier");
  try {
    const rc = getReadContract();
    const info = await rc.getEscrowInfo(selectedSupplierId);
    const balance = info[0];
    if (balance.toString() === "0") {
      document.getElementById("escrow-status").innerHTML = "<p>No escrow for this supplier.</p>";
      return;
    }
    document.getElementById("escrow-status").innerHTML = `
      <p>Balance: ${balance.toString()} wei</p>
      <p>Release time: ${new Date(Number(info[1]) * 1000).toLocaleString()}</p>
      <p>Releasable: ${info[2]}</p>
      <p>Forfeit eligible: ${info[3]}</p>`;
  } catch (err) { log("❌ " + (err.reason || err.message)); }
});

document.getElementById("load-reputation").addEventListener("click", async () => {
  if (!selectedSupplierId) return log("❌ Select a supplier");
  try {
    const rc = getReadContract();
    const s = await rc.getSupplier(selectedSupplierId);
    const score = Number(s[5]);
    const pct = Math.min(100, (score / 200) * 100);
    const trust = Number(s[13]);
    document.getElementById("reputation-status").innerHTML = `
      <p>Score: ${score} / 200 — Tier: ${tierName(score)}</p>
      <p>Trust tier: <span class="state-chip" style="background:${trustColor(trust)}; color:white;">${trustName(trust)}</span></p>
      <div class="rep-bar-outer"><div class="rep-bar-inner" style="background:${tierColor(score)}; width:${pct}%"></div></div>`;
  } catch (err) { log("❌ " + (err.reason || err.message)); }
});

// ============================================================
// TIME SIMULATION
// ============================================================
async function advanceTime(seconds, label) {
  try {
    const p = new ethers.providers.JsonRpcProvider(RPC_URL);
    await p.send("evm_increaseTime", [seconds]);
    await p.send("evm_mine", []);
    await p.send("evm_mine", []);
    document.getElementById("time-status").innerText = "Fast-forwarded: " + label;
    log("⏩ +" + label);
  } catch (err) { log("❌ " + err.message); }
}
document.getElementById("skip-1-day").addEventListener("click", () => advanceTime(90000, "25 Hours"));
document.getElementById("skip-3-days").addEventListener("click", () => advanceTime(259200, "3 Days"));
document.getElementById("skip-10-days").addEventListener("click", () => advanceTime(864000, "10 Days"));

// ============================================================
// EVENT LOG
// ============================================================
let eventListeners = [];
let listening = false;

function appendEvent(line) {
  const el = document.getElementById("event-log");
  if (!el) return;
  const t = new Date().toLocaleTimeString();
  el.innerHTML = `<div>[${t}] ${line}</div>` + el.innerHTML;
}

async function startListening() {
  if (listening) return;
  await loadContractAddress();
  const rc = getReadContract();
  const handlers = [
    ["SupplierApplied", (id, w, n) => appendEvent(`🆕 Applied #${id} ${n}`)],
    ["SupplierApproved", (id) => appendEvent(`✅ Approved #${id}`)],
    ["SupplierRejected", (id) => appendEvent(`🚫 Rejected #${id}`)],
    ["SupplierDeactivated", (id, loss) => appendEvent(`🚨 Deactivated #${id} (rep −${loss})`)],
    ["SupplierReactivated", (id) => appendEvent(`🔁 Reactivated #${id}`)],
    ["ResourceRegistered", (id, r) => appendEvent(`📦 #${id} registered ${r}`)],
    ["ResourceUpdated", (id, r, q) => appendEvent(`🔄 #${id} ${r} = ${q}`)],
    ["PenaltyPaid", (id, amt) => appendEvent(`💰 #${id} paid ${amt}`)],
    ["EscrowDeposited", (id, amt) => appendEvent(`🔒 #${id} escrow ${amt}`)],
    ["EscrowReleased", (id, amt) => appendEvent(`💵 #${id} refunded ${amt}`)],
    ["EscrowForfeited", (id, amt, to) => appendEvent(`💸 #${id} forfeited ${amt} to ${shorten(to)}`)],
    ["ReputationChanged", (id, o, n, r) => appendEvent(`⭐ #${id} rep ${o}→${n} (${r})`)],
    ["ContractPaused", (by) => appendEvent(`⏸️ Paused by ${shorten(by)}`)],
    ["ContractUnpaused", (by) => appendEvent(`▶️ Unpaused by ${shorten(by)}`)],
    ["AdminChanged", (o, n) => appendEvent(`👤 Admin ${shorten(o)} → ${shorten(n)}`)],
    ["AidFundAddressUpdated", (a) => appendEvent(`🏦 Aid fund → ${shorten(a)}`)]
  ];
  for (const [name, fn] of handlers) {
    const wrapped = (...args) => fn(...args);
    rc.on(name, wrapped);
    eventListeners.push({ name, wrapped });
  }
  listening = true;
  document.getElementById("toggle-events").textContent = "Stop Listening";
  document.getElementById("event-log").innerHTML = "";
  appendEvent("🎧 Listening...");
}

function stopListening() {
  if (!listening) return;
  const rc = getReadContract();
  for (const { name, wrapped } of eventListeners) rc.off(name, wrapped);
  eventListeners = [];
  listening = false;
  document.getElementById("toggle-events").textContent = "Start Listening";
  document.getElementById("event-log").innerHTML = "";
  appendEvent("⏸️ Stopped listening.");
}

document.getElementById("toggle-events").addEventListener("click", () => {
  if (listening) stopListening(); else startListening();
});
document.getElementById("clear-events").addEventListener("click", () => {
  document.getElementById("event-log").innerHTML = `<p style="color:#94a3b8; margin:0;">Cleared.</p>`;
});

// ============================================================
// STATS
// ============================================================
document.getElementById("load-stats").addEventListener("click", async () => {
  try {
    const rc = getReadContract();
    const s = await rc.getStats();
    const q = [];
    for (let i = 0; i < 4; i++) q.push(await rc.getAggregateResourceQuantity(i));
    document.getElementById("stats-output").innerHTML = `
      <p>Total approved: ${s[0]}</p>
      <p>Active: ${s[1]} — Inactive: ${s[2]} — Pending: ${s[3]} — Rejected: ${s[4]}</p>
      <p>Registration funds: ${s[5]} wei</p>
      <p>Penalties forfeited: ${s[6]} wei</p>
      <p>Escrow held: ${s[7]} wei — Refunded: ${s[8]} wei</p>
      <h3>Aggregate Quantities</h3>
      <p>Water: ${q[0]}</p>
      <p>Clothing: ${q[1]}</p>
      <p>Medicine: ${q[2]}</p>
      <p>Food: ${q[3]}</p>`;
  } catch (err) { log("❌ " + (err.reason || err.message)); }
});

// ============================================================
// AUTO-CONNECT
// ============================================================
async function tryAutoConnect() {
  if (!window.ethereum) return;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (!accounts || accounts.length === 0) return;
    console.log("MetaMask already approved — click Connect MetaMask to enter.");
  } catch (err) {
    console.warn("auto-connect probe skipped:", err);
  }
}
window.addEventListener("load", () => setTimeout(tryAutoConnect, 200));