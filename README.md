# Blockchain-Based Supplier Registration, Resource Management, and Compliance System

A decentralized application for managing humanitarian resource suppliers on a local Ethereum-compatible blockchain. Suppliers apply to register, are approved by an admin, declare water, clothing, medicine, and food resources, and must update their quantities within a strict one-day compliance window. Non-compliant suppliers are deactivated and can only resume work after paying a duration-based penalty. Escrow, weighted reputation scoring, and an analytics dashboard reward consistent behaviour and expose bad actors.

Everything runs locally against a Hardhat node. No Sepolia, no Vercel, no external services.

---

## Deployed Contract (Local Hardhat)

| Field | Value |
|-------|-------|
| Contract Address | Auto-written to frontend/deployed-address.json on each deploy |
| Network | Hardhat Local (Chain ID 31337) |
| RPC URL | http://127.0.0.1:8545 |
| Frontend URL | http://localhost:4444 |
| Solidity Version | 0.8.19 |
| Hardhat Version | 2.19 or newer |
| Admin (Compliance Officer) | First Hardhat test account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 |

---

## Overview

Traditional humanitarian resource management relies on centralized databases that are tamper-prone, opaque, and costly to enforce. This project replaces that with a self-executing smart contract. Every business rule is encoded in Solidity. Every state change is permanently recorded on the blockchain. Any stakeholder can independently verify the system without trusting a central authority.

The system has two roles:

- Admin (Compliance Officer): approves or rejects new suppliers, deactivates non-compliant ones, manages emergency controls, and views an analytics dashboard.
- Supplier: applies, manages one or more supplier identities, declares resources, keeps them compliant, and pays penalties when they slip.

The admin can hand the role to another wallet at any time. Admin status is not tied to a hardcoded address.

---

## Key Features

- Two-role model: Admin and Supplier are separated on-chain; only the admin can approve, reject, deactivate, pause, or change the aid fund.
- Multi-supplier per wallet: one wallet can own and manage many suppliers, stored by ID.
- Supplier types: NGO, Vendor, Corporate, Individual, Government, Healthcare, Educational, Religious, Other.
- Admin-approval workflow: new applications go to Pending, then Active or Rejected. Rejection refunds the fee automatically.
- Predefined resources: Water, Clothing, Medicine, Food.
- One-day compliance rule: every registered resource must be updated within 24 hours (86,400 seconds).
- Compliance window enforcement: once expired, the supplier can no longer update; the admin must deactivate them.
- Duration-based penalties: four tiers from 200,000 to 1,000,000 wei, based on days inactive.
- Weighted reputation scoring: reputation loss per deactivation depends on the supplier's track record and trust tier.
- Trust tiers: New, Developing, Trusted, Established, driven by successful 30-day cycles.
- Escrow: penalties are held for 30 days. Refunded if the supplier stays compliant; forfeited to the aid fund if they reoffend.
- Reassignable admin: the current admin can transfer the role to another wallet.
- Emergency pause: the admin can freeze every state-changing operation, then unpause.
- Analytics dashboard: registrations per day, penalties per day, reputation distribution, supplier-type breakdown, per-supplier leaderboard, CSV export.
- Full audit trail: every state change emits an event, permanently recorded on the chain.
- Time simulation: a Hardhat tool to fast-forward blockchain time for demonstration.

---

## Project Structure

    blockchain-supplier-compliance/
        contracts/
            SupplierCompliance.sol         - The smart contract
        scripts/
            deploy.js                      - Deploys and writes frontend/deployed-address.json
        test/
            SupplierCompliance.test.js     - Unit tests
        frontend/
            index.html                     - DApp markup (tabs, dashboards)
            app.js                         - Ethers.js integration, role routing, analytics
            styles.css                     - Styling
            ethers.min.js                  - Ethers.js 5.7.2 (local copy)
            deployed-address.json          - Auto-written on each deploy
        hardhat.config.js                  - Hardhat config (viaIR enabled)
        package.json                       - npm manifest
        package-lock.json                  - Lock file
        README.md                          - This file
        Architecture_Report.docx           - Business and architecture analysis

---

## Business Rules Enforced On-Chain

| # | Rule | Enforced by |
|---|------|-------------|
| 1 | Registration requires exactly 100,000 wei | require(msg.value == REGISTRATION_FEE) |
| 2 | One wallet can own many suppliers | ownedSupplierIds[msg.sender] array + nextSupplierId counter |
| 3 | Only 9 supplier types are accepted | enum SupplierType + require(_type <= uint8(Other)) |
| 4 | New suppliers start in Pending | s.state = SupplierState.Pending in applyAsSupplier |
| 5 | Only the admin can approve or reject | onlyAdmin modifier |
| 6 | Rejected applicants get their fee back | payable(s.wallet).call{value: REGISTRATION_FEE}("") |
| 7 | Only 4 resource types are accepted | enum ResourceType + validResource modifier |
| 8 | Only active suppliers can register or update resources | require(s.state == SupplierState.Active) |
| 9 | Every resource must be updated within 24 hours | require(block.timestamp - lastUpdated <= COMPLIANCE_PERIOD) |
| 10 | Once the window expires, the supplier cannot update | Same require, reverts with "Compliance window expired" |
| 11 | Only the admin can deactivate a non-compliant supplier | onlyAdmin + require(missed > 0) |
| 12 | Penalty amount depends only on days inactive | _penaltyForDays(days), a pure function |
| 13 | Reputation loss depends on track record and trust tier | _deactivationLoss(s) |
| 14 | Reactivation requires the exact penalty amount | require(msg.value == penalty) |
| 15 | Reactivation resets all compliance timers | Loop over registeredResources |
| 16 | Paid penalties go into escrow, not to the admin | s.escrowAmount += msg.value |
| 17 | Escrow refunds after 30 days of compliance | require(block.timestamp >= escrowStartTime + ESCROW_PERIOD) in releaseEscrow |
| 18 | Escrow forfeits to the aid fund if re-deactivated within the window | forfeitEscrow + payable(aidFundAddress).call |
| 19 | Only the admin can pause, unpause, or change the aid fund | onlyAdmin modifier |
| 20 | The admin role is transferable | setAdmin under onlyAdmin |

### Penalty Tiers (wei)

| Days since deactivation | Penalty |
|-------------------------|---------|
| 0 to 1 | 200,000 wei |
| 2 to 7 | 400,000 wei |
| 8 to 21 | 800,000 wei |
| 22 or more | 1,000,000 wei |

---

## Scoring Mechanism

Reputation is not a flat counter. Two dimensions drive every deactivation penalty.

### Dimension 1: Compliance ratio

ratio = compliantUpdates / (compliantUpdates + missedUpdates)

- compliantUpdates increments on every on-time update.
- missedUpdates increments by the number of expired resources found at deactivation.

### Dimension 2: Trust tier

successfulCycles advances by 1 every time escrow is refunded after a clean 30-day window. It resets to 0 on every deactivation.

| Trust tier | Successful cycles | Multiplier |
|---|---|---|
| New | 0 to 2 | 1.5 |
| Developing | 3 to 7 | 1.0 |
| Trusted | 8 to 15 | 0.7 |
| Established | 16 or more | 0.5 |

### The formula

loss = 20 * (2 - complianceRatio) * trustMultiplier

Capped at 40 points per deactivation.

### Worked examples

| Scenario | Ratio | Trust | Loss |
|---|---|---|---|
| Brand new, never updated | 0.00 | New | 40 (capped) |
| Updated 2 of 10, deactivated | 0.20 | New | 40 (capped) |
| Updated half the time | 0.50 | New | 40 (capped) |
| Updated 8 of 10 | 0.80 | Developing | 24 |
| Trusted veteran, 9 of 10 | 0.90 | Trusted | 14 |
| Established veteran, rare slip | 0.90 | Established | 10 |
| Perfect record, one bad week | 1.00 | Trusted | 7 |
| Long-term perfect record | 1.00 | Established | 5 |

Same rule broken. Very different outcomes. A first-time offender with no history loses 8 times more than a trusted veteran with a perfect record.

### Rewards scale with trust

| Trust tier | Points gained per compliant update |
|---|---|
| New | +1 |
| Developing | +2 |
| Trusted | +3 |
| Established | +5 |

Good behaviour compounds. Long-term reliable suppliers climb faster than new ones.

### Reputation tier bands

| Tier | Score range |
|---|---|
| Platinum | 180 to 200 |
| Gold | 150 to 179 |
| Silver | 120 to 149 |
| Bronze | 80 to 119 |
| Probation | 0 to 79 |

---

## Escrow Mechanism

Penalties do not go to the admin. They are held in escrow for 30 days.

1. Supplier is deactivated.
2. Admin deactivates them, or the automated path via Chainlink performUpkeep.
3. Supplier pays the penalty. Funds move into escrowAmount.
4. Path A, good behaviour: after 30 days, releaseEscrow sends the funds back to the supplier and increments successfulCycles.
5. Path B, repeat violation: if the supplier is deactivated again inside the 30-day window, forfeitEscrow sends the funds to aidFundAddress.

The aid fund destination is admin-configurable via setAidFundAddress.

Think of it like a security deposit: refundable if you behave, forfeited if you do not.

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Smart Contract | Solidity | 0.8.19 |
| Development Framework | Hardhat | 2.19 or newer |
| Local Blockchain | Hardhat Network | N/A |
| Wallet | MetaMask | Latest |
| Frontend Library | Ethers.js | 5.7.2 |
| Charts | Chart.js | 4.4.1 |
| Testing | Chai + Mocha | N/A |
| Runtime | Node.js | 18 or newer |
| Package Manager | npm | Latest |

---

## Prerequisites

- Node.js 18 or newer
- MetaMask browser extension
- Python 3 for serving the frontend, or npx serve

Verify:

    node --version
    npm --version

---

## Installation

Run once, after cloning:

    cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
    npm install
    npx hardhat compile

npm install downloads Hardhat, Ethers.js, Chai, and all dependencies.
npx hardhat compile compiles the contract and produces the artifacts folder.

Note: hardhat.config.js enables viaIR, so compilation takes 30 to 60 seconds. That is normal.

---

## Running the Application

You need three terminals. Start them in this order.

### Terminal 1: Hardhat Node

    Get-NetTCPConnection -LocalPort 8545 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
    cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
    npx hardhat node

Wait for "Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/" followed by 20 accounts. Leave this window open. The blockchain runs here. Closing it wipes all state.

### Terminal 2: Deploy the Contract

Open a new PowerShell window:

    cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
    npx hardhat run scripts/deploy.js --network localhost

Expected output:

    SupplierCompliance deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
    Wrote address to frontend/deployed-address.json

Close this window after it prints.

### Terminal 3: Frontend Server

Open a new PowerShell window:

    Get-NetTCPConnection -LocalPort 4444 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
    cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance\frontend"
    python -m http.server 4444

Expected output:

    Serving HTTP on 0.0.0.0 port 4444 ...

Leave this window open.

### Browser

Open http://localhost:4444. Press Ctrl + Shift + R to hard-refresh. Click Connect MetaMask if it does not auto-connect.

---

## MetaMask Setup

Once per machine:

1. Install MetaMask from https://metamask.io/download/
2. Add a custom network:
   - Network Name: Hardhat Local
   - RPC URL: http://127.0.0.1:8545
   - Chain ID: 31337
   - Currency Symbol: ETH
3. Import the first Hardhat test account using this private key:

       0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

4. Rename it to Hardhat Admin.
5. Import the second Hardhat test account using this private key:

       0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

6. Rename it to Hardhat Supplier.

Both accounts should show 10,000 ETH on Hardhat Local.

If MetaMask shows 0 ETH after switching, clear its cache: Settings, Developer tools, Delete activity and nonce data.

---

## Testing the Contract

    cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
    npx hardhat test

The test suite covers registration, approval, rejection, resource declaration, quantity updates, compliance enforcement, deactivation, penalty calculation across all four tiers, reactivation, escrow, statistics, and access control.

---

## Demonstrating the Full Lifecycle

Because the compliance period is one day, the DApp exposes a Time Simulation panel that fast-forwards the blockchain clock via evm_increaseTime.

Supplier side:

1. MetaMask, switch to Hardhat Supplier, reload page, blue SUPPLIER badge.
2. Register New Supplier: Name "Red Cross", Type NGO, click Apply (100,000 wei), confirm.
3. Wait for "Application submitted, status Pending admin approval".
4. Load My Suppliers. New row appears with state Pending.

Admin side:

5. MetaMask, switch to Hardhat Admin, reload page, yellow ADMIN badge.
6. In Pending Approvals, click Approve on the row, confirm.
7. Overview tab shows 1 approved, 1 active.

Supplier side again:

8. MetaMask, switch to Hardhat Supplier, reload, Load My Suppliers, click Select.
9. Resource Water, Quantity 1000, click Register, confirm.
10. Quantity 2000, click Update, confirm. Timer refreshes.

Break compliance:

11. Click +25h in Time Simulation.
12. Load on Compliance Countdown. Shows EXPIRED.
13. Try to Update to 3000. Fails with "Compliance window expired".

Deactivate:

14. MetaMask, switch to Hardhat Admin, reload, Suppliers tab, find the row, click Deactivate, confirm.

Pay penalty:

15. MetaMask, switch to Hardhat Supplier, reload, Select the supplier.
16. Calculate in the Penalty panel. Shows 200,000 wei.
17. Pay and Reactivate, confirm.
18. Reputation drops by the weighted amount.
19. Escrow panel shows 200,000 wei held, release date about 30 days out.

Check the analytics:

20. MetaMask, switch to Hardhat Admin, reload, Analytics tab.
21. See registrations chart, penalties chart, reputation distribution, supplier-type doughnut, leaderboard.
22. Click Export CSV to download the supplier summary.

Screenshot each step for submission.

---

## Escrow Lifecycle Demonstration

Release, good outcome:

1. Get a supplier into escrow: deactivate, pay penalty, active again.
2. Click +10d three times, 30 days total.
3. In the Hardhat console:

       npx hardhat console --network localhost

       const c = await ethers.getContractAt("SupplierCompliance", require("./frontend/deployed-address.json").address);
       await c.releaseEscrow(1);

4. Admin dashboard, Refresh, Funds Collected, "Escrow refunded" increases.

Forfeit, bad outcome:

1. Get a supplier into escrow.
2. Click +25h. Admin deactivates them again.
3. In the console:

       await c.forfeitEscrow(1);

4. Admin dashboard, Refresh, "Penalties forfeited to aid fund" increases.

---

## Admin Controls Demonstration

| Control | What it does |
|---|---|
| Check Pause Status | Reads paused() |
| Pause Contract | Freezes every state-changing operation |
| Unpause Contract | Resumes operation |
| Set Admin | Transfers the admin role to another wallet |
| Set Aid Fund | Redirects future forfeitures to another wallet |

While paused, supplier registrations, approvals, resource updates, and penalties all revert with "Contract is paused". Read operations still work.

To test role transfer:

1. As admin, enter 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 in the New admin wallet address field.
2. Click Set Admin, confirm.
3. Reload page with the old admin wallet. Badge changes to SUPPLIER.
4. Reload page with the new wallet. Badge changes to ADMIN.

---

## Contract Function Reference

Admin:

| Function | Purpose |
|---|---|
| setAdmin(address) | Transfer admin role |
| setAidFundAddress(address) | Change aid-fund destination |
| pause() / unpause() | Freeze or resume state changes |
| getAdmin() / isAdmin(address) | Read admin address, check role |

Supplier lifecycle:

| Function | Purpose |
|---|---|
| applyAsSupplier(string,uint8) | Pay fee, create pending supplier |
| approveSupplier(uint256) | Admin approves one supplier |
| approveAllPending() | Admin approves all pending |
| rejectSupplier(uint256) | Admin rejects, refunds fee |

Resources:

| Function | Purpose |
|---|---|
| registerResource(uint256,uint8,uint256) | Register a resource |
| updateResourceQuantity(uint256,uint8,uint256) | Update quantity within 24h |
| isResourceCompliant(uint256,uint8) | View compliance |
| remainingComplianceTime(uint256,uint8) | Seconds remaining |

Compliance, penalties, escrow:

| Function | Purpose |
|---|---|
| checkAndDeactivate(uint256) | Admin deactivates |
| calculatePenalty(uint256) | Read penalty due |
| payPenaltyAndReactivate(uint256) | Pay and reactivate |
| releaseEscrow(uint256) | Refund after 30 days |
| forfeitEscrow(uint256) | Send to aid fund if reoffended |
| getEscrowInfo(uint256) | Balance, release time, eligibility flags |

Views:

| Function | Purpose |
|---|---|
| getSupplier(uint256) | Full supplier record |
| getSupplierIdsOf(address) | All suppliers owned by a wallet |
| getComplianceRatio(uint256) | Track record in basis points |
| getTrustTier(uint256) | New, Developing, Trusted, Established |
| predictDeactivationPenalty(uint256) | Weighted loss if deactivated now |
| getReputationTier(uint256) | Platinum, Gold, Silver, Bronze, Probation |
| getStats() | Aggregate counts and fund totals |
| getTypeCounts() | Count per supplier type |
| getTopPerformers(uint256) | Ranked by reputation |
| getFrequentDefaulters(uint256) | Ranked by penalties paid |
| getAggregateResourceQuantity(uint8) | Total quantity per resource |

---

## Contract Events

    AdminChanged(address indexed oldAdmin, address indexed newAdmin)
    AidFundAddressUpdated(address indexed newAddress)
    SupplierApplied(uint256 indexed supplierId, address indexed wallet, string name, SupplierType supplierType, uint256 timestamp)
    SupplierApproved(uint256 indexed supplierId, uint256 timestamp)
    SupplierRejected(uint256 indexed supplierId, uint256 refundedAmount, uint256 timestamp)
    SupplierDeactivated(uint256 indexed supplierId, uint256 reputationLoss, uint256 timestamp)
    SupplierReactivated(uint256 indexed supplierId, uint256 timestamp)
    ResourceRegistered(uint256 indexed supplierId, string resource, uint256 timestamp)
    ResourceUpdated(uint256 indexed supplierId, string resource, uint256 quantity, uint256 timestamp)
    PenaltyPaid(uint256 indexed supplierId, uint256 amount, uint256 timestamp)
    EscrowDeposited(uint256 indexed supplierId, uint256 amount, uint256 releaseTime, uint256 timestamp)
    EscrowReleased(uint256 indexed supplierId, uint256 amount, uint256 timestamp)
    EscrowForfeited(uint256 indexed supplierId, uint256 amount, address recipient, uint256 timestamp)
    ReputationChanged(uint256 indexed supplierId, uint256 oldScore, uint256 newScore, string reason, uint256 timestamp)
    ContractPaused(address indexed by, uint256 timestamp)
    ContractUnpaused(address indexed by, uint256 timestamp)

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| npx.ps1 cannot be loaded | PowerShell execution policy | Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force |
| Cannot find module | node_modules missing | npm install |
| ECONNREFUSED 127.0.0.1:8545 | Hardhat node not running | Start Terminal 1 |
| EADDRINUSE on 8545 | Old node still running | The kill command in Terminal 1 handles this |
| EADDRINUSE on 4444 | Old frontend server running | The kill command in Terminal 3 handles this |
| Stack too deep | Compiler limit | Ensure viaIR is true in hardhat.config.js |
| ParserError: Expected pragma | BOM in .sol file | Save as UTF-8 without BOM |
| deployed-address.json not found | Deployment not run | Run Terminal 2 |
| Only admin can call this | Wrong wallet | Switch MetaMask to the admin wallet |
| Not owner of supplier | Wrong wallet | Switch to the wallet that owns the supplier |
| Compliance window expired | Late update | Admin must deactivate, then pay penalty |
| Supplier not active | Pending or Inactive supplier | Approve or reactivate first |
| MetaMask shows 0 ETH on Hardhat | Cache or wrong RPC | Settings, Developer tools, Delete activity and nonce data. Verify RPC is http://127.0.0.1:8545 |
| MetaMask on wrong chain | Default network | DApp auto-prompts to switch to chain 31337 |

To install ethers.min.js if missing:

    cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance\frontend"
    Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js" -OutFile "ethers.min.js"

---

## Notes on the Local Blockchain

The Hardhat local node is a development sandbox. Every time it restarts, all deployed contracts and all state are wiped. This is by design.

Practical rule: keep Terminal 1 running throughout your session. If you close it, you must redeploy (Terminal 2).

frontend/deployed-address.json is written automatically on every deploy, and the frontend reads it on page load. You never need to manually update the contract address in app.js.

### Optional: Persistent local state

Instead of Hardhat's in-memory node, you can use Ganache with a disk-backed database:

    npx ganache --server.port 8545 --chain.chainId 31337 --wallet.deterministic --database.dbPath ./.chain-data

Then deploy once. On subsequent runs, the same command restores the previous state: suppliers, resources, escrows, everything.

Caveats: chain ID defaults to 1337 unless you pass --chain.chainId 31337. Every redeploy creates a new contract on the same chain, so keep the latest deployed-address.json in sync.

If you do not need persistence, use the standard Hardhat node as documented above.

---

## Submission Contents

The Moodle submission ZIP contains:

- contracts/SupplierCompliance.sol - the smart contract
- scripts/deploy.js - deployment script
- test/SupplierCompliance.test.js - unit tests
- frontend/index.html, frontend/app.js, frontend/styles.css, frontend/ethers.min.js - the DApp
- screenshots/ - every step of the demonstration captured
- Architecture_Report.docx - architecture, functionality, and business rules analysis
- hardhat.config.js, package.json, README.md

node_modules, artifacts, and cache are not included. Regenerate them with npm install and npx hardhat compile.

---

## License

MIT, free to use for educational purposes.

---

## Author

ARGHO DAS / Group 8

Introduction to Blockchain

7th October 2026