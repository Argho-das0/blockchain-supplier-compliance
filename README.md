# Blockchain-Based Supplier Registration, Resource Management, and Compliance System

A decentralized application for managing humanitarian resource suppliers on a local Ethereum-compatible blockchain. Suppliers apply to register, are approved by an admin, declare water/clothing/medicine/food resources, and must update their quantities within a strict one-day compliance window. Non-compliant suppliers are deactivated and can only resume work after paying a duration-based penalty. Escrow, weighted reputation scoring, and an analytics dashboard reward consistent behaviour and expose bad actors.

Everything runs locally against a Hardhat node  no Sepolia, no Vercel, no external services.

---

## Deployed Contract (Local Hardhat)

| Field | Value |
|-------|-------|
| **Contract Address** | Auto-written to `frontend/deployed-address.json` on each deploy |
| **Network** | Hardhat Local (Chain ID 31337) |
| **RPC URL** | `http://127.0.0.1:8545` |
| **Frontend URL** | `http://localhost:4444` |
| **Solidity Version** | 0.8.19 |
| **Hardhat Version** | 2.19+ |
| **Admin (Compliance Officer)** | First Hardhat test account  `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |

---

## Overview

Traditional humanitarian resource management relies on centralized databases  tamper-prone, opaque, and costly to enforce. This project replaces that with a self-executing smart contract. Every business rule is encoded in Solidity. Every state change is permanently recorded on the blockchain. Any stakeholder can independently verify the system without trusting a central authority.

The system has **two roles**:

- **Admin (Compliance Officer)**  approves or rejects new suppliers, deactivates non-compliant ones, manages emergency controls, and views an analytics dashboard.
- **Supplier**  applies, manages one or more supplier identities, declares resources, keeps them compliant, and pays penalties when they slip.

The admin can hand the role to another wallet at any time. Admin status is not tied to a hardcoded address.

---

## Key Features

- **Two-role model**  Admin and Supplier are separated on-chain; only the admin can approve, reject, deactivate, pause, or change the aid fund.
- **Multi-supplier per wallet**  one wallet can own and manage many suppliers (ID-based storage).
- **Supplier types**  NGO, Vendor, Corporate, Individual, Government, Healthcare, Educational, Religious, Other.
- **Admin-approval workflow**  new applications go to `Pending`, then `Active` or `Rejected` (with automatic fee refund on rejection).
- **Predefined resources**  Water, Clothing, Medicine, Food.
- **One-day compliance rule**  every registered resource must be updated within 24 hours (86,400 seconds).
- **Compliance window enforcement**  once expired, the supplier can no longer update; the admin must deactivate them.
- **Duration-based penalties**  four tiers from 200,000 to 1,000,000 wei, based on days inactive.
- **Weighted reputation scoring**  the reputation loss per deactivation is proportional to the supplier's track record and trust tier.
- **Trust tiers**  New / Developing / Trusted / Established, driven by successful 30-day cycles.
- **Escrow**  penalties are held for 30 days; refunded if the supplier stays compliant, forfeited to the aid fund if they reoffend.
- **Reassignable admin**  the current admin can transfer the role to another wallet.
- **Emergency pause**  the admin can freeze every state-changing operation, then unpause.
- **Analytics dashboard**  registrations per day, penalties per day, reputation distribution, supplier-type breakdown, per-supplier leaderboard, CSV export.
- **Full audit trail**  every state change emits an event, permanently recorded on the chain.
- **Time simulation**  a Hardhat tool to fast-forward blockchain time for demonstration.

---

## Project Structure

blockchain-supplier-compliance/
 contracts/
  SupplierCompliance.sol # The smart contract
 scripts/
  deploy.js # Deploys and writes frontend/deployed-address.json
 test/
  SupplierCompliance.test.js # Unit tests
 frontend/
  index.html # DApp markup (tabs, dashboards)
  app.js # Ethers.js integration, role routing, analytics
  styles.css # Styling
  ethers.min.js # Ethers.js 5.7.2 (local copy)
  deployed-address.json # Auto-written on each deploy
 hardhat.config.js # Hardhat config (viaIR enabled)
 package.json # npm manifest
 package-lock.json # Lock file
 README.md # This file
 Architecture_Report.docx # Business and architecture analysis


---

## Business Rules Enforced On-Chain

| # | Rule | Enforced by |
|---|------|-------------|
| 1 | Registration requires exactly 100,000 wei | `require(msg.value == REGISTRATION_FEE)` |
| 2 | One wallet can own many suppliers | `ownedSupplierIds[msg.sender]` array + `nextSupplierId` counter |
| 3 | Only 9 supplier types are accepted | `enum SupplierType` + `require(_type <= uint8(Other))` |
| 4 | New suppliers start in `Pending` | `s.state = SupplierState.Pending` in `applyAsSupplier` |
| 5 | Only the admin can approve or reject | `onlyAdmin` modifier |
| 6 | Rejected applicants get their fee back | `payable(s.wallet).call{value: REGISTRATION_FEE}("")` |
| 7 | Only 4 resource types are accepted | `enum ResourceType` + `validResource` modifier |
| 8 | Only active suppliers can register/update resources | `require(s.state == SupplierState.Active)` |
| 9 | Every resource must be updated within 24 hours | `require(block.timestamp - lastUpdated <= COMPLIANCE_PERIOD)` |
| 10 | Once the window expires, the supplier cannot update | Same require  reverts with `"Compliance window expired"` |
| 11 | Only the admin can deactivate a non-compliant supplier | `onlyAdmin` + `require(missed > 0)` |
| 12 | Penalty amount depends only on days inactive | `_penaltyForDays(days)`  a pure function |
| 13 | Reputation loss depends on track record and trust tier | `_deactivationLoss(s)` |
| 14 | Reactivation requires the exact penalty amount | `require(msg.value == penalty)` |
| 15 | Reactivation resets all compliance timers | Loop over `registeredResources` |
| 16 | Paid penalties go into escrow, not to the admin | `s.escrowAmount += msg.value` |
| 17 | Escrow refunds after 30 days of compliance | `require(block.timestamp >= escrowStartTime + ESCROW_PERIOD)` in `releaseEscrow` |
| 18 | Escrow forfeits to the aid fund if re-deactivated within the window | `forfeitEscrow` + `payable(aidFundAddress).call` |
| 19 | Only the admin can pause, unpause, or change the aid fund | `onlyAdmin` modifier |
| 20 | The admin role is transferable | `setAdmin` under `onlyAdmin` |

### Penalty Tiers (wei)

| Days since deactivation | Penalty |
|-------------------------|---------|
| 0  1 | 200,000 wei |
| 2  7 | 400,000 wei |
| 8  21 | 800,000 wei |
| 22 + | 1,000,000 wei |

---

## Scoring Mechanism

Reputation is not a flat counter. Two dimensions drive every deactivation penalty.

### Dimension 1  Compliance ratio
ratio = compliantUpdates / (compliantUpdates + missedUpdates)

- `compliantUpdates` increments on every on-time update.
- `missedUpdates` increments by the number of expired resources found at deactivation.

### Dimension 2  Trust tier

`successfulCycles` advances by 1 every time escrow is refunded after a clean 30-day window. It resets to 0 on every deactivation.

| Trust tier | Successful cycles | Multiplier |
|---|---|---|
| New | 02 | 1.5 |
| Developing | 37 | 1.0 |
| Trusted | 815 | 0.7 |
| Established | 16+ | 0.5 |

### The formula
loss = 20  (2  complianceRatio)  trustMultiplier


Capped at **40 points** per deactivation.

### Worked examples

| Scenario | Ratio | Trust | Loss |
|---|---|---|---|
| Brand new, never updated | 0.00 | New | 40 (capped) |
| Updated 2/10, deactivated | 0.20 | New | 40 (capped) |
| Updated half the time | 0.50 | New | 40 (capped) |
| Updated 8/10 | 0.80 | Developing | 24 |
| Trusted veteran, 9/10 | 0.90 | Trusted | 14 |
| Established veteran, rare slip | 0.90 | Established | 10 |
| Perfect record, one bad week | 1.00 | Trusted | 7 |
| Long-term perfect record | 1.00 | Established | 5 |

Same rule broken. Very different outcomes. A first-time offender with no history loses **8 more** than a trusted veteran with a perfect record.

### Rewards scale with trust

| Trust tier | Points gained per compliant update |
|---|---|
| New | +1 |
| Developing | +2 |
| Trusted | +3 |
| Established | +5 |

So good behaviour compounds. Long-term reliable suppliers climb faster than new ones.

### Reputation tier bands

| Tier | Score range |
|---|---|
| Platinum | 180  200 |
| Gold | 150  179 |
| Silver | 120  149 |
| Bronze | 80  119 |
| Probation | 0  79 |

---

## Escrow Mechanism

Penalties do not go to the admin. They are held in escrow for **30 days**.

1. Supplier is deactivated.
2. Admin deactivates them (or the automated path via Chainlink `performUpkeep`).
3. Supplier pays the penalty  funds move into `escrowAmount`.
4. **Path A  Good behaviour:** after 30 days, `releaseEscrow` sends the funds back to the supplier and increments `successfulCycles`.
5. **Path B  Repeat violation:** if the supplier is deactivated again inside the 30-day window, `forfeitEscrow` sends the funds to `aidFundAddress`.

The aid fund destination is admin-configurable via `setAidFundAddress`.

Think of it like a security deposit  refundable if you behave, forfeited if you don't.

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Smart Contract | Solidity | 0.8.19 |
| Development Framework | Hardhat | 2.19+ |
| Local Blockchain | Hardhat Network |  |
| Wallet | MetaMask | Latest |
| Frontend Library | Ethers.js | 5.7.2 |
| Charts | Chart.js | 4.4.1 |
| Testing | Chai + Mocha |  |
| Runtime | Node.js | 18+ |
| Package Manager | npm | Latest |

---

## Prerequisites

- **Node.js** 18 or newer
- **MetaMask** browser extension
- **Python 3** (for serving the frontend) OR `npx serve`

Verify:
node --version
npm --version


---

## Installation

Run once, after cloning:

```powershell
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npm install
npx hardhat compile