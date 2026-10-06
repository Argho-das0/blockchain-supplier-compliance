# Blockchain-Based Supplier Registration, Resource Management, and Compliance System

A decentralized application for managing humanitarian resource suppliers on a local Ethereum-compatible blockchain. Suppliers apply to register, are approved by an admin, declare water, clothing, medicine, and food resources, and must update their quantities within a strict one-day compliance window. Non-compliant suppliers are deactivated and can only resume work after paying a duration-based penalty. Escrow, weighted reputation scoring, and an analytics dashboard reward consistent behaviour and expose bad actors.

Everything runs locally against a Hardhat node. No Sepolia, no Vercel, no external services. State is in-memory on the Hardhat node and is wiped on restart, by design. See the Persistent Local State section for details.

---

## Table of Contents

1. [Deployed Contract](#deployed-contract)
2. [Overview](#overview)
3. [Roles](#roles)
4. [Data Model](#data-model)
5. [Enums and Types](#enums-and-types)
6. [Supplier Lifecycle](#supplier-lifecycle)
7. [Resource Lifecycle](#resource-lifecycle)
8. [Compliance Mechanism](#compliance-mechanism)
9. [Penalty Mechanism](#penalty-mechanism)
10. [Reputation and Scoring](#reputation-and-scoring)
11. [Escrow Mechanism](#escrow-mechanism)
12. [Analytics Layer](#analytics-layer)
13. [Admin Controls](#admin-controls)
14. [Smart Contract Function Reference](#smart-contract-function-reference)
15. [Events Reference](#events-reference)
16. [Revert Reasons Reference](#revert-reasons-reference)
17. [Frontend Walkthrough](#frontend-walkthrough)
18. [Access Control Matrix](#access-control-matrix)
19. [Security Notes](#security-notes)
20. [Technology Stack](#technology-stack)
21. [Prerequisites](#prerequisites)
22. [Installation](#installation)
23. [Running the Application](#running-the-application)
24. [MetaMask Setup](#metamask-setup)
25. [Testing the Contract](#testing-the-contract)
26. [Demonstrating the Full Lifecycle](#demonstrating-the-full-lifecycle)
27. [Escrow Lifecycle Demonstration](#escrow-lifecycle-demonstration)
28. [Troubleshooting](#troubleshooting)
29. [Persistent Local State](#persistent-local-state)
30. [Glossary](#glossary)
31. [Submission Contents](#submission-contents)
32. [License](#license)

---

## Deployed Contract

| Field | Value |
|-------|-------|
| Contract Address | Auto-written to frontend/deployed-address.json on each deploy |
| Network | Hardhat Local (Chain ID 31337) |
| RPC URL | http://127.0.0.1:8545 |
| Frontend URL | http://localhost:4444 |
| Solidity Version | 0.8.19 |
| Hardhat Version | 2.19 or newer |
| Admin (Compliance Officer) | First Hardhat test account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 |

The contract address changes on every fresh deploy. The frontend reads it from `frontend/deployed-address.json` on page load, so no manual update is needed.

---

## Overview

Traditional humanitarian resource management relies on centralized databases that are tamper-prone, opaque, and costly to enforce. This project replaces that with a self-executing smart contract. Every business rule is encoded in Solidity. Every state change is permanently recorded on the blockchain. Any stakeholder can independently verify the system without trusting a central authority.

The system has two roles: Admin (Compliance Officer) and Supplier. Both interact with the same deployed contract through a browser-based DApp. The admin manages the system. The supplier manages their resources and compliance obligations. The blockchain ensures that neither side can cheat.

Every action a user takes — applying, approving, updating a quantity, deactivating, paying a penalty — is a signed transaction that goes through the contract's business rules and emits an event. Events are permanent, indexable, and queryable. That's the audit trail.

---

## Roles

### Admin (Compliance Officer)

The admin is the wallet that deployed the contract. The role is transferable at any time via `setAdmin`. Only one admin exists at a time.

What the admin can do:

- Approve or reject pending supplier applications
- Deactivate non-compliant suppliers
- Pause and unpause the contract
- Change the aid fund address (where forfeited escrow goes)
- Transfer the admin role to another wallet
- View all suppliers, analytics, funds, and statistics

What the admin cannot do:

- Register as a supplier on behalf of someone else
- Pay penalties on behalf of a supplier
- Register resources on behalf of a supplier
- Update quantities on behalf of a supplier
- Seize escrow arbitrarily — escrow can only flow to the supplier (on release) or to the aid fund (on forfeit), and only under the conditions written in the contract

### Supplier

Any wallet that has at least one registered supplier identity. A single wallet can own and manage many suppliers simultaneously.

What the supplier can do:

- Apply for registration and pay the fee
- Own many supplier identities
- Register predefined resources
- Update quantities on time to stay compliant
- Pay penalties and reactivate after deactivation
- Call `releaseEscrow` after 30 days of compliance
- Call `forfeitEscrow` if the supplier is inactive inside the escrow window

What the supplier cannot do:

- Approve their own application
- Deactivate themselves (only the admin can do this)
- Register a resource type that isn't one of the four predefined ones
- Update a resource after the 24-hour window has expired
- Reactivate without paying the exact penalty

---

## Data Model

### Supplier struct

Storage layout for each supplier. Keyed by an auto-incrementing uint256 ID.

```solidity
struct Supplier {
    uint256 id;
    address wallet;
    string name;
    SupplierType supplierType;
    SupplierState state;

    uint256 registrationTimestamp;
    uint256 approvalTimestamp;
    uint256 deactivationTimestamp;
    uint256 lastDeactivationDays;

    bool registered;
    uint256 timesDeactivated;

    uint256 reputationScore;
    uint256 compliantUpdates;
    uint256 missedUpdates;
    uint256 successfulCycles;

    uint256 totalPenaltiesPaid;

    uint256 escrowAmount;
    uint256 escrowStartTime;

    ResourceType[] registeredResources;
    mapping(ResourceType => Resource) resources;
}
```

| Field | Meaning | When it changes |
|-------|---------|-----------------|
| id | Auto-incremented unique ID | Set at apply time |
| wallet | Owner wallet | Set at apply time; never changes |
| name | Display name | Set at apply time; never changes |
| supplierType | One of nine types | Set at apply time; never changes |
| state | Pending / Active / Inactive / Rejected | Changes on approval, deactivation, reactivation, rejection |
| registrationTimestamp | Apply time | Set at apply |
| approvalTimestamp | Approval time | Set on approval |
| deactivationTimestamp | Most recent deactivation time | Set on each deactivation |
| lastDeactivationDays | Days inactive at last penalty payment (frozen) | Set on each payment |
| registered | True once approved | Set on approval; never reset |
| timesDeactivated | Counter | Increments on each deactivation |
| reputationScore | 0 to 200 | Moves with each update and deactivation |
| compliantUpdates | Count of on-time updates | Increments on each successful update |
| missedUpdates | Count of missed resources at deactivation | Increments by the number of expired resources when deactivated |
| successfulCycles | Clean 30-day cycles completed | Increments on each `releaseEscrow`; resets to 0 on deactivation |
| totalPenaltiesPaid | Cumulative wei paid | Increments on each penalty payment |
| escrowAmount | Current escrow balance | Increases on payment; zeroed on release or forfeit |
| escrowStartTime | When current escrow began | Set on payment; zeroed on release or forfeit |
| registeredResources | Array of ResourceType | Appended when a new resource is registered |
| resources | Mapping from ResourceType to Resource | Populated on registration and modified on update |

### Resource struct

One per (supplier, resourceType) pair that has been registered.

```solidity
struct Resource {
    ResourceType resourceType;
    uint256 quantity;
    uint256 lastUpdated;
    bool registered;
    bool compliant;
}
```

| Field | Meaning | When it changes |
|-------|---------|-----------------|
| resourceType | Water, Clothing, Medicine, Food | Set at registration |
| quantity | Current declared quantity | Set at registration; updated on each update |
| lastUpdated | Timestamp of most recent update | Set at registration; refreshed on each update; reset on reactivation |
| registered | True once registered | Set at registration; never reset |
| compliant | Whether the resource is compliant | True on registration and update; set to false when found expired at deactivation |

### Global state variables

```solidity
address public admin;
address public aidFundAddress;
bool public paused;

mapping(uint256 => Supplier) private suppliers;
uint256 public nextSupplierId;
uint256 public totalRegisteredSuppliers;
uint256 public totalPendingSuppliers;
uint256 public totalRejectedSuppliers;

mapping(address => uint256[]) private ownedSupplierIds;

uint256 public totalPenaltiesCollected;
uint256 public totalRegistrationFeesCollected;
uint256 public totalEscrowHeld;
uint256 public totalEscrowRefunded;
```

| Variable | Meaning |
|----------|---------|
| admin | Current admin wallet |
| aidFundAddress | Wallet that receives forfeited escrow |
| paused | When true, all state-changing functions revert |
| suppliers | ID to Supplier struct mapping |
| nextSupplierId | Counter of suppliers ever created |
| totalRegisteredSuppliers | Count of approved suppliers |
| totalPendingSuppliers | Count of pending applications |
| totalRejectedSuppliers | Count of rejected applications |
| ownedSupplierIds | Reverse index — which supplier IDs belong to a wallet |
| totalPenaltiesCollected | Cumulative wei forfeited to aid fund |
| totalRegistrationFeesCollected | Cumulative wei from approved registrations |
| totalEscrowHeld | Current escrow across all suppliers |
| totalEscrowRefunded | Cumulative wei refunded from escrow |

---

## Enums and Types

```solidity
enum ResourceType { Water, Clothing, Medicine, Food }
enum SupplierType { NGO, Vendor, Corporate, Individual, Government, Healthcare, Educational, Religious, Other }
enum SupplierState { Pending, Active, Inactive, Rejected }
enum TrustTier { New, Developing, Trusted, Established }
```

ResourceType and SupplierType are passed as uint8 from the frontend. Solidity maps 0 to the first member, 1 to the second, and so on.

| ResourceType | Numeric |
|--------------|---------|
| Water | 0 |
| Clothing | 1 |
| Medicine | 2 |
| Food | 3 |

| SupplierType | Numeric |
|--------------|---------|
| NGO | 0 |
| Vendor | 1 |
| Corporate | 2 |
| Individual | 3 |
| Government | 4 |
| Healthcare | 5 |
| Educational | 6 |
| Religious | 7 |
| Other | 8 |

| SupplierState | Numeric | Meaning |
|---------------|---------|---------|
| Pending | 0 | Applied, awaiting admin decision |
| Active | 1 | Approved and in good standing |
| Inactive | 2 | Deactivated for non-compliance, awaiting penalty payment |
| Rejected | 3 | Application denied; fee refunded |

TrustTier is derived from successfulCycles and is not stored; it's computed on demand.

---

## Supplier Lifecycle

A supplier moves through five distinct states over its lifetime.

```
                    ┌─────────────┐
                    │  (no state) │
                    └──────┬──────┘
                           │ applyAsSupplier + 100,000 wei
                           ▼
                    ┌─────────────┐
                    │   Pending   │
                    └──┬───────┬──┘
              approve  │       │  reject (fee refunded)
                       ▼       ▼
                ┌───────────┐  ┌──────────┐
                │  Active   │  │ Rejected │
                └─────┬─────┘  └──────────┘
                      │ deactivate (missed 24h window)
                      ▼
                ┌───────────┐
                │ Inactive  │
                └─────┬─────┘
                      │ payPenaltyAndReactivate
                      ▼
                ┌───────────┐
                │  Active   │  (cycle repeats)
                └───────────┘
```

### Step 1 — Apply

The supplier's wallet calls `applyAsSupplier(name, type)` and sends exactly 100,000 wei. The contract creates a new supplier record with `state = Pending`, sets `reputationScore = 100`, and appends the new ID to the wallet's owned list. The fee is held in the contract, not yet counted as revenue.

### Step 2a — Approve

The admin calls `approveSupplier(id)`. The contract sets `state = Active`, sets `registered = true`, sets `approvalTimestamp = now`, decrements `totalPendingSuppliers`, increments `totalRegisteredSuppliers`, and adds the fee to `totalRegistrationFeesCollected`. The supplier can now register resources.

### Step 2b — Reject

The admin calls `rejectSupplier(id)`. The contract sets `state = Rejected`, decrements `totalPendingSuppliers`, increments `totalRejectedSuppliers`, and refunds the 100,000 wei to the applicant's wallet. The supplier record remains but is inert.

### Step 3 — Active

The supplier registers resources and updates them within the compliance window. If they succeed, they stay Active indefinitely.

### Step 4 — Inactive

When the admin calls `checkAndDeactivate(id)` on a supplier whose resources have all expired, the contract sets `state = Inactive`, records the deactivation timestamp, increments `timesDeactivated`, resets `successfulCycles` to 0, and subtracts a weighted reputation loss. From this point, the supplier cannot register or update resources.

### Step 5 — Reactivate

The supplier calls `payPenaltyAndReactivate(id)`, sending exactly the penalty owed. The contract verifies the amount, moves it into escrow, sets `state = Active`, resets every registered resource's `lastUpdated` to now, and applies any late-payment reputation penalty. The compliance timers all restart.

---

## Resource Lifecycle

Each (supplier, resource type) pair moves through its own state machine.

```
┌──────────────────┐
│  Not registered  │
└────────┬─────────┘
         │ registerResource(id, type, qty)
         ▼
┌──────────────────┐
│    Registered    │  compliant = true, lastUpdated = now
│    (Compliant)   │
└────────┬─────────┘
         │
         ├──────────────────────────────────┐
         │ updateResourceQuantity within 24h│ lastUpdated + 24h > now
         ▼                                  ▼
   refreshed compliant               ┌──────────────────┐
                                     │  Non-compliant   │
                                     │   (Expired)      │
                                     └────────┬─────────┘
                                              │ admin deactivates + reactivation
                                              ▼
                                       lastUpdated = now (Compliant again)
```

### Registration

`registerResource(id, type, quantity)` writes a new Resource struct for the (supplier, type) pair and appends the type to the supplier's registeredResources array. The resource starts compliant with `lastUpdated = block.timestamp`.

### On-time update

`updateResourceQuantity(id, type, quantity)` succeeds if the current time is within 24 hours of the resource's last update. It overwrites the quantity and refreshes `lastUpdated`. It also increments `compliantUpdates` and applies a trust-tier-scaled reputation reward.

### Off-time update (rejected)

If more than 24 hours have passed, the same call reverts with `"Compliance window expired"`. The supplier cannot fix this on their own. Only the admin can deactivate, and only then can the supplier pay to reactivate.

### Reactivation resets all timers

When the supplier pays the penalty, every registered resource's `lastUpdated` is set to the payment time. Every resource is compliant again.

---

## Compliance Mechanism

The one-day compliance rule is the core behavioural constraint of the system.

- Every registered resource must be updated within 24 hours (86,400 seconds).
- The clock starts at registration and restarts on every successful update.
- Once the clock passes 24 hours without an update, the resource is non-compliant.
- A supplier with at least one non-compliant resource can be deactivated by the admin.
- While deactivated, the supplier cannot register or update any resource.

The contract implements the check as a comparison against `block.timestamp`:

```solidity
require(
    block.timestamp - s.resources[rType].lastUpdated <= COMPLIANCE_PERIOD,
    "Compliance window expired"
);
```

Note that the contract does not automatically deactivate anyone. It only marks resources as non-compliant inside `checkAndDeactivate`, and only when the admin explicitly calls that function on the supplier. This is a deliberate design choice — deactivation is a state-changing event that has consequences (reputation loss, penalty accrual), and the admin should be the one to trigger it. In a production system, this would be handled by an automated keeper (Chainlink Automation `performUpkeep` is implemented in the contract and would run on a live network).

`isResourceCompliant(id, type)` is a view function you can call any time to check the current state.

`remainingComplianceTime(id, type)` returns the seconds remaining, or 0 if expired.

---

## Penalty Mechanism

The penalty is the amount of wei a deactivated supplier must pay to reactivate. It's calculated from the number of days the supplier has been inactive.

### Tiers

| Days since deactivation | Penalty |
|-------------------------|---------|
| 0 to 1 | 200,000 wei |
| 2 to 7 | 400,000 wei |
| 8 to 21 | 800,000 wei |
| 22 or more | 1,000,000 wei |

Implemented in a pure function:

```solidity
function _penaltyForDays(uint256 _daysInactive) internal pure returns (uint256) {
    if (_daysInactive <= 1) return PENALTY_RATE_LOW;
    if (_daysInactive <= 7) return PENALTY_RATE_MID;
    if (_daysInactive <= 21) return PENALTY_RATE_HIGH;
    return PENALTY_RATE_MAX;
}
```

Because this is a pure function with no external state, the same input always produces the same output. Two suppliers deactivated for the same number of days owe exactly the same penalty, regardless of their history. That's the "deterministic penalty" requirement.

### Payment

`payPenaltyAndReactivate(id)` requires `msg.value == penalty`. If the caller sends too much or too little, the transaction reverts with `"Incorrect penalty amount"`. The payment moves into escrow (not to the admin), and the supplier becomes Active again.

### Late-payment penalty

If a supplier pays the penalty more than 1 hour after deactivation, they lose an extra 5 reputation points on top of the weighted deactivation loss. This is implemented as:

```solidity
uint256 lateRelief = (block.timestamp - s.deactivationTimestamp > REPUTATION_PROMPT_WINDOW)
    ? REPUTATION_PROMPT_RELIEF
    : 0;
```

The reasoning: a supplier who pays within an hour is showing urgency. One who waits is showing complacency.

---

## Reputation and Scoring

Reputation is a 0-200 integer that tracks a supplier's behaviour over time. It starts at 100 and moves up or down with every significant action.

### Two factors

**Compliance ratio.** The ratio of successful updates to total update attempts.

```
ratio = compliantUpdates / (compliantUpdates + missedUpdates)
```

A supplier who has never updated has ratio 0. A supplier with a perfect record has ratio 1.0. The ratio is expressed internally in basis points (0 to 10000) to avoid floating point math.

**Trust tier.** Based on the number of successful 30-day cycles completed without a deactivation.

| Trust tier | successfulCycles | Multiplier |
|---|---|---|
| New | 0 to 2 | 1.5 |
| Developing | 3 to 7 | 1.0 |
| Trusted | 8 to 15 | 0.7 |
| Established | 16 or more | 0.5 |

`successfulCycles` increments each time the supplier completes a 30-day escrow window cleanly and calls `releaseEscrow`. It resets to 0 on every deactivation.

### The penalty formula

When a supplier is deactivated:

```
loss = 20 * (2 - complianceRatio) * trustMultiplier
```

Capped at 40 points per deactivation.

Implemented in basis-point integer arithmetic:

```solidity
uint256 ratio = _complianceRatioBps(s);        // 0 to 10000
uint256 trackMultiplierBps = 20000 - ratio;    // 20000 down to 10000
uint256 trustMultiplierBps = /* 15000, 10000, 7000, 5000 */;

uint256 loss = (REPUTATION_PENALTY_BASE * trackMultiplierBps * trustMultiplierBps) / 100000000;
if (loss > REPUTATION_PENALTY_CAP) loss = REPUTATION_PENALTY_CAP;
if (loss == 0) loss = 1;
```

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

The first row and the last row tell the story: same violation, eight times the impact. A supplier with no history is judged harshly. A supplier with a long clean record gets the benefit of the doubt.

### The reward system

On-time updates reward reputation on a trust-tier-scaled basis:

| Trust tier | Reward per compliant update |
|---|---|
| New | +1 |
| Developing | +2 |
| Trusted | +3 |
| Established | +5 |

The reward scales with trust. A supplier who has climbed to Trusted gains reputation faster than one at New, so good behaviour compounds. It also means that a long-tenured supplier can recover from a rare deactivation faster than a new one.

### Reputation tier bands

The score maps to five display tiers:

| Tier | Score range |
|------|-------------|
| Platinum | 180 to 200 |
| Gold | 150 to 179 |
| Silver | 120 to 149 |
| Bronze | 80 to 119 |
| Probation | 0 to 79 |

These are for display. `getReputationTier(id)` returns the tier name as a string. Reputation itself is a raw number.

---

## Escrow Mechanism

Escrow is a 30-day holding period applied to every penalty payment.

### Why escrow exists

A plain penalty is paid once and forgotten. A supplier who misbehaves repeatedly can treat each penalty as a small cost of doing business. Escrow changes the incentive structure: the penalty becomes a **security deposit** that's refunded only if the supplier behaves. If they misbehave again inside the 30-day window, the deposit is forfeited to the aid fund.

### The lifecycle

**1. Payment.** Supplier pays penalty. Contract moves the wei into `escrowAmount` and sets `escrowStartTime = now`.

**2. Hold.** For 30 days, the wei sits in escrow. Both `releasable` and `forfeitEligible` are false.

**3. End-of-window resolution.** Two outcomes are possible:

**Path A — Release.** If 30 days have elapsed and the supplier is still Active, anyone can call `releaseEscrow(id)`. The full amount goes back to the supplier's wallet, `successfulCycles` increments by 1, and the escrow balance zeroes out.

**Path B — Forfeit.** If the supplier is deactivated again inside the 30-day window, `forfeitEligible` flips to true. Anyone can call `forfeitEscrow(id)`. The full amount goes to the aid fund, and `totalPenaltiesCollected` increments.

### The escrow state machine

```
Empty ──pay penalty──▶ Held ──30 days + Active──▶ Refunded
                        │
                        └──deactivated again──▶ Forfeited
```

Once escrow reaches Refunded or Forfeited, it returns to Empty. A new penalty payment starts the cycle again.

### Querying escrow

`getEscrowInfo(id)` returns four values:

- `balance` — current escrow balance in wei
- `releaseTime` — the timestamp when the window elapses
- `releasable` — true if the window has passed and the supplier is Active
- `forfeitEligible` — true if the window has not passed and the supplier is not Active

The frontend shows these in the Escrow panel of the supplier dashboard.

### Why it's not a fine

A fine is money spent. Escrow is money at risk. The two create different behaviours. A supplier who has 200,000 wei sitting in escrow has a real reason to stay compliant for 30 days — they don't want to lose it. A supplier who has paid a fine has no such pressure.

---

## Analytics Layer

The admin's Analytics tab is not a contract feature — the contract has no notion of charts or histograms. The analytics are computed **in the browser** from on-chain events.

### How it works

When the admin opens the Analytics tab, the frontend:

1. Calls `queryFilter` for each event type, from block 0 to the latest block.
2. Fetches the block timestamp for each unique block that emitted an event.
3. Sorts all events by block number.
4. Aggregates them into per-supplier and per-day buckets.
5. Renders the results in tables and Chart.js charts.

Because everything is derived from events, the analytics are always consistent with the on-chain state. If you clear the browser cache, the data comes back next time you visit the tab. If you redeploy the contract, the analytics reset — because the old events are on a different contract address.

### What the analytics tab shows

**Summary cards.** Total suppliers, active suppliers, average reputation, default rate, total penalties paid.

- "Total suppliers" is the number of distinct supplier IDs seen in any event.
- "Active suppliers" is suppliers that have been approved and not currently deactivated.
- "Average reputation" is computed from the most recent `ReputationChanged` event per supplier.
- "Default rate" is total deactivations divided by total suppliers, as a percentage.
- "Total penalties paid" is the sum of every `PenaltyPaid` event amount.

**Registrations chart.** Line chart of `SupplierApplied` events per day over the last 30 days.

**Penalties chart.** Bar chart of `PenaltyPaid` event amounts per day over the last 30 days.

**Reputation distribution.** Bar chart of suppliers falling into each reputation tier (Platinum, Gold, Silver, Bronze, Probation).

**Supplier types.** Doughnut chart showing the count of each supplier type.

**Leaderboard.** Table of up to 20 suppliers sorted by total penalties paid, with columns for ID, name, type, reputation, deactivations, penalties paid, and resource updates.

**Export CSV.** Downloads a spreadsheet-ready file with one row per supplier and columns: id, name, type, reputation, tier, deactivations, reactivations, penaltiesPaid, resourceUpdates, resourcesRegistered, appliedAt, approvedAt.

### Why browser-side and not on-chain

Aggregating on-chain would mean storing sums, counts, and histograms in contract storage, which costs gas on every write and is inflexible if you want to add a new metric later. Browser-side analytics means you can change what you display without redeploying the contract. The trade-off is that very large numbers of events would slow the page load. For a demo with hundreds of events, it's instant.

### Why events are the source of truth

Events are permanent and immutable. Anyone can index them independently. A block explorer, a subgraph, or a custom script could produce the same charts. The frontend's implementation is just one consumer of the same underlying data.

---

## Admin Controls

The Emergency & Admin Controls panel gives the admin four capabilities beyond the day-to-day approval workflow.

### Pause / Unpause

`pause()` sets a boolean flag. Every state-changing function in the contract checks the flag through the `whenNotPaused` modifier. When paused, the following functions revert with `"Contract is paused"`:

- `applyAsSupplier`
- `approveSupplier`
- `approveAllPending`
- `rejectSupplier`
- `registerResource`
- `updateResourceQuantity`
- `checkAndDeactivate`
- `payPenaltyAndReactivate`
- `performUpkeep`

Read-only functions still work. You can browse suppliers, check escrow, view statistics, and query anything — you just can't change state.

`unpause()` reverses the flag. Everything resumes where it left off.

### Set Admin

`setAdmin(newAdmin)` transfers the admin role. The old admin loses privileges immediately. The new admin gains them immediately. There's no delay, no confirmation step. This is a real transfer of control.

Note that a compromised admin wallet can hand the role to an attacker. There is no multi-signature or time-delay mechanism in this contract. In production, the admin role would typically be held by a multi-sig contract (like Safe) rather than a single EOA.

### Set Aid Fund

`setAidFundAddress(newAddress)` changes where forfeited escrow is sent. The current address continues to hold any escrow that was already forfeited to it in the past — this function only affects future forfeitures. There's no way to claw back funds that have already left the contract.

### Check Pause Status

A view-only button that calls `paused()` and displays the current state. Useful for verifying the contract is active before running a demo.

---

## Smart Contract Function Reference

Every public and external function, with what it does, who can call it, and what it changes.

### Constructor

**`constructor()`**

Runs once at deploy time. Sets `admin = msg.sender`, `aidFundAddress = msg.sender`, `paused = false`. No parameters.

### Admin functions

**`setAdmin(address _newAdmin)`**

Transfers the admin role. Reverts if the caller isn't the current admin, or if the new address is the zero address. Emits `AdminChanged`.

**`setAidFundAddress(address _newAddress)`**

Changes the aid fund destination. Reverts if the caller isn't the admin, or if the address is the zero address. Emits `AidFundAddressUpdated`.

**`pause()`**

Sets `paused = true`. Reverts if the caller isn't the admin, or if the contract is already paused. Emits `ContractPaused`.

**`unpause()`**

Sets `paused = false`. Reverts if the caller isn't the admin, or if the contract isn't paused. Emits `ContractUnpaused`.

**`getAdmin()`** — returns the current admin address. View.

**`isAdmin(address _who)`** — returns true if `_who` is the current admin. View.

### Approval functions

**`applyAsSupplier(string _name, uint8 _type)`**

Creates a new supplier with the given name and type. Requires `msg.value == 100000 wei`, non-empty name, and `_type <= 8`. Sets state to Pending. Emits `SupplierApplied`. Returns the new supplier ID.

**`approveSupplier(uint256 _supplierId)`**

Moves a pending supplier to Active. Requires the caller to be the admin and the supplier to be in Pending state. Increments `totalRegisteredSuppliers` and `totalRegistrationFeesCollected`. Emits `SupplierApproved` and `ReputationChanged`.

**`approveAllPending()`**

Loops over every supplier and approves any that are in Pending state. Admin-only. Useful for bulk demo setup.

**`rejectSupplier(uint256 _supplierId)`**

Moves a pending supplier to Rejected and refunds the registration fee. Admin-only. Emits `SupplierRejected`.

### Resource functions

**`registerResource(uint256 _supplierId, uint8 _resourceType, uint256 _quantity)`**

Adds a new resource to a supplier. Requires the caller to own the supplier, the supplier to be Active, the resource type to be valid (0-3), the resource to not already be registered, and the quantity to be greater than zero. Emits `ResourceRegistered`.

**`updateResourceQuantity(uint256 _supplierId, uint8 _resourceType, uint256 _quantity)`**

Updates the quantity of a registered resource. Requires ownership, Active state, valid resource type, registered resource, positive quantity, and compliance window not expired. Increments `compliantUpdates` and applies a reputation reward. Emits `ResourceUpdated` and `ReputationChanged`.

**`isResourceCompliant(uint256 _supplierId, uint8 _resourceType)`** — view. Returns whether the resource is registered, the supplier is Active, and the resource is within its 24-hour window.

**`remainingComplianceTime(uint256 _supplierId, uint8 _resourceType)`** — view. Returns seconds until the compliance deadline, or 0 if expired.

**`getSupplierResourceQuantity(uint256 _supplierId, uint8 _resourceType)`** — view. Returns the current quantity.

**`getSupplierResourceLastUpdated(uint256 _supplierId, uint8 _resourceType)`** — view. Returns the last update timestamp.

### Compliance functions

**`checkAndDeactivate(uint256 _supplierId)`**

Admin-only. Iterates the supplier's registered resources, identifies any that have expired, and if at least one is expired, moves the supplier to Inactive. Increments `missedUpdates` by the number of expired resources. Applies the weighted reputation loss. Resets `successfulCycles` to 0. Emits `SupplierDeactivated` and `ReputationChanged`.

Reverts if the caller isn't the admin, the supplier isn't Active, or no resources are expired.

### Chainlink Automation functions

**`checkUpkeep(bytes calldata)`** — view. Returns `(true, abi.encode(supplierId))` if any supplier has at least one expired resource. Otherwise returns `(false, "")`.

**`performUpkeep(bytes calldata performData)`**

Called by the Chainlink keeper. Decodes the supplier ID from `performData`, verifies the supplier is Active and has expired resources, and applies the same deactivation logic as `checkAndDeactivate`. This is how the system would auto-deactivate suppliers on a live network.

### Penalty and reactivation functions

**`calculatePenalty(uint256 _supplierId)`** — view. Returns the wei the supplier owes based on days inactive. Reverts if the supplier is not Inactive.

**`payPenaltyAndReactivate(uint256 _supplierId)`**

Supplier-only. Requires the supplier to be Inactive and `msg.value` to equal the exact penalty. Moves the payment into escrow, applies the late-payment reputation penalty if applicable, sets `state = Active`, resets all resource timers, and emits four events.

### Escrow functions

**`releaseEscrow(uint256 _supplierId)`**

Anyone can call. Requires a non-zero escrow balance, 30 days elapsed since payment, and the supplier to be Active. Sends the full amount to the supplier's wallet, increments `successfulCycles`, zeroes the escrow balance. Emits `EscrowReleased`.

**`forfeitEscrow(uint256 _supplierId)`**

Anyone can call. Requires a non-zero escrow balance, the window to not have elapsed, and the supplier to not be Active. Sends the full amount to the aid fund, increments `totalPenaltiesCollected`, zeroes the escrow balance. Emits `EscrowForfeited`.

**`getEscrowInfo(uint256 _supplierId)`** — view. Returns `(balance, releaseTime, releasable, forfeitEligible)`.

### Reputation view functions

**`getComplianceRatio(uint256 _supplierId)`** — view. Returns the ratio in basis points (0 to 10000).

**`getTrustTier(uint256 _supplierId)`** — view. Returns 0, 1, 2, or 3 for New, Developing, Trusted, Established.

**`predictDeactivationPenalty(uint256 _supplierId)`** — view. Returns the reputation points that would be lost if the supplier were deactivated right now. Useful for showing a supplier the cost of a slip before it happens.

**`getReputationTier(uint256 _supplierId)`** — view. Returns the tier name as a string: "Platinum", "Gold", "Silver", "Bronze", or "Probation".

**`getLastDeactivationDays(uint256 _supplierId)`** — view. Returns the frozen number of days inactive at last penalty payment.

### Supplier view functions

**`getSupplier(uint256 _supplierId)`** — view. Returns 14 values: id, wallet, name, supplierType, state, reputationScore, totalPenaltiesPaid, timesDeactivated, resourceCount, lastDeactivationDays, compliantUpdates, missedUpdates, successfulCycles, trustTier. This is the primary read function for the DApp.

**`getSupplierIdsOf(address _who)`** — view. Returns every supplier ID owned by a wallet.

**`getMySupplierIds()`** — view. Same as above, for `msg.sender`.

**`getAllSupplierIds()`** — view. Returns every supplier ID that has ever been created, including pending and rejected.

### Aggregate view functions

**`getStats()`** — view. Returns nine values: total approved, active, inactive, pending, rejected, funds from registration, funds from penalties, escrow held, escrow refunded.

**`getTotalFundsCollected()`** — view. Returns `totalRegistrationFeesCollected + totalPenaltiesCollected`.

**`getTypeCounts()`** — view. Returns an array of 9 counts, one per supplier type. Rejected suppliers are excluded.

**`getTopPerformers(uint256 _limit)`** — view. Returns two arrays: the top N supplier IDs by reputation, and their scores. Only includes Active suppliers.

**`getFrequentDefaulters(uint256 _limit)`** — view. Returns two arrays: the top N supplier IDs by total penalties paid, and their amounts. Only includes suppliers with non-zero penalties.

**`getAggregateResourceQuantity(uint8 _resourceType)`** — view. Returns the sum of quantities across all suppliers for one resource type.

**`getSuppliersCountForResource(uint8 _resourceType)`** — view. Returns the count of suppliers that have the given resource registered.

---

## Events Reference

Every state change emits an event. Events are permanent, indexable, and consume no gas beyond the log write.

**`AdminChanged(address indexed oldAdmin, address indexed newAdmin)`**

Emitted when `setAdmin` succeeds. Both addresses are indexed, so you can filter by either.

**`AidFundAddressUpdated(address indexed newAddress)`**

Emitted when `setAidFundAddress` succeeds.

**`SupplierApplied(uint256 indexed supplierId, address indexed wallet, string name, SupplierType supplierType, uint256 timestamp)`**

Emitted on every `applyAsSupplier`. Includes the supplier's ID, the applicant wallet, the name, the type, and the timestamp.

**`SupplierApproved(uint256 indexed supplierId, address indexed wallet, uint256 timestamp)`**

Emitted when an approval happens, either individually or through `approveAllPending`.

**`SupplierRejected(uint256 indexed supplierId, address indexed wallet, uint256 refundedAmount, uint256 timestamp)`**

Emitted on rejection. Includes the refunded amount.

**`SupplierDeactivated(uint256 indexed supplierId, address indexed wallet, uint256 reputationLoss, uint256 timestamp)`**

Emitted when the admin deactivates a supplier. Includes the reputation loss that was applied.

**`SupplierReactivated(uint256 indexed supplierId, address indexed wallet, uint256 timestamp)`**

Emitted on reactivation after penalty payment.

**`ResourceRegistered(uint256 indexed supplierId, address indexed wallet, string resource, uint256 timestamp)`**

Emitted when a new resource is added.

**`ResourceUpdated(uint256 indexed supplierId, address indexed wallet, string resource, uint256 quantity, uint256 timestamp)`**

Emitted on every successful update. Includes the new quantity.

**`PenaltyPaid(uint256 indexed supplierId, address indexed wallet, uint256 amount, uint256 timestamp)`**

Emitted when a penalty payment succeeds.

**`EscrowDeposited(uint256 indexed supplierId, address indexed wallet, uint256 amount, uint256 releaseTime, uint256 timestamp)`**

Emitted alongside every penalty payment. Includes the timestamp when the escrow window will end.

**`EscrowReleased(uint256 indexed supplierId, address indexed wallet, uint256 amount, uint256 timestamp)`**

Emitted when escrow returns to the supplier.

**`EscrowForfeited(uint256 indexed supplierId, address indexed wallet, uint256 amount, address recipient, uint256 timestamp)`**

Emitted when escrow goes to the aid fund. Includes the recipient address.

**`ReputationChanged(uint256 indexed supplierId, address indexed wallet, uint256 oldScore, uint256 newScore, string reason, uint256 timestamp)`**

Emitted on every reputation change. The reason field is a human-readable string: "approval", "compliance_update", "deactivation", "late_penalty_payment". Useful for auditing why a score moved.

**`ContractPaused(address indexed by, uint256 timestamp)`** and **`ContractUnpaused(address indexed by, uint256 timestamp)`**

Emitted by the pause and unpause functions.

---

## Revert Reasons Reference

Every require statement in the contract, with the exact message and the situation that triggers it.

| Revert message | Triggered by | Meaning |
|----------------|--------------|---------|
| Only admin can call this | onlyAdmin modifier | Caller is not the admin |
| Contract is paused | whenNotPaused modifier | Contract is paused |
| Invalid resource type | validResource modifier | Resource type > 3 |
| Not owner of supplier | onlyOwnerOf modifier | Caller doesn't own the supplier |
| Invalid admin | setAdmin | New address is zero |
| Invalid address | setAidFundAddress | New address is zero |
| Already paused | pause | Contract already paused |
| Not paused | unpause | Contract not paused |
| Name required | applyAsSupplier | Empty name |
| Invalid type | applyAsSupplier | Supplier type > 8 |
| Incorrect registration fee | applyAsSupplier | msg.value is not exactly 100000 wei |
| Unknown supplier | Many functions | Supplier ID doesn't exist |
| Not pending | approveSupplier, rejectSupplier | Supplier isn't in Pending state |
| Refund failed | rejectSupplier | Ether transfer back to applicant failed |
| Supplier not active | registerResource, updateResourceQuantity | Supplier is not in Active state |
| Resource already registered | registerResource | Same resource type already exists for this supplier |
| Quantity must be > 0 | registerResource, updateResourceQuantity | Zero or negative quantity |
| Resource not registered | updateResourceQuantity | Trying to update a resource that was never registered |
| Compliance window expired | updateResourceQuantity | More than 24 hours since last update |
| Not active | checkAndDeactivate, performUpkeep | Supplier is not Active |
| Supplier still compliant | checkAndDeactivate, performUpkeep | No resources are expired |
| Still compliant | performUpkeep | Same as above |
| Not inactive | calculatePenalty, payPenaltyAndReactivate | Supplier is not Inactive |
| Incorrect penalty amount | payPenaltyAndReactivate | msg.value doesn't match calculated penalty |
| No escrow | releaseEscrow, forfeitEscrow | Escrow balance is zero |
| Period not elapsed | releaseEscrow | 30 days haven't passed |
| Period elapsed | forfeitEscrow | 30 days have passed (use release instead) |
| Active | forfeitEscrow | Supplier is Active (can't forfeit) |
| Refund failed | releaseEscrow | Ether transfer to supplier failed |
| Aid fund failed | forfeitEscrow | Ether transfer to aid fund failed |

---

## Frontend Walkthrough

The DApp is a single-page application built with plain HTML, CSS, and JavaScript. It uses Ethers.js to talk to the contract and Chart.js for analytics charts.

### Page structure

- **Header** — title, Connect MetaMask button, wallet address, role badge.
- **Admin dashboard** — shown when the connected wallet matches `getAdmin()`.
- **Supplier dashboard** — shown for every other wallet.
- **Global sections** — Statistics and Live Event Log, visible to both roles.

### Admin dashboard

Three tabs across the top:

**Overview tab.**

- System Overview: five summary cards (total approved, active, inactive, pending, rejected).
- Pending Approvals: table of pending suppliers with Approve and Reject buttons.
- Funds Collected: registration fees, penalties forfeited, escrow held, escrow refunded, total.
- Top Performers: top 10 by reputation.
- Frequent Defaulters: top 10 by penalties paid.
- Type Breakdown: count and percentage per supplier type.
- Aggregate Resources: suppliers and total quantity per resource.
- Emergency & Admin Controls: pause, unpause, set admin, set aid fund.

**Suppliers tab.**

Full table of every supplier with columns for ID, name, type, wallet, state, trust tier, reputation, updates, cycles, penalties paid, and action. Search by name, filter by type, filter by state. Each Active supplier has a Deactivate button.

**Analytics tab.**

Summary cards (total suppliers, active, avg reputation, default rate, total penalties paid). Four charts: registrations per day, penalties per day, reputation distribution, supplier types. Plus a leaderboard table sorted by penalties paid. Export CSV button.

### Supplier dashboard

Top to bottom:

- **Register New Supplier**: name input, type dropdown, Apply button.
- **My Suppliers**: table of every supplier owned by the connected wallet, with state and trust badges and a Select button.
- **Selected Supplier**: detail panel showing the currently selected supplier's full profile, including trust tier, compliance ratio, and predicted deactivation penalty.
- **Resource Management**: select a resource, enter a quantity, Register or Update.
- **Compliance Countdown**: shows time remaining for each registered resource.
- **Penalty**: calculate the current penalty or pay and reactivate.
- **Escrow**: show the current escrow status.
- **Reputation**: show the current score, tier, and trust level.
- **Time Simulation**: three buttons to fast-forward the blockchain clock (+25h, +3d, +10d).

### Role detection

On connect, the frontend calls `getAdmin()` and compares it to the connected wallet. If they match, the admin dashboard is shown. Otherwise, the supplier dashboard is shown. The header displays a badge — yellow for admin, blue for supplier — reflecting the current role.

### Contract address resolution

The frontend fetches `deployed-address.json` on page load with a cache-buster query string. When the deploy script runs, it rewrites that file with the new address. This means a redeploy is picked up on the next page load without any manual edit.

### Chain switching

If MetaMask is on the wrong chain, the DApp calls `wallet_switchEthereumChain` to prompt a switch to Hardhat Local (chain ID 31337). If the chain isn't yet added to MetaMask, the DApp calls `wallet_addEthereumChain` with the correct parameters. The user approves once and never has to touch the network dropdown again.

### Event log

The Live Event Log subscribes to every event from the contract via `rc.on(name, handler)`. As transactions confirm, events appear in the log with a timestamp. The log resets on page reload — it only shows events emitted after the page loaded. To see historical events, query the chain directly or use the analytics tab.

---

## Access Control Matrix

Which role can call which function.

| Function | Admin | Supplier (owner) | Anyone |
|----------|:-----:|:----------------:|:------:|
| applyAsSupplier | | ✓ | ✓ |
| approveSupplier | ✓ | | |
| approveAllPending | ✓ | | |
| rejectSupplier | ✓ | | |
| registerResource | | ✓ | |
| updateResourceQuantity | | ✓ | |
| checkAndDeactivate | ✓ | | |
| calculatePenalty | | | ✓ |
| payPenaltyAndReactivate | | ✓ | |
| releaseEscrow | | | ✓ |
| forfeitEscrow | | | ✓ |
| setAdmin | ✓ | | |
| setAidFundAddress | ✓ | | |
| pause / unpause | ✓ | | |
| All view functions | | | ✓ |

Note that `releaseEscrow` and `forfeitEscrow` are permissionless. They only send funds to the correct destination (supplier or aid fund) and only when the escrow state allows it. There's no incentive for an outside caller to invoke them maliciously, and there's no risk because the destination is fixed by the contract's rules.

---

## Security Notes

### Only the admin can deactivate

Deactivation is a heavy consequence. It stops the supplier from working and starts the penalty clock. If any wallet could call `checkAndDeactivate`, anyone could grief any supplier. So it's admin-only.

### The supplier pays their own penalty

`payPenaltyAndReactivate` requires `onlyOwnerOf`. Only the supplier's own wallet can pay. This is deliberate:

- The reputation penalty applies to the supplier.
- The escrow belongs to the supplier.
- The refund goes to the supplier.
- The supplier bears the cost of their own violation.

If the admin could pay, the supplier would get off scot-free while the admin's wallet lost money.

### Escrow is per-supplier

Each supplier has its own escrow balance, tracked in the `Supplier` struct. There's no shared pool. A supplier's escrow can only be released to that supplier or forfeited to the aid fund. It can never be diverted elsewhere.

### No admin escape hatch

The admin cannot:

- Withdraw registration fees (they stay in the contract).
- Withdraw escrow (it's locked until release or forfeit conditions are met).
- Move funds to an arbitrary address.
- Override a penalty calculation.

The only money flow the admin controls is the aid fund address — where forfeited escrow goes. Even then, they can't redirect funds that have already been forfeited.

### Pause is a brake, not a reset

Pausing freezes writes. It doesn't erase state, doesn't move funds, doesn't change any balances. Unpausing resumes exactly where the contract left off.

### Compromised wallets

If a supplier's wallet is compromised, the attacker can update quantities and pay penalties — that's all the owner could do anyway. The supplier can't be drained because there's nothing to drain. The worst case is the attacker manages the compliance and prevents deactivation.

If the admin's wallet is compromised, the attacker can approve, reject, deactivate, pause, change the aid fund, and hand off admin to themselves. This is why production systems use multi-signature wallets for the admin role.

### No reentrancy risk

The contract uses `.call{value: ...}` for outbound transfers, which is the recommended pattern, but there's no reentrancy vector because:

- Every outbound transfer happens after all state changes.
- The functions that send ether don't call back into the contract before returning.
- Balances are tracked in contract storage, not in the recipient's contract.

### Basis points, not floats

All ratio math uses basis-point integers (0 to 10000) instead of floating point. Solidity doesn't support floats, and mixing the two would cause rounding errors. Every multiplication and division is integer math.

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

The `viaIR: true` compiler option is enabled in `hardhat.config.js`. This routes the compilation through the Yul intermediate representation, which handles deeply nested code better than the standard pipeline. Without it, the contract fails to compile with a "Stack too deep" error because the `getSupplier` return tuple has 14 values.

---

## Prerequisites

- Node.js 18 or newer
- MetaMask browser extension
- Python 3 for serving the frontend, or `npx serve`

Verify:

```
node --version
npm --version
```

---

## Installation

Run once, after cloning:

```
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npm install
npx hardhat compile
```

`npm install` downloads Hardhat, Ethers.js, Chai, and all dependencies into `node_modules/`.

`npx hardhat compile` compiles the contract and produces the `artifacts/` folder.

Compilation takes 30 to 60 seconds because `viaIR` is enabled. That's normal.

---

## Running the Application

You need three terminals. Start them in this order.

### Terminal 1: Hardhat Node

```
Get-NetTCPConnection -LocalPort 8545 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npx hardhat node
```

Wait for "Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/" followed by 20 funded accounts.

Leave this window open. The blockchain lives here. Closing it wipes all state.

### Terminal 2: Deploy the Contract

Open a new PowerShell window:

```
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npx hardhat run scripts/deploy.js --network localhost
```

Expected output:

```
SupplierCompliance deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Wrote address to frontend/deployed-address.json
```

Close this window after it prints.

### Terminal 3: Frontend Server

Open a new PowerShell window:

```
Get-NetTCPConnection -LocalPort 4444 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance\frontend"
python -m http.server 4444
```

Expected output:

```
Serving HTTP on 0.0.0.0 port 4444 ...
```

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

   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```

4. Rename it to Hardhat Admin.
5. Import the second Hardhat test account using this private key:

   ```
   0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
   ```

6. Rename it to Hardhat Supplier.

Both accounts should show 10,000 ETH on Hardhat Local.

If MetaMask shows 0 ETH after switching to an account, clear its cache: Settings, Developer tools, Delete activity and nonce data. Then reopen MetaMask.

---

## Testing the Contract

```
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npx hardhat test
```

The test suite covers:

- Admin role: deployer becomes admin, reassignment, non-admin restrictions
- Application flow: apply with correct fee, wrong fee, empty name, invalid type, one wallet owning multiple suppliers
- Approval and rejection: individual approve, bulk approve, reject with refund, error cases
- Resource ops: register, invalid resource type, duplicate resource, zero quantity, non-owner restriction
- Quantity updates: within window, at boundary -1, at boundary +1, compliance refresh, expired window revert
- Deactivation: admin-only, requires expired resource, resets cycles, weighted reputation loss
- Penalty calculation: all four tiers, deterministic per-day results
- Reactivation: exact amount required, timers reset, reputation applied
- Escrow: deposit on payment, release after 30 days when Active, forfeit if re-deactivated inside window
- Aggregate views: getStats, getTypeCounts, getTopPerformers, getFrequentDefaulters, getSuppliersCountForResource

---

## Demonstrating the Full Lifecycle

Because the compliance period is one day and you don't want to wait 24 real hours, the DApp exposes a Time Simulation panel that fast-forwards the blockchain clock via `evm_increaseTime`.

### Setup

- Terminal 1: `npx hardhat node` running
- Terminal 2: `npx hardhat run scripts/deploy.js --network localhost` completed
- Terminal 3: `python -m http.server 4444` running
- Browser: `http://localhost:4444` open, MetaMask on Hardhat Local

### Supplier side

1. MetaMask, switch to Hardhat Supplier, reload the page. Blue SUPPLIER badge appears.
2. Register New Supplier: Name "Red Cross", Type NGO, click Apply (100,000 wei), confirm in MetaMask.
3. Wait for "Application submitted, status Pending admin approval".
4. Click Load My Suppliers. A new row appears with state Pending.

### Admin side

5. MetaMask, switch to Hardhat Admin, reload the page. Yellow ADMIN badge appears.
6. In Pending Approvals, click Approve on the row, confirm in MetaMask.
7. Overview tab shows 1 approved, 1 active.

### Supplier side again

8. MetaMask, switch to Hardhat Supplier, reload, Load My Suppliers, click Select.
9. Resource Water, Quantity 1000, click Register, confirm.
10. Quantity 2000, click Update, confirm. The compliance timer resets.

### Break compliance

11. Click +25h in Time Simulation. The blockchain clock advances 25 hours.
12. Click Load on Compliance Countdown. It shows EXPIRED.
13. Try to Update to 3000. It fails with "Compliance window expired". This is the contract enforcing the rule.

### Deactivate

14. MetaMask, switch to Hardhat Admin, reload, go to the Suppliers tab, find the row, click Deactivate, confirm.
15. The supplier's state changes to Inactive. Their reputation drops by a weighted amount.

### Pay penalty

16. MetaMask, switch to Hardhat Supplier, reload, Select the supplier.
17. Click Calculate in the Penalty panel. It shows 200,000 wei.
18. Click Pay and Reactivate, confirm in MetaMask.
19. The supplier is Active again. The escrow panel shows 200,000 wei held with a release date about 30 days out.
20. The reputation score drops further by the late-payment penalty if applicable.

### Check the analytics

21. MetaMask, switch to Hardhat Admin, reload, open the Analytics tab.
22. See the registrations chart, penalties chart, reputation distribution, supplier-type doughnut, and leaderboard.
23. Click Export CSV to download the supplier summary as a spreadsheet.

Screenshot each step for the submission.

---

## Escrow Lifecycle Demonstration

### Release (good outcome)

1. Get a supplier into escrow: deactivate, pay penalty, they're Active again.
2. Click +10d three times to advance 30 days.
3. Open the Hardhat console:

   ```
   npx hardhat console --network localhost
   ```

   ```
   const c = await ethers.getContractAt("SupplierCompliance", require("./frontend/deployed-address.json").address);
   await c.releaseEscrow(1);
   ```

4. In the admin dashboard, click Refresh. Funds Collected shows "Escrow refunded" increased.

### Forfeit (bad outcome)

1. Get a supplier into escrow.
2. Click +25h, then as admin deactivate them again.
3. In the console:

   ```
   await c.forfeitEscrow(1);
   ```

4. In the admin dashboard, click Refresh. "Penalties forfeited to aid fund" increased.

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
| Compliance window expired | Late update | Admin must deactivate, then supplier pays penalty |
| Supplier not active | Pending or Inactive supplier | Approve or reactivate first |
| MetaMask shows 0 ETH on Hardhat | Cache or wrong RPC | Settings, Developer tools, Delete activity and nonce data. Verify RPC is http://127.0.0.1:8545 |
| MetaMask on wrong chain | Default network | DApp auto-prompts to switch to chain 31337 |
| Charts not rendering | Chart.js CDN blocked | Replace CDN URL with a local copy of chart.umd.min.js |
| Contract address mismatch in browser | Cached JSON | Hard reload with Ctrl+Shift+R, or serve with a no-cache server |

To install ethers.min.js if missing:

```
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance\frontend"
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js" -OutFile "ethers.min.js"
```

---

## Persistent Local State

The Hardhat node is a development sandbox. Everything lives in memory. When you close the terminal, all suppliers, resources, escrows, and reputations are wiped. Next time you run `npx hardhat node`, you start from block 0.

Two ways to persist state across restarts:

### Option A: Ganache with a disk-backed database

```
npx ganache --server.port 8545 --chain.chainId 31337 --wallet.deterministic --database.dbPath ./.chain-data
```

On the first run, deploy once. On subsequent runs, the same command restores the previous state. Suppliers, resources, and escrows all come back. You only re-deploy if you delete `.chain-data/`.

### Option B: Deploy to Sepolia or a public testnet

Permanent state, verifiable event history. But `evm_increaseTime` doesn't work on public networks, so the compliance-window demo becomes real-time. For a coursework submission where you need to demonstrate time-based behaviour quickly, Ganache is the better choice.

If you don't need persistence, stick with the standard Hardhat node. Every fresh start is a clean slate.

---

## Glossary

**wei** — The smallest unit of Ether. 1 ETH = 10^18 wei. Used in this project for all money amounts so penalties are testable on a local chain without needing real currency.

**block.timestamp** — The Unix timestamp (seconds since 1970) of the current block. Used to implement compliance deadlines and penalty durations.

**msg.sender** — The address that called the current function. Used for access control and to identify the caller.

**msg.value** — The amount of wei sent with a payable function call. Used for registration fees and penalties.

**payable** — A Solidity function modifier that allows the function to receive Ether.

**modifier** — A reusable precondition check. This project has four: `onlyAdmin`, `onlyOwnerOf`, `whenNotPaused`, `validResource`.

**require** — A Solidity statement that reverts the transaction if its condition is false. Reverts are atomic — nothing changes.

**revert** — Abort the transaction. State changes are undone, gas is returned (except for the gas used up to the revert), and the caller sees an error message.

**event** — A structured log entry written to the blockchain. Events are not readable by contract code, but they are permanently stored and queryable by anything outside the chain.

**indexed** — A parameter attribute on events. Indexed parameters are stored in topics, which makes them filterable. You can query "all `SupplierApproved` events for supplier ID 5" only because `supplierId` is indexed.

**escrow** — Funds held by the contract on behalf of a supplier, released later under conditions.

**aid fund** — A configurable wallet address that receives forfeited escrow.

**reputation** — An integer from 0 to 200 that summarizes a supplier's behaviour over time.

**trust tier** — A categorical bucket (New, Developing, Trusted, Established) derived from the number of clean 30-day cycles a supplier has completed.

**compliance window** — The 24-hour period after each update, during which the supplier must perform the next update.

**deactivation** — Moving a supplier from Active to Inactive because at least one resource expired.

**reactivation** — Moving a supplier from Inactive back to Active after paying the penalty.

**ABI** — Application Binary Interface. A description of the contract's functions and events that Ethers.js uses to encode and decode calls.

**RPC** — Remote Procedure Call. The HTTP interface that MetaMask and Ethers.js use to talk to a node.

**nonce** — A per-account transaction counter. MetaMask assigns nonces automatically. If a transaction fails partway through, the nonce might need clearing via Developer tools.

**evm_increaseTime** — A Hardhat RPC method that advances the blockchain clock without waiting real time. Used in the Time Simulation panel.

**viaIR** — A Solidity compiler option that routes compilation through an intermediate representation. Needed here to avoid a stack-too-deep error on the 14-value `getSupplier` return.

**basis points** — One-hundredth of a percent. 10000 basis points = 100%. Used to represent ratios as integers.

**Chainlink Automation** — A service that runs `checkUpkeep` off-chain and calls `performUpkeep` on-chain when needed. Implemented in this contract for auto-deactivation.

---

## Submission Contents

The Moodle submission ZIP contains:

- contracts/SupplierCompliance.sol — the smart contract
- scripts/deploy.js — deployment script
- test/SupplierCompliance.test.js — unit tests
- frontend/index.html, frontend/app.js, frontend/styles.css, frontend/ethers.min.js — the DApp
- screenshots/ — every step of the demonstration captured
- Architecture_Report.docx — architecture, functionality, and business rules analysis
- hardhat.config.js, package.json, README.md

node_modules, artifacts, and cache are not included. Regenerate them with `npm install` and `npx hardhat compile`.

The submission email to the course address includes this ZIP and a subject line with the division and group identifier.

---

## License

MIT, free to use for educational purposes.

---

## Author

ARGHO DAS / Group 8
Introduction to Blockchain
7th October 2026