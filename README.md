# Blockchain-Based Supplier Registration, Resource Management, and Compliance System

A decentralized application for managing humanitarian resource suppliers on an Ethereum-compatible blockchain. Suppliers register by paying a fee, declare water, clothing, medicine, and food resources, and must update their quantities within a strict one-day compliance window. Non-compliant suppliers are automatically deactivated and can only resume work after paying a duration-based penalty.

---

## Deployed Contract

| Field | Value |
|-------|-------|
| **Contract Address** | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| **Network** | Hardhat Local (Chain ID 31337) |
| **RPC URL** | `http://127.0.0.1:8545` |
| **Frontend URL** | `http://localhost:4444` |
| **Solidity Version** | 0.8.19 |
| **Hardhat Version** | 2.29.1 |
| **Owner (Compliance Officer)** | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |

---

## Overview

Traditional humanitarian resource management relies on centralized databases that are prone to tampering, opaque to public oversight, and costly to enforce manually. This project replaces the centralized approach with a self-executing smart contract. Every business rule is encoded in immutable Solidity code. Every state change is permanently recorded on the blockchain. Any stakeholder can independently verify the entire system without trusting a central authority.

---

## Key Features

- **Supplier registration** — pay exactly 100,000 wei to join the system
- **Predefined resources** — Water, Clothing, Medicine, Food (no arbitrary entries allowed)
- **One-day compliance rule** — every registered resource must be updated within 24 hours (86,400 seconds)
- **Automatic deactivation** — non-compliant suppliers are flagged and deactivated
- **Role-based access control** — only the compliance officer (contract owner) can trigger deactivations
- **Duration-based penalties** — four tiers from 200,000 to 1,000,000 wei, based on how long the supplier was inactive
- **Reactivation** — the supplier pays the exact penalty amount to become active again, and all compliance timers reset
- **Real-time statistics** — supplier counts, active/inactive counts, aggregate resource quantities, total penalties collected
- **Full audit trail** — six event types emitted on every state change, permanently recorded on the blockchain
- **Time simulation** — a Hardhat test tool to fast-forward blockchain time and demonstrate the compliance and penalty flow without waiting real hours

---

## Project Structure

```
blockchain-supplier-compliance/
├── contracts/
│   └── SupplierCompliance.sol           # The smart contract (~374 lines, 26 public functions)
├── scripts/
│   └── deploy.js                        # Deploys the contract and writes frontend/deployed-address.json
├── test/
│   └── SupplierCompliance.test.js       # 25 unit tests covering success and failure paths
├── frontend/
│   ├── index.html                       # DApp markup
│   ├── app.js                           # Blockchain integration with Ethers.js
│   ├── styles.css                       # Styling
│   ├── ethers.min.js                    # Ethers.js 5.7.2 (local copy)
│   └── deployed-address.json            # Auto-written on each deploy
├── screenshots/                         # Evidence for submission
├── hardhat.config.js                    # Hardhat configuration
├── package.json                         # npm manifest
├── package-lock.json                    # Lock file
├── README.md                            # This file
└── Architecture_Report.docx             # Business and architecture analysis
```

---

## Business Rules Enforced On-Chain

| # | Rule | Enforced by |
|---|------|-------------|
| 1 | Registration requires exactly 100,000 wei | `require(msg.value == REGISTRATION_FEE)` |
| 2 | Duplicate supplier registration is rejected | `require(!suppliers[msg.sender].registered)` |
| 3 | Only four resource types are accepted | `enum ResourceType` + `validResource` modifier |
| 4 | Only active suppliers can register or update resources | `onlyActive` modifier |
| 5 | Every resource must be updated within 24 hours | `block.timestamp` comparison |
| 6 | Non-compliant suppliers are deactivated | `checkAndDeactivate()` |
| 7 | Only the compliance officer can trigger deactivation | `onlyOwner` modifier |
| 8 | Inactive suppliers cannot operate | `require(suppliers[msg.sender].active)` |
| 9 | Reactivation requires the exact penalty amount | `require(msg.value == penalty)` |
| 10 | Penalties scale by days inactive | Tiered `calculatePenalty()` |

### Penalty Tiers

| Days since deactivation | Penalty |
|-------------------------|---------|
| 0 – 1 | 200,000 wei |
| 2 – 7 | 400,000 wei |
| 8 – 21 | 800,000 wei |
| 22 + | 1,000,000 wei |

---

## Contract Events

Every state change emits a permanent, indexable event:

```
SupplierRegistered(address indexed supplier, uint256 timestamp)
ResourceRegistered(address indexed supplier, string resource)
ResourceUpdated(address indexed supplier, string resource, uint256 quantity)
SupplierDeactivated(address indexed supplier, uint256 timestamp)
PenaltyPaid(address indexed supplier, uint256 amount)
SupplierReactivated(address indexed supplier, uint256 timestamp)
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Smart Contract | Solidity | 0.8.19 |
| Development Framework | Hardhat | 2.29.1 |
| Local Blockchain | Hardhat Network | — |
| Wallet | MetaMask | Latest |
| Frontend Library | Ethers.js | 5.7.2 |
| Testing | Chai + Mocha | — |
| Runtime | Node.js | 18+ |
| Package Manager | npm | Latest |

---

## Prerequisites

- **Node.js** 18 or newer
- **MetaMask** browser extension
- **Python** 3 (for serving the frontend) OR `npx serve`
- **Git** (optional)

Verify Node.js is installed:

```bash
node --version
npm --version
```

---

## Installation

Run these commands once, after cloning or extracting the project:

```bash
cd blockchain-supplier-compliance
npm install
npx hardhat compile
```

`npm install` downloads Hardhat, Ethers.js, Chai, and all dependencies into `node_modules/`. You do not need to run it again unless you delete `node_modules/` or change `package.json`.

`npx hardhat compile` compiles the Solidity contract and produces the `artifacts/` folder.

---

## Running the Application

You need **three terminals**. Start them in this exact order.

### Terminal 1 — Hardhat Node

```bash
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npx hardhat node
```

Wait for `Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/` followed by 20 accounts. **Leave this window open.** The blockchain runs here. If you close it, all deployed contracts are wiped.

### Terminal 2 — Deploy the Contract

Open a **new terminal**:

```bash
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npx hardhat run scripts/deploy.js --network localhost
```

Expected output:

```
SupplierCompliance deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Wrote address to frontend/deployed-address.json
```

This can be closed after deployment.

### Terminal 3 — Frontend Server

Open a **new terminal**:

```bash
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance\frontend"
python -m http.server 4444
```

Expected output:

```
Serving HTTP on :: port 4444 (http://[::]:4444/) ...
```

**Leave this window open.**

### Browser

Open Firefox or Chrome:

```
http://localhost:4444
```

Press **`Ctrl + Shift + R`** once to hard refresh. Then:

1. Click **Connect MetaMask** and approve the popup
2. Click **Register (100,000 wei)** and confirm the transaction
3. Register resources: Water, Food, Medicine, Clothing
4. Update quantities as needed

---

## MetaMask Setup

If this is your first time running the DApp, complete these steps once:

1. Install MetaMask from https://metamask.io/download/
2. Add a custom network:
   - **Network Name:** Hardhat Local
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency Symbol:** ETH
3. Import the first Hardhat test account using this private key:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
4. The account should show **10,000 ETH** on the Hardhat Local network
5. That wallet becomes the **compliance officer** because it deployed the contract

To test access control, import a second account later:

```
0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

---

## Testing the Contract

The test suite contains 25 tests covering registration, resource declaration, quantity updates, the compliance mechanism, deactivation, penalty calculation across all four tiers, reactivation, statistics, and access control.

Run:

```bash
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npx hardhat test
```

Expected output ends with:

```
25 passing (~500ms)
```

---

## Demonstrating the Compliance and Penalty Lifecycle

Because the compliance period is one day and cannot be waited in real time, the DApp exposes a **Time Simulation** panel that uses Hardhat's `evm_increaseTime` RPC method to fast-forward the blockchain clock.

Follow this sequence to demonstrate the full lifecycle:

1. Register as a supplier
2. Register a resource (e.g., Water with quantity 1000)
3. Click **Fast-Forward 25 Hours**
4. Click **Check Compliance & Deactivate** (only works if you are the owner)
5. Try to **Update Quantity** — it fails with "Supplier is inactive"
6. Click **Calculate Penalty** — displays 200,000 wei
7. Click **Fast-Forward 10 Days** twice, then **Fast-Forward 3 Days**
8. Click **Calculate Penalty** again — displays 1,000,000 wei
9. Click **Pay Penalty & Reactivate** and approve in MetaMask
10. Click **Update Quantity** — now succeeds

Screenshot each step for submission.

---

## Access Control Demonstration

The contract has one privileged role: the **compliance officer**, which is the wallet that deployed the contract.

- **Anyone** can register as a supplier, register resources, and pay their own penalty
- **Only the compliance officer** can call `checkAndDeactivate()`

To demonstrate this:

1. Connect as the owner wallet (`0xf39F...2266`) — Check Compliance works
2. Import the second Hardhat account (`0x7099...79C8`) into MetaMask
3. Register it as a second supplier and give it a resource
4. Fast-forward 25 hours
5. Click Check Compliance with the second wallet connected — it will refuse with `❌ Only the compliance officer can trigger deactivation`

Screenshot both attempts as proof.

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `npx.ps1 cannot be loaded` | PowerShell execution policy | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force` |
| `HHE22: non-local installation` | `node_modules/` missing | `npm install` |
| `ECONNREFUSED 127.0.0.1:8545` | Hardhat node not running | Start Terminal 1 |
| `ethers is not defined` | `ethers.min.js` missing | Download it into `frontend/` (see below) |
| `Only compliance officer can call this` | Using a non-owner wallet for deactivation | Switch MetaMask to the deploying wallet |
| `deployed-address.json` not found | Deployment script not run since node start | Run Terminal 2 |
| `Supplier already registered` | Duplicate registration attempt | Expected — the contract prevents duplicates |

To download `ethers.min.js` if it is missing:

```bash
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance\frontend"
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js" -OutFile "ethers.min.js"
```

---

## Notes on the Local Blockchain

The Hardhat local node is a **development sandbox**. Every time it restarts, all deployed contracts and all state are wiped. This is by design — it provides a clean slate for each session.

**Practical rule:** keep Terminal 1 running throughout your session. If you close it, you must redeploy (Terminal 2) to have a working contract again.

The `frontend/deployed-address.json` file is written automatically on every deploy, and the frontend reads it on page load. This means you do not need to manually update the contract address in `app.js` when you redeploy — the DApp picks up the new address automatically.

---

## Submission Contents

The Moodle submission ZIP contains:

- `contracts/SupplierCompliance.sol` — the smart contract
- `scripts/deploy.js` — deployment script
- `test/SupplierCompliance.test.js` — 25 unit tests
- `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, `frontend/ethers.min.js` — the DApp
- `screenshots/` — every step of the demonstration captured
- `Architecture_Report.docx` — architecture, functionality, and business rules analysis
- `transaction-hashes.txt` — all on-chain transaction hashes
- `hardhat.config.js`, `package.json`, `README.md`

`node_modules/`, `artifacts/`, and `cache/` are not included; they can be regenerated with `npm install` and `npx hardhat compile`.

---

## License

MIT — free to use for educational purposes.

---

## Author

[Your Name / Group Name]
[Course Name]
[Submission Date]