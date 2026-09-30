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
  "function registerSupplier() payable",
  "function registerResource(uint8 _resourceType, uint256 _quantity)",
  "function updateResourceQuantity(uint8 _resourceType, uint256 _quantity)",
  "function checkAndDeactivate(address _supplier)",
  "function calculatePenalty(address _supplier) view returns (uint256)",
  "function payPenaltyAndReactivate() payable",
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
  "function escrowBalance(address) view returns (uint256)"
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

    if (info.balance.toString() === "0") {
      document.getElementById("escrow-status").innerHTML =
        `<p>No penalty currently held in escrow for this wallet.</p>`;
      return;
    }

    const releaseDate = new Date(Number(info.releaseTime) * 1000);
    const nowSec = Math.floor(Date.now() / 1000);
    const daysLeft = Math.max(
      0,
      Math.ceil((Number(info.releaseTime) - nowSec) / 86400)
    );

    let statusText;
    if (info.releasable) {
      statusText = "✅ Ready to release - 30-day window complete and supplier active";
    } else if (info.forfeitEligible) {
      statusText = "❌ Eligible for forfeit - supplier inactive within window";
    } else {
      statusText = "⏳ Awaiting compliance window";
    }

    document.getElementById("escrow-status").innerHTML = `
      <p><strong>Amount in escrow:</strong> ${info.balance.toString()} wei</p>
      <p><strong>Release date:</strong> ${releaseDate.toLocaleString()}</p>
      <p><strong>Days remaining:</strong> ${daysLeft}</p>
      <p><strong>Status:</strong> ${statusText}</p>
    `;
  } catch (err) {
    log("❌ Failed to load escrow: " + (err.reason || err.message));
  }
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

    document.getElementById("stats-output").innerHTML = `
      <p>Total Suppliers: ${total}</p>
      <p>Active Suppliers: ${active}</p>
      <p>Inactive Suppliers: ${inactive}</p>
      <p>Verified Suppliers: ${verified}</p>
      <p>Total Penalties Forfeited: ${penalties} wei</p>
      <p>Total Escrow Held: ${escrowHeld} wei</p>
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