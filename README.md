# Blockchain-Based Supplier Registration, Resource Management, and Compliance System

A decentralized application for managing humanitarian resource suppliers on a local Ethereum-compatible blockchain. Suppliers apply to register, are approved by an admin, declare water, clothing, medicine, and food resources, and must update their quantities within a strict one-day compliance window. Non-compliant suppliers are deactivated and can only resume work after paying a duration-based penalty. Escrow, weighted reputation scoring, and an analytics dashboard reward consistent behaviour and expose bad actors.

Everything runs locally against a Hardhat node. No Sepolia, no Vercel, no external services. State is in-memory on the Hardhat node and is wiped on restart, by design. See Persistent Local State for details.

---

## Table of Contents

1. Deployed Contract
2. Overview
3. Roles
4. Data Model
5. Enums and Types
6. Design Rationale
7. Supplier Lifecycle
8. Resource Lifecycle
9. Compliance Mechanism
10. Penalty Mechanism
11. Reputation and Scoring
12. Escrow Mechanism
13. Analytics Layer
14. Admin Controls
15. Feature-by-Feature Walkthrough
16. Sequence Diagrams
17. Worked Numerical Examples
18. Smart Contract Function Reference
19. Events Reference
20. Revert Reasons Reference
21. Failure Mode Catalogue
22. Gas Cost Breakdown
23. Centralized System Comparison
24. Frontend Walkthrough
25. Access Control Matrix
26. Security Notes
27. Extensibility and Production Notes
28. Technology Stack
29. Installation and Running
30. MetaMask Setup
31. Testing Methodology
32. Demonstrating the Full Lifecycle
33. Escrow Lifecycle Demonstration
34. Troubleshooting
35. Persistent Local State
36. Glossary
37. Submission Contents
38. License

---

## 1. Deployed Contract

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

## 2. Overview

Traditional humanitarian resource management relies on centralized databases that are tamper-prone, opaque, and costly to enforce. This project replaces that with a self-executing smart contract. Every business rule is encoded in Solidity. Every state change is permanently recorded on the blockchain. Any stakeholder can independently verify the system without trusting a central authority.

The system has two roles: Admin (Compliance Officer) and Supplier. Both interact with the same deployed contract through a browser-based DApp. The admin manages the system. The supplier manages their resources and compliance obligations. The blockchain ensures that neither side can cheat.

Every action a user takes — applying, approving, updating a quantity, deactivating, paying a penalty — is a signed transaction that goes through the contract's business rules and emits an event. Events are permanent, indexable, and queryable. That's the audit trail.

---

## 3. Roles

### 3.1 Admin (Compliance Officer)

The admin is the wallet that deployed the contract. The role is transferable at any time via `setAdmin`. Only one admin exists at a time.

What the admin can do:

- Approve or reject pending supplier applications
- Deactivate non-compliant suppliers
- Pause and unpause the contract
- Change the aid fund address
- Transfer the admin role to another wallet
- View all suppliers, analytics, funds, and statistics

What the admin cannot do:

- Register as a supplier on behalf of someone else
- Pay penalties on behalf of a supplier
- Register resources on behalf of a supplier
- Update quantities on behalf of a supplier
- Seize escrow arbitrarily

### 3.2 Supplier

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
- Deactivate themselves
- Register a resource type outside the whitelist
- Update a resource after the 24-hour window has expired
- Reactivate without paying the exact penalty

---

## 4. Data Model

### 4.1 Supplier struct

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
| missedUpdates | Count of missed resources at deactivation | Increments by the number of expired resources |
| successfulCycles | Clean 30-day cycles completed | Increments on each `releaseEscrow`; resets to 0 on deactivation |
| totalPenaltiesPaid | Cumulative wei paid | Increments on each penalty payment |
| escrowAmount | Current escrow balance | Increases on payment; zeroed on release or forfeit |
| escrowStartTime | When current escrow began | Set on payment; zeroed on release or forfeit |
| registeredResources | Array of ResourceType | Appended when a new resource is registered |
| resources | Mapping from ResourceType to Resource | Populated on registration, modified on update |

### 4.2 Resource struct

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

### 4.3 Global state variables

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

### 4.4 Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| REGISTRATION_FEE | 100000 wei | Cost to apply |
| COMPLIANCE_PERIOD | 1 days (86400s) | Time between updates |
| PENALTY_RATE_LOW | 200000 wei | 0-1 day tier |
| PENALTY_RATE_MID | 400000 wei | 2-7 day tier |
| PENALTY_RATE_HIGH | 800000 wei | 8-21 day tier |
| PENALTY_RATE_MAX | 1000000 wei | 22+ day tier |
| ESCROW_PERIOD | 30 days | Hold window for penalties |
| REPUTATION_START | 100 | Score for a new supplier |
| REPUTATION_MAX | 200 | Score cap |
| REPUTATION_PENALTY_BASE | 20 | Base loss per deactivation |
| REPUTATION_PENALTY_CAP | 40 | Max loss per deactivation |
| REPUTATION_PROMPT_WINDOW | 1 hours | Fast-payment window |
| REPUTATION_PROMPT_RELIEF | 5 | Extra loss if paid late |
| TRUST_DEVELOPING | 3 | Cycles required for Developing |
| TRUST_TRUSTED | 8 | Cycles required for Trusted |
| TRUST_ESTABLISHED | 16 | Cycles required for Established |

---

## 5. Enums and Types

```solidity
enum ResourceType { Water, Clothing, Medicine, Food }
enum SupplierType { NGO, Vendor, Corporate, Individual, Government, Healthcare, Educational, Religious, Other }
enum SupplierState { Pending, Active, Inactive, Rejected }
enum TrustTier { New, Developing, Trusted, Established }
```

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
| Inactive | 2 | Deactivated for non-compliance |
| Rejected | 3 | Application denied; fee refunded |

TrustTier is derived from `successfulCycles` and not stored; it's computed on demand by `_trustTierOf`.

---

## 6. Design Rationale

Every non-obvious decision in the contract was made for a reason. This section explains them.

### 6.1 Why ID-based suppliers instead of address-based

The original design used `mapping(address => Supplier)`. One wallet, one supplier. Simple, but limiting — an aid organization might want to run multiple distinct supplier identities (e.g., a regional office and a national office) from the same wallet.

The current design uses `mapping(uint256 => Supplier)` plus a reverse index `mapping(address => uint256[]) ownedSupplierIds`. A wallet can now own any number of suppliers, and `getSupplierIdsOf(address)` returns the full list for that wallet.

The consequence: every supplier-scoped event carries both the numeric ID and the wallet address. The ID is the primary key. The address is a convenience index for filtering.

### 6.2 Why admin approval is required

The brief says "only wallet addresses that satisfy the registration conditions can become suppliers." The admin approval step is the enforcement mechanism for that. A pending applicant can pay the fee but cannot operate until the admin approves them. This mirrors real-world supplier vetting: an unvetted applicant is a compliance risk.

If you wanted to remove approval and let anyone register instantly, you'd simply drop the `state == Pending` check and auto-approve in `applyAsSupplier`. That's a one-line change. The current design chose the stricter path because it matches the humanitarian-compliance domain.

### 6.3 Why the compliance window is exactly 24 hours

The brief explicitly specifies a one-day compliance period. `COMPLIANCE_PERIOD = 1 days` in Solidity is shorthand for 86,400 seconds. Making it a constant rather than a configurable variable keeps the contract simple and makes the rule auditable — everyone can see it's exactly one day.

In production, you might want a configurable period so different jurisdictions can set different deadlines. That's noted in Extensibility.

### 6.4 Why deactivation is manual (admin-only)

The contract could have auto-deactivated suppliers from inside `updateResourceQuantity` — checking each resource on every block and flipping to Inactive the moment a deadline passes. That would be gas-expensive on reads and would trigger state changes on unrelated transactions.

Instead, the contract provides `checkAndDeactivate(id)`, which the admin calls when they want to enforce compliance. On a live network, Chainlink Automation's `checkUpkeep` / `performUpkeep` pair would run this automatically every block. On local Hardhat, the admin is the keeper.

This gives the admin explicit control and makes deactivation a deliberate act with a permanent record (the `SupplierDeactivated` event).

### 6.5 Why reputation is capped at 200

An unbounded reputation score has two problems: it can grow forever, making newcomers look permanently disadvantaged, and it can lose meaning as scores become very large. Capping at 200 creates a bounded scale where the highest plausible tier (Platinum) is achievable but not trivial.

The starting score is 100, so the range is asymmetric — 100 points up, 100 points down. A supplier who misbehaves can drop below 0 (clamped) in a single deactivation if they had no track record. A supplier who behaves well climbs slowly toward 200.

### 6.6 Why the penalty is a step function, not linear

The brief says `Penalty = Number of Non-compliant Days × Penalty Rate`, but then immediately gives a tier table (200k / 400k / 800k / 1M). A linear reading would produce different numbers at each intermediate day. The tier table is the concrete specification, and it's also the more realistic design — penalties that grow without bound for long-inactive suppliers would eventually exceed any sensible value.

The step function caps the maximum penalty at 1M wei regardless of how long the supplier is inactive. This is the more defensible engineering choice.

### 6.7 Why the penalty goes into escrow, not to the admin

If penalties went to the admin, they'd be indistinguishable from a fee, and the admin would have a direct financial incentive to deactivate suppliers. Escrow eliminates that incentive: the money is held by the contract, and it flows only to the supplier (on clean release) or to the aid fund (on repeat violation). The admin never touches it.

### 6.8 Why reputation loss is weighted

A flat penalty (always −20) treats two very different situations the same way: a first-time offender with no history and a veteran with a perfect record. The weighted penalty distinguishes them, which is how real compliance systems work — a long clean history earns leniency.

The formula `20 × (2 − ratio) × trustMultiplier` produces a range from 5 to 40, with a hard cap at 40. The asymmetry is deliberate: a supplier with no track record is judged harshly, because there's no evidence they can be trusted.

### 6.9 Why escrow is 30 days

The compliance window is 1 day. If escrow released immediately, a supplier could pay the penalty and immediately re-offend with no additional cost. A 30-day window is 30× the compliance window — long enough to catch a pattern of misbehaviour, short enough that a compliant supplier gets their money back within a reasonable time.

The exact duration is a policy choice. 7 days or 90 days would also be defensible. 30 days is a common security-deposit horizon.

### 6.10 Why basis points instead of percentages

Solidity has no native floating-point arithmetic. All ratio math has to use integer arithmetic. Basis points (parts per 10,000) give enough precision for the reputation formula while keeping everything representable as uint256. A ratio of 0.8 is stored internally as 8000.

### 6.11 Why events carry the wallet address

The original events only carried the supplier ID. That's sufficient for the contract itself, but it makes off-chain indexing awkward — a client that wants to filter events by wallet has to look up the ID first. Adding `address indexed wallet` as the second event parameter lets the client filter directly on the wallet.

---

## 7. Supplier Lifecycle

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

### 7.1 Apply

The supplier's wallet calls `applyAsSupplier(name, type)` and sends exactly 100,000 wei. The contract creates a new supplier record with `state = Pending`, sets `reputationScore = 100`, and appends the new ID to the wallet's owned list. The fee is held in the contract, not yet counted as revenue.

### 7.2 Approve or reject

The admin calls `approveSupplier(id)` or `rejectSupplier(id)`.

On approval: `state = Active`, `registered = true`, `approvalTimestamp = now`. The fee is added to `totalRegistrationFeesCollected`.

On rejection: `state = Rejected`, and the fee is refunded to the applicant's wallet.

### 7.3 Active

The supplier registers resources and updates them within the compliance window. If they succeed, they stay Active indefinitely.

### 7.4 Inactive

When the admin calls `checkAndDeactivate(id)` on a supplier whose resources have all expired, the contract sets `state = Inactive`, records the deactivation timestamp, increments `timesDeactivated`, resets `successfulCycles` to 0, and subtracts a weighted reputation loss. From this point, the supplier cannot register or update resources.

### 7.5 Reactivate

The supplier calls `payPenaltyAndReactivate(id)`, sending exactly the penalty owed. The contract verifies the amount, moves it into escrow, sets `state = Active`, resets every registered resource's `lastUpdated` to now, and applies any late-payment reputation penalty. The compliance timers all restart.

---

## 8. Resource Lifecycle

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
         │ updateResourceQuantity within 24h│ lastUpdated + 24h < now
         ▼                                  ▼
   refreshed compliant               ┌──────────────────┐
                                     │  Non-compliant   │
                                     │     (Expired)    │
                                     └────────┬─────────┘
                                              │ admin deactivates + reactivation
                                              ▼
                                       lastUpdated = now (Compliant again)
```

### 8.1 Registration

`registerResource(id, type, quantity)` writes a new Resource struct for the (supplier, type) pair and appends the type to the supplier's `registeredResources` array. The resource starts compliant with `lastUpdated = block.timestamp`.

### 8.2 On-time update

`updateResourceQuantity(id, type, quantity)` succeeds if the current time is within 24 hours of the resource's last update. It overwrites the quantity and refreshes `lastUpdated`. It also increments `compliantUpdates` and applies a trust-tier-scaled reputation reward.

### 8.3 Off-time update (rejected)

If more than 24 hours have passed, the same call reverts with `"Compliance window expired"`. The supplier cannot fix this on their own. Only the admin can deactivate, and only then can the supplier pay to reactivate.

### 8.4 Reactivation resets all timers

When the supplier pays the penalty, every registered resource's `lastUpdated` is set to the payment time. Every resource is compliant again. The supplier starts fresh.

---

## 9. Compliance Mechanism

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

The contract does not automatically deactivate anyone. It only marks resources as non-compliant inside `checkAndDeactivate`, and only when the admin explicitly calls that function on the supplier. This is a deliberate design choice — deactivation is a state-changing event with consequences (reputation loss, penalty accrual), and the admin should be the one to trigger it. In a production system, Chainlink Automation's `performUpkeep` would handle this.

`isResourceCompliant(id, type)` is a view function you can call any time to check the current state.

`remainingComplianceTime(id, type)` returns the seconds remaining, or 0 if expired.

---

## 10. Penalty Mechanism

The penalty is the amount of wei a deactivated supplier must pay to reactivate. It's calculated from the number of days the supplier has been inactive.

### 10.1 Tiers

| Days since deactivation | Penalty |
|-------------------------|---------|
| 0 to 1 | 200,000 wei |
| 2 to 7 | 400,000 wei |
| 8 to 21 | 800,000 wei |
| 22 or more | 1,000,000 wei |

Implemented as a pure function:

```solidity
function _penaltyForDays(uint256 _daysInactive) internal pure returns (uint256) {
    if (_daysInactive <= 1) return PENALTY_RATE_LOW;
    if (_daysInactive <= 7) return PENALTY_RATE_MID;
    if (_daysInactive <= 21) return PENALTY_RATE_HIGH;
    return PENALTY_RATE_MAX;
}
```

Because this is a pure function with no external state, the same input always produces the same output. Two suppliers deactivated for the same number of days owe exactly the same penalty, regardless of their history. That's the "deterministic penalty" requirement.

### 10.2 Payment

`payPenaltyAndReactivate(id)` requires `msg.value == penalty`. If the caller sends too much or too little, the transaction reverts with `"Incorrect penalty amount"`. The payment moves into escrow, and the supplier becomes Active again.

### 10.3 Late-payment penalty

If a supplier pays the penalty more than 1 hour after deactivation, they lose an extra 5 reputation points on top of the weighted deactivation loss. This is implemented as:

```solidity
uint256 lateRelief = (block.timestamp - s.deactivationTimestamp > REPUTATION_PROMPT_WINDOW)
    ? REPUTATION_PROMPT_RELIEF
    : 0;
```

The reasoning: a supplier who pays within an hour is showing urgency. One who waits is showing complacency.

---

## 11. Reputation and Scoring

Reputation is a 0-200 integer that tracks a supplier's behaviour over time. It starts at 100 and moves up or down with every significant action.

### 11.1 Two factors

**Compliance ratio.** The ratio of successful updates to total update attempts.

```
ratio = compliantUpdates / (compliantUpdates + missedUpdates)
```

A supplier who has never updated has ratio 0. A supplier with a perfect record has ratio 1.0. The ratio is expressed internally in basis points (0 to 10000).

**Trust tier.** Based on the number of successful 30-day cycles completed without a deactivation.

| Trust tier | successfulCycles | Multiplier |
|---|---|---|
| New | 0 to 2 | 1.5 |
| Developing | 3 to 7 | 1.0 |
| Trusted | 8 to 15 | 0.7 |
| Established | 16 or more | 0.5 |

`successfulCycles` increments each time the supplier completes a 30-day escrow window cleanly and calls `releaseEscrow`. It resets to 0 on every deactivation.

### 11.2 The penalty formula

When a supplier is deactivated:

```
loss = 20 * (2 - complianceRatio) * trustMultiplier
```

Capped at 40 points per deactivation.

Implemented in basis-point integer arithmetic:

```solidity
uint256 ratio = _complianceRatioBps(s);
uint256 trackMultiplierBps = 20000 - ratio;
uint256 trustMultiplierBps = /* 15000, 10000, 7000, 5000 */;

uint256 loss = (REPUTATION_PENALTY_BASE * trackMultiplierBps * trustMultiplierBps) / 100000000;
if (loss > REPUTATION_PENALTY_CAP) loss = REPUTATION_PENALTY_CAP;
if (loss == 0) loss = 1;
```

### 11.3 Worked examples

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

### 11.4 The reward system

On-time updates reward reputation on a trust-tier-scaled basis:

| Trust tier | Reward per compliant update |
|---|---|
| New | +1 |
| Developing | +2 |
| Trusted | +3 |
| Established | +5 |

The reward scales with trust. A supplier who has climbed to Trusted gains reputation faster than one at New, so good behaviour compounds. It also means that a long-tenured supplier can recover from a rare deactivation faster than a new one.

### 11.5 Reputation tier bands

| Tier | Score range |
|------|-------------|
| Platinum | 180 to 200 |
| Gold | 150 to 179 |
| Silver | 120 to 149 |
| Bronze | 80 to 119 |
| Probation | 0 to 79 |

These are for display. `getReputationTier(id)` returns the tier name as a string.

---

## 12. Escrow Mechanism

Escrow is a 30-day holding period applied to every penalty payment.

### 12.1 Why escrow exists

A plain penalty is paid once and forgotten. A supplier who misbehaves repeatedly can treat each penalty as a small cost of doing business. Escrow changes the incentive structure: the penalty becomes a security deposit that's refunded only if the supplier behaves. If they misbehave again inside the 30-day window, the deposit is forfeited to the aid fund.

### 12.2 The lifecycle

**Payment.** Supplier pays penalty. Contract moves the wei into `escrowAmount` and sets `escrowStartTime = now`.

**Hold.** For 30 days, the wei sits in escrow. Both `releasable` and `forfeitEligible` are false.

**End-of-window resolution.**

Path A — Release. If 30 days have elapsed and the supplier is still Active, anyone can call `releaseEscrow(id)`. The full amount goes back to the supplier's wallet, `successfulCycles` increments by 1, and the escrow balance zeroes out.

Path B — Forfeit. If the supplier is deactivated again inside the 30-day window, `forfeitEligible` flips to true. Anyone can call `forfeitEscrow(id)`. The full amount goes to the aid fund, and `totalPenaltiesCollected` increments.

### 12.3 The escrow state machine

```
Empty ──pay penalty──▶ Held ──30 days + Active──▶ Refunded
                        │
                        └──deactivated again──▶ Forfeited
```

Once escrow reaches Refunded or Forfeited, it returns to Empty. A new penalty payment starts the cycle again.

### 12.4 Querying escrow

`getEscrowInfo(id)` returns four values:

- `balance` — current escrow balance in wei
- `releaseTime` — the timestamp when the window elapses
- `releasable` — true if the window has passed and the supplier is Active
- `forfeitEligible` — true if the window has not passed and the supplier is not Active

### 12.5 Why it's not a fine

A fine is money spent. Escrow is money at risk. The two create different behaviours. A supplier who has 200,000 wei sitting in escrow has a real reason to stay compliant for 30 days. A supplier who has paid a fine has no such pressure.

---

## 13. Analytics Layer

The admin's Analytics tab is computed entirely in the browser from on-chain events. The contract has no notion of charts or histograms.

### 13.1 How it works

When the admin opens the Analytics tab, the frontend:

1. Calls `queryFilter` for each event type, from block 0 to the latest block.
2. Fetches the block timestamp for each unique block that emitted an event.
3. Sorts all events by block number.
4. Aggregates them into per-supplier and per-day buckets.
5. Renders the results in tables and Chart.js charts.

Because everything is derived from events, the analytics are always consistent with the on-chain state.

### 13.2 What the analytics tab shows

**Summary cards.** Total suppliers, active suppliers, average reputation, default rate, total penalties paid.

**Registrations chart.** Line chart of `SupplierApplied` events per day over the last 30 days.

**Penalties chart.** Bar chart of `PenaltyPaid` event amounts per day over the last 30 days.

**Reputation distribution.** Bar chart of suppliers in each reputation tier.

**Supplier types.** Doughnut chart showing the count of each supplier type.

**Leaderboard.** Table of up to 20 suppliers sorted by total penalties paid.

**Export CSV.** Downloads a spreadsheet with one row per supplier.

### 13.3 Why browser-side and not on-chain

Aggregating on-chain would mean storing sums, counts, and histograms in contract storage, which costs gas on every write and is inflexible. Browser-side analytics means you can change what you display without redeploying the contract. The trade-off is that very large numbers of events would slow the page load. For a demo with hundreds of events, it's instant.

---

## 14. Admin Controls

The Emergency & Admin Controls panel gives the admin four capabilities beyond the day-to-day approval workflow.

### 14.1 Pause / Unpause

`pause()` sets a boolean flag. Every state-changing function checks the flag through the `whenNotPaused` modifier. When paused, these functions revert with `"Contract is paused"`:

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

`unpause()` reverses the flag.

### 14.2 Set Admin

`setAdmin(newAdmin)` transfers the admin role. The old admin loses privileges immediately. The new admin gains them immediately. There's no delay, no confirmation step.

Note that a compromised admin wallet can hand the role to an attacker. There is no multi-signature or time-delay mechanism in this contract. In production, the admin role would typically be held by a multi-sig contract.

### 14.3 Set Aid Fund

`setAidFundAddress(newAddress)` changes where forfeited escrow is sent. The current address continues to hold any escrow that was already forfeited to it in the past. This function only affects future forfeitures.

### 14.4 Check Pause Status

A view-only button that calls `paused()` and displays the current state.

## 15. Feature-by-Feature Walkthrough

Every user-facing feature in the system, with what it does, how it works, what can go wrong, and how to verify it.

### 15.1 Supplier Registration

**Purpose.** Allow a wallet to apply to become a supplier by paying a fixed fee.

**Implementation.** `applyAsSupplier(string _name, uint8 _type) payable returns (uint256)`

**What it does, step by step.**
1. Checks the contract is not paused (`whenNotPaused`).
2. Requires name is non-empty.
3. Requires `_type <= 8` (one of nine valid types).
4. Requires `msg.value == 100000 wei`.
5. Increments `nextSupplierId` and creates a new `Supplier` record with `state = Pending`.
6. Sets `registrationTimestamp = block.timestamp`, `reputationScore = 100`.
7. Appends the new ID to `ownedSupplierIds[msg.sender]`.
8. Increments `totalPendingSuppliers`.
9. Emits `SupplierApplied`.

**State touched.** `suppliers`, `nextSupplierId`, `ownedSupplierIds`, `totalPendingSuppliers`.

**What can go wrong.**
- Sending the wrong fee reverts with `"Incorrect registration fee"`.
- Empty name reverts with `"Name required"`.
- Invalid type reverts with `"Invalid type"`.
- Calling while paused reverts with `"Contract is paused"`.

**How to verify.** After applying, call `getSupplierIdsOf(wallet)` — the new ID appears. Call `getSupplier(id)` — state is 0 (Pending), reputation is 100.

**Why it's designed this way.** The fee creates a small cost of entry that deters spam registrations. The Pending state allows the admin to vet applicants before they can operate.

### 15.2 Multi-Supplier Ownership

**Purpose.** Allow one wallet to own and manage many supplier identities.

**Implementation.** `ownedSupplierIds` reverse index plus `getSupplierIdsOf(address)` and `getMySupplierIds()` views.

**What it does, step by step.**
1. Every `applyAsSupplier` call from the same wallet appends a new ID to that wallet's array.
2. The array grows without bound.
3. `getSupplierIdsOf(wallet)` returns the full array.
4. The frontend uses this to populate the "My Suppliers" table.

**Why it exists.** A single organization might run several distinct supplier identities. The old one-wallet-one-supplier design forced them to use multiple wallets, which is awkward. The new design lets one wallet manage a portfolio.

**How to verify.** Apply as three different suppliers from the same wallet. `getSupplierIdsOf` returns an array of length 3. Each ID has its own name, type, resources, reputation, and escrow.

### 15.3 Admin Approval

**Purpose.** Gate access — only approved suppliers can operate.

**Implementation.** `approveSupplier(uint256 _supplierId)` and `approveAllPending()`.

**What it does, step by step.**
1. Requires caller is admin (`onlyAdmin`).
2. Requires contract is not paused.
3. Requires supplier exists and is Pending.
4. Sets `state = Active`, `registered = true`, `approvalTimestamp = now`.
5. Decrements `totalPendingSuppliers`, increments `totalRegisteredSuppliers`.
6. Adds the registration fee to `totalRegistrationFeesCollected`.
7. Emits `SupplierApproved` and `ReputationChanged` (0 to 100).

**Bulk variant.** `approveAllPending()` iterates over all suppliers and approves those in Pending state. Useful for demo setup where you want ten suppliers activated in one transaction.

**What can go wrong.**
- Non-admin caller reverts with `"Only admin can call this"`.
- Approving a non-pending supplier reverts with `"Not pending"`.
- Approving a non-existent ID reverts with `"Unknown supplier"`.

**How to verify.** After approval, `getSupplier(id)` shows state 1 (Active).

### 15.4 Rejection with Refund

**Purpose.** Allow the admin to deny an application and return the fee.

**Implementation.** `rejectSupplier(uint256 _supplierId)`.

**What it does, step by step.**
1. Admin-only check.
2. Requires supplier is Pending.
3. Sets `state = Rejected`.
4. Decrements `totalPendingSuppliers`, increments `totalRejectedSuppliers`.
5. Transfers 100,000 wei back to the applicant's wallet via `.call`.
6. Emits `SupplierRejected`.

**Why the refund matters.** A rejected applicant shouldn't lose their money — the application cost is a vetting deposit, not a purchase. Rejecting without refund would be theft.

**What can go wrong.** If the `.call` fails (e.g., the applicant is a contract that rejects ETH), the whole transaction reverts. The admin would need to use a different applicant wallet or a contract that accepts refunds.

### 15.5 Resource Registration

**Purpose.** Let a supplier declare one of four predefined resource types.

**Implementation.** `registerResource(uint256 _supplierId, uint8 _resourceType, uint256 _quantity)`.

**What it does, step by step.**
1. Requires caller owns the supplier (`onlyOwnerOf`).
2. Requires resource type is valid (`validResource`).
3. Requires contract is not paused.
4. Requires supplier is Active.
5. Requires the resource isn't already registered for this supplier.
6. Requires quantity > 0.
7. Writes a new `Resource` struct with `lastUpdated = now`, `compliant = true`.
8. Appends the resource type to the supplier's `registeredResources` array.
9. Emits `ResourceRegistered`.

**Why only four types.** The brief specifies a fixed set. Arbitrary resource names would make aggregate statistics meaningless. The whitelist is enforced by the `validResource` modifier.

**What can go wrong.**
- Non-owner caller reverts with `"Not owner of supplier"`.
- Invalid resource type reverts with `"Invalid resource type"`.
- Duplicate registration reverts with `"Resource already registered"`.
- Zero quantity reverts with `"Quantity must be > 0"`.
- Pending or Inactive supplier reverts with `"Supplier not active"`.

**How to verify.** After registration, `getSupplierResourceQuantity(id, type)` returns the quantity, and `remainingComplianceTime(id, type)` returns ~86400.

### 15.6 Quantity Update with Compliance Refresh

**Purpose.** Let a supplier report a new quantity and refresh their compliance timer.

**Implementation.** `updateResourceQuantity(uint256 _supplierId, uint8 _resourceType, uint256 _quantity)`.

**What it does, step by step.**
1. Requires ownership and valid type and not paused.
2. Requires supplier is Active.
3. Requires the resource is registered.
4. Requires quantity > 0.
5. Requires the compliance window is not expired.
6. Overwrites quantity, sets `lastUpdated = now`, sets `compliant = true`.
7. Increments `compliantUpdates`.
8. Applies a trust-tier-scaled reputation reward.
9. Emits `ResourceUpdated` and possibly `ReputationChanged`.

**The reward schedule.**

| Trust tier | Reward |
|---|---|
| New | +1 |
| Developing | +2 |
| Trusted | +3 |
| Established | +5 |

**What can go wrong.**
- If the compliance window has expired, reverts with `"Compliance window expired"`. This is the core enforcement mechanism.

**How to verify.** After update, `remainingComplianceTime` resets to ~86400, and the reputation score moves up by the tier reward.

### 15.7 Compliance Window Enforcement

**Purpose.** Ensure resources are updated every 24 hours.

**Implementation.** `require(block.timestamp - s.resources[rType].lastUpdated <= COMPLIANCE_PERIOD)`.

**How it works.** The contract stores `lastUpdated` per resource. On every update, it checks that the elapsed time is at most 86,400 seconds. If more, the call reverts.

**The compliance period is not a countdown.** It's a comparison. The check happens on the update call. There is no background process ticking away at midnight. The window "expires" the moment `block.timestamp - lastUpdated > 86400`.

**What can go wrong.** No way for a supplier to heal themselves once the window has expired. The only path is admin deactivation followed by penalty payment.

**How to verify.** Register a resource, advance time by 86,401 seconds via `evm_increaseTime`, try to update, see the revert.

### 15.8 Non-Compliance Detection

**Purpose.** Identify which resources have expired.

**Implementation.** `checkAndDeactivate(uint256 _supplierId)` iterates the supplier's `registeredResources` array and flags expired ones.

**What it does, step by step.**
1. Admin-only and not-paused checks.
2. Requires supplier is Active.
3. Loops over each registered resource.
4. For each resource where `block.timestamp - lastUpdated > COMPLIANCE_PERIOD`, sets `compliant = false` and increments a local `missed` counter.
5. Requires `missed > 0`. If all resources are still compliant, reverts with `"Supplier still compliant"`.
6. Increments the supplier's `missedUpdates` by `missed`.
7. Computes the weighted reputation loss.
8. Sets `state = Inactive`, records `deactivationTimestamp`, increments `timesDeactivated`, resets `successfulCycles = 0`.
9. Emits `SupplierDeactivated` and `ReputationChanged`.

**What can go wrong.**
- Calling on a compliant supplier reverts with `"Supplier still compliant"`.
- Calling on a non-active supplier reverts with `"Not active"`.

**How to verify.** `getSupplier(id)` shows state 2 (Inactive) after a successful call.

### 15.9 Deactivation

**Purpose.** Freeze a non-compliant supplier.

**Implementation.** Handled inside `checkAndDeactivate` and `performUpkeep`.

**What happens to the supplier's state.**
- `state = Inactive`
- `deactivationTimestamp = now`
- `timesDeactivated` increments by 1
- `successfulCycles = 0`
- Reputation drops by the weighted loss

**What they can still do.** Read functions, and `payPenaltyAndReactivate` — that's it.

**What they cannot do.** Register resources, update quantities, apply for a new supplier (they can, actually — that's separate).

**The penalty clock starts.** From this moment, the number of days they stay inactive determines the penalty tier when they eventually pay.

### 15.10 Duration-Based Penalty Calculation

**Purpose.** Determine how much a deactivated supplier owes to reactivate.

**Implementation.** `_penaltyForDays(uint256 _daysInactive)` — a pure internal function — plus the public view `calculatePenalty(uint256 _supplierId)`.

**The four tiers.**

| Days | Tier | Penalty |
|---|---|---|
| 0-1 | Low | 200,000 wei |
| 2-7 | Mid | 400,000 wei |
| 8-21 | High | 800,000 wei |
| 22+ | Max | 1,000,000 wei |

**Why a pure function.** Because the same input always gives the same output, the penalty is deterministic. Two suppliers deactivated for the same number of days owe the same amount. This is important for fairness and for verification.

**How to verify.** Deactivate a supplier, call `calculatePenalty(id)`, see 200,000. Advance time by 3 days, call again, see 400,000.

### 15.11 Penalty Payment and Reactivation

**Purpose.** Let a deactivated supplier pay what they owe and get reactivated.

**Implementation.** `payPenaltyAndReactivate(uint256 _supplierId) payable`.

**What it does, step by step.**
1. Requires ownership.
2. Requires contract is not paused.
3. Requires supplier is Inactive.
4. Computes days inactive and the penalty.
5. Requires `msg.value == penalty`.
6. Records the days in `lastDeactivationDays`.
7. If the payment is more than 1 hour late, applies an extra 5-point reputation penalty.
8. Adds `msg.value` to `escrowAmount` and sets `escrowStartTime = now`.
9. Adds `msg.value` to `totalEscrowHeld` and `totalPenaltiesPaid`.
10. Sets `state = Active`.
11. Resets `lastUpdated = now` for every registered resource.
12. Emits `PenaltyPaid`, `EscrowDeposited`, `SupplierReactivated`, and possibly `ReputationChanged`.

**What can go wrong.**
- Sending the wrong amount reverts with `"Incorrect penalty amount"`.
- Calling from the wrong wallet reverts with `"Not owner of supplier"`.

**How to verify.** After payment, `getSupplier(id)` shows state 1 (Active), and `getEscrowInfo(id)` shows a non-zero balance with a release time ~30 days out.

### 15.12 Escrow Release

**Purpose.** Return escrow funds to a supplier who stayed clean for 30 days.

**Implementation.** `releaseEscrow(uint256 _supplierId)`.

**What it does, step by step.**
1. Requires supplier exists.
2. Requires escrow balance > 0.
3. Requires 30 days elapsed since `escrowStartTime`.
4. Requires supplier is Active.
5. Zeroes the escrow balance.
6. Decrements `totalEscrowHeld`, increments `totalEscrowRefunded`.
7. Increments `successfulCycles`.
8. Transfers the amount to the supplier's wallet.
9. Emits `EscrowReleased`.

**Why `successfulCycles` increments here.** A clean 30-day window means the supplier proved they could behave. That earns one step up the trust ladder. After 16 such cycles, the supplier reaches Established tier, and their penalties become much lighter.

**What can go wrong.**
- Releasing too early reverts with `"Period not elapsed"`.
- Releasing while inactive reverts with `"Not active"`.
- Releasing with no escrow reverts with `"No escrow"`.

**How to verify.** After release, `getEscrowInfo(id)` shows balance 0, and `getTrustTier(id)` may have moved up.

### 15.13 Escrow Forfeiture

**Purpose.** Send escrow funds to the aid fund when the supplier re-offends inside the window.

**Implementation.** `forfeitEscrow(uint256 _supplierId)`.

**What it does, step by step.**
1. Requires escrow balance > 0.
2. Requires 30 days NOT yet elapsed.
3. Requires supplier is not Active.
4. Zeroes the escrow balance.
5. Decrements `totalEscrowHeld`, increments `totalPenaltiesCollected`.
6. Transfers the amount to `aidFundAddress`.
7. Emits `EscrowForfeited`.

**Why anyone can call it.** The destination is fixed by contract logic (the aid fund). There's no incentive to call maliciously, and no risk — you can't redirect the funds to yourself. Making it permissionless means it can be triggered by any observer.

**What can go wrong.**
- Forfeiting after the window reverts with `"Period elapsed"`.
- Forfeiting while active reverts with `"Active"`.

**How to verify.** After forfeit, `getEscrowInfo(id)` shows 0, and the admin dashboard shows an increased "Penalties forfeited to aid fund" total.

### 15.14 Reputation Changes

**Purpose.** Track supplier behaviour over time.

**Implementation.** Every path that changes reputation.

| Path | Change |
|---|---|
| Approval | Set to 100 |
| On-time update | +1 to +5 (scaled by trust tier) |
| Deactivation | −5 to −40 (weighted) |
| Late penalty payment | −5 additional |

**Why a range.** A flat +1 or −20 didn't differentiate suppliers. The current design makes the score meaningful: a clean supplier climbs, a chronic defaulter sinks.

**How to verify.** `getSupplier(id)[5]` returns the current score. The frontend shows it in the Selected Supplier panel with the tier label.

### 15.15 Trust Tier Advancement

**Purpose.** Reward long-term good behaviour with progressively lighter penalties.

**Implementation.** `_trustTierOf(Supplier storage s)` returns one of four tiers based on `successfulCycles`.

**How cycles accumulate.** `successfulCycles++` inside `releaseEscrow`. The supplier must complete a full 30-day window cleanly and call release to earn a cycle.

**How cycles reset.** Any deactivation sets `successfulCycles = 0`. The ladder restarts from zero.

**The four tiers.**

| Tier | Cycles | Effect |
|---|---|---|
| New | 0-2 | Full penalty weight (multiplier 1.5) |
| Developing | 3-7 | Normal weight (1.0) |
| Trusted | 8-15 | Reduced weight (0.7) |
| Established | 16+ | Minimum weight (0.5) |

**How to verify.** `getTrustTier(id)` returns 0, 1, 2, or 3. The admin table shows the tier as a coloured chip.

### 15.16 Time-Scaled Rewards

**Purpose.** Make good behaviour compound.

**Implementation.** The reward per on-time update scales with trust tier:

```
if tier == 0: reward = 1
if tier == 1: reward = 2
if tier == 2: reward = 3
if tier == 3: reward = 5
```

**Why it matters.** A long-tenured reliable supplier climbs reputation faster than a new one doing the same work. Over a year, the difference is significant. That's how the system creates a spread across the reputation tiers rather than clustering everyone in a narrow band.

**How to verify.** Two suppliers doing 20 updates each — one at New tier, one at Trusted tier — end up with very different scores.

### 15.17 Emergency Pause

**Purpose.** Stop all writes in an emergency without losing state.

**Implementation.** `pause()` sets `paused = true`. The `whenNotPaused` modifier blocks every state-changing function.

**What stays working.** All view functions. The frontend can still display data. The event log still receives events (though no new ones will fire).

**What stops working.** Every transaction that changes state: apply, approve, reject, register, update, deactivate, pay, upkeep.

**How to verify.** Pause, try to apply as a new supplier, see the revert `"Contract is paused"`. Unpause, try again, succeed.

### 15.18 Admin Transfer

**Purpose.** Allow the admin role to move between wallets.

**Implementation.** `setAdmin(address _newAdmin)`.

**What happens.** Immediate change. The old admin loses privileges in the same transaction. The new admin gains them.

**Why no delay.** The brief doesn't require one. Adding a multi-step handoff would complicate the demo. In production, this would typically be a multi-sig contract.

**How to verify.** After `setAdmin`, `getAdmin()` returns the new address, and calls from the old wallet revert with `"Only admin can call this"`.

### 15.19 Aid Fund Reassignment

**Purpose.** Change where forfeited escrow goes.

**Implementation.** `setAidFundAddress(address _newAddress)`.

**What happens.** All future forfeitures go to the new address. Past forfeitures already sent to the old address are unaffected — those funds have left the contract.

**How to verify.** Change the address, then trigger a forfeit, then check balances. The new address gains the amount; the old address doesn't.

### 15.20 Time Simulation

**Purpose.** Fast-forward the blockchain clock so the 24-hour compliance window and the 30-day escrow window can be demonstrated in seconds.

**Implementation.** Frontend-only. Calls `evm_increaseTime(seconds)` and `evm_mine()` twice via the Hardhat RPC.

**What it does.** Advances `block.timestamp` by the given number of seconds. Mining twice ensures the next block picks up the new timestamp and any subsequent view reads see the advanced time.

**Why two mines.** A single `evm_increaseTime` only affects future blocks. A view call reads the *current* block's timestamp. Mining twice guarantees a fresh block with the advanced time.

**What it doesn't do.** It doesn't affect real wall-clock time, doesn't affect other users, doesn't survive a node restart. It's a local dev tool.

**How to verify.** Click +25h, reload the countdown, see EXPIRED.

### 15.21 Event-Driven Audit Trail

**Purpose.** Permanent, indexable record of everything that happened.

**Implementation.** 16 events across all state changes.

**Why events are the source of truth.** Contract storage tells you the *current* state. Events tell you the *history* — what happened, when, to whom. That history is what analytics, dashboards, and audits are built on.

**Querying events.** `provider.queryFilter(name, fromBlock, toBlock)`. Or `contract.on(name, callback)` for live streaming.

**How the frontend uses them.** The Live Event Log streams new events. The Analytics tab aggregates past events into charts.

### 15.22 Analytics Aggregation

**Purpose.** Turn raw event data into visual insight for the admin.

**Implementation.** `loadAllEvents()` and `computeMetrics()` in `app.js`.

**What's aggregated.**
- Per-supplier totals: penalties paid, deactivations, updates, reputation
- Per-day buckets: registrations, penalties, deactivations
- Distribution histograms: reputation tiers, supplier types
- Leaderboards: top by penalties, top by reputation

**Why client-side.** No gas cost, flexible, easy to change without redeploying.

### 15.23 CSV Export

**Purpose.** Let the admin pull the supplier table into a spreadsheet.

**Implementation.** `exportAnalyticsCSV()` in `app.js`.

**Columns.** id, name, type, reputation, tier, deactivations, reactivations, penaltiesPaid, resourceUpdates, resourcesRegistered, appliedAt, approvedAt.

**Format.** RFC 4180 CSV. Downloadable as `supplier-analytics-YYYY-MM-DD.csv`.

### 15.24 Chainlink Automation Hooks

**Purpose.** Enable automated deactivation on a live network.

**Implementation.** `checkUpkeep` and `performUpkeep`.

**How it would work in production.** A Chainlink keeper node calls `checkUpkeep` off-chain every few seconds. If it returns true, the keeper calls `performUpkeep` with the encoded data. The contract deactivates the offending supplier automatically.

**What happens locally.** The hooks exist but nothing calls them. The admin plays the role of the keeper by clicking "Deactivate" manually.

---

## 16. Sequence Diagrams

Text-based sequence diagrams for the three main flows.

### 16.1 Registration and Approval

```
Supplier Wallet         MetaMask         Contract            Admin Wallet
      │                     │                │                    │
      │  Fill form          │                │                    │
      │────────────────────▶│                │                    │
      │                     │                │                    │
      │                     │ applyAsSupplier(name, type)         │
      │                     │ + 100000 wei                        │
      │                     │───────────────▶│                    │
      │                     │                │                    │
      │                     │                │ create Supplier    │
      │                     │                │ state = Pending    │
      │                     │                │ emit Applied       │
      │                     │◀───────────────│                    │
      │◀────────────────────│                │                    │
      │                     │                │                    │
      │                     │                │       Load pending │
      │                     │                │◀───────────────────│
      │                     │                │                    │
      │                     │                │   approveSupplier  │
      │                     │                │◀───────────────────│
      │                     │                │                    │
      │                     │                │ state = Active     │
      │                     │                │ emit Approved      │
      │                     │                │───────────────────▶│
      │                     │                │                    │
```

### 16.2 Compliance Lifecycle

```
Supplier                Contract                Admin
   │                       │                      │
   │ registerResource      │                      │
   │──────────────────────▶│                      │
   │                       │ lastUpdated = now    │
   │                       │                      │
   │ updateResource        │                      │
   │──────────────────────▶│                      │
   │                       │ refresh lastUpdated  │
   │                       │ +reputation          │
   │                       │                      │
   │                       │   [24 hours pass]    │
   │                       │                      │
   │ updateResource        │                      │
   │──────────────────────▶│                      │
   │◀──────────────────────│ revert               │
   │                       │                      │
   │                       │   checkAndDeactivate │
   │                       │◀─────────────────────│
   │                       │ state = Inactive     │
   │                       │ -reputation (weighted)│
   │                       │ emit Deactivated     │
   │                       │─────────────────────▶│
   │                       │                      │
   │ calculatePenalty      │                      │
   │──────────────────────▶│                      │
   │◀──────────────────────│ 200000 wei           │
   │                       │                      │
   │ payPenaltyAndReactivate                      │
   │──────────────────────▶│                      │
   │                       │ state = Active       │
   │                       │ escrowAmount += 200k │
   │                       │ reset timers         │
   │                       │ emit Reactivated     │
   │◀──────────────────────│                      │
```

### 16.3 Escrow Resolution

```
                     Contract
                        │
              [200000 wei in escrow]
                        │
                        │
        ┌───────────────┴───────────────┐
        │                               │
   30 days pass                   deactivated again
   AND supplier active            inside window
        │                               │
        ▼                               ▼
  releaseEscrow                   forfeitEscrow
        │                               │
        │                               │
        ▼                               ▼
  funds → supplier                funds → aid fund
  successfulCycles++              totalPenaltiesCollected++
  emit EscrowReleased             emit EscrowForfeited
```

---

## 17. Worked Numerical Examples

Two long-form examples showing exact numbers at every step.

### 17.1 Example A — Full lifecycle of a single supplier

**Setup.** Supplier Alice applies with the name "Red Cross" and type NGO.

**Step 1 — Apply.**
- Alice pays 100,000 wei.
- `state = Pending`, `reputationScore = 100`, `compliantUpdates = 0`, `missedUpdates = 0`, `successfulCycles = 0`, `timesDeactivated = 0`.

**Step 2 — Admin approves.**
- `state = Active`, `approvalTimestamp = now`.
- Reputation unchanged at 100.

**Step 3 — Alice registers Water, quantity 1000.**
- New Resource: quantity 1000, lastUpdated = now, compliant = true.
- `registeredResources = [Water]`.
- Reputation still 100.

**Step 4 — Alice updates Water to 1500 (within 24h).**
- `compliantUpdates = 1`.
- Trust tier is New (0 cycles), so reward = 1.
- `reputationScore = 101`.

**Step 5 — Alice updates Water to 2000 (within 24h).**
- `compliantUpdates = 2`.
- Reward = 1 (still New tier).
- `reputationScore = 102`.

**Step 6 — Alice updates Water to 2500 (within 24h).**
- `compliantUpdates = 3`.
- Reward = 1.
- `reputationScore = 103`.

**Step 7 — Alice misses the next deadline. 25 hours pass.**
- Admin calls `checkAndDeactivate(1)`.
- `missedUpdates = 1`.
- Compliance ratio = 3 / (3+1) = 0.75 → 7500 basis points.
- Trust tier = New → trustMultiplierBps = 15000.
- trackMultiplierBps = 20000 − 7500 = 12500.
- Loss = 20 × 12500 × 15000 / 100,000,000 = 37.5 → 37.
- `reputationScore = 103 − 37 = 66`.
- `state = Inactive`, `successfulCycles = 0`, `timesDeactivated = 1`.

**Step 8 — Alice computes the penalty immediately.**
- Days inactive = 0.
- `calculatePenalty` returns 200,000 wei.

**Step 9 — Alice waits 2 days, then pays.**
- Days inactive = 2 → tier Mid → 400,000 wei.
- Payment is more than 1 hour late, so lateRelief = 5.
- `reputationScore = 66 − 5 = 61`.
- `escrowAmount = 400,000`, `escrowStartTime = now`.
- `totalPenaltiesPaid = 400,000`.
- `state = Active`, all resource timers reset.

**Step 10 — Alice updates Water to 3000 (within 24h).**
- `compliantUpdates = 4`.
- Tier is now New (cycles reset to 0). Reward = 1.
- `reputationScore = 62`.

**Step 11 — Alice keeps updating for 40 days without missing.**
- She calls `updateResourceQuantity` every ~12 hours.
- `compliantUpdates` grows from 4 to ~80.
- Reputation gains +1 per update while in New tier.
- Score reaches the cap of 200 around update 142, but during these 40 days it's around 100-110.

**Step 12 — Alice waits 30 days clean from the payment, then calls `releaseEscrow`.**
- Release succeeds.
- `escrowAmount = 0`.
- `totalEscrowRefunded += 400,000`.
- `successfulCycles = 1`.
- Trust tier still New.

**End state.** Alice is Active, reputation ~110, one clean cycle, zero penalties outstanding.

### 17.2 Example B — Two suppliers, same violation, different histories

Two suppliers both miss the 24-hour deadline and get deactivated. Their histories differ.

**Supplier A — Newcomer.**
- Just registered, approved last week.
- Registered Water, updated it twice, then missed.
- Ratio = 2 / (2+1) = 0.667 → 6666 bps.
- Trust tier = New, multiplier 15000.
- Loss = 20 × (20000 − 6666) × 15000 / 100,000,000
       = 20 × 13334 × 15000 / 100,000,000
       = 4,000,200,000 / 100,000,000
       = 40.002 → truncated to 40, capped at 40.
- Score: 100 + 2 (updates) − 40 = 62.

**Supplier B — Veteran.**
- Registered 14 months ago.
- 180 compliant updates, 8 missed at various points.
- Ratio = 180 / (180+8) = 0.957 → 9574 bps.
- successfulCycles = 10 → Trusted tier, multiplier 7000.
- Loss = 20 × (20000 − 9574) × 7000 / 100,000,000
       = 20 × 10426 × 7000 / 100,000,000
       = 1,459,640,000 / 100,000,000
       = 14.596 → 14.
- Score: previous score minus 14.

If B's reputation was 175 before this deactivation, it becomes 161. Still Gold.

**The gap.** Same violation, same admin action, same moment in time. A loses 40 points and drops to 62 (Bronze). B loses 14 and stays at Gold. The difference: A has no track record and no trust. B has both.

**Why this matters for the domain.** In humanitarian aid, a long-standing supplier with a rare slip deserves more understanding than an unknown newcomer with the same slip. The contract encodes that intuition as arithmetic.

---

## 18. Smart Contract Function Reference

Every public and external function, with what it does, who can call it, and what it changes.

### 18.1 Constructor

**`constructor()`**

Runs once at deploy. Sets `admin = msg.sender`, `aidFundAddress = msg.sender`, `paused = false`. No parameters.

### 18.2 Admin functions

**`setAdmin(address _newAdmin)`** — admin only. Transfers the admin role. Reverts on zero address. Emits `AdminChanged`.

**`setAidFundAddress(address _newAddress)`** — admin only. Changes the aid fund destination. Reverts on zero address. Emits `AidFundAddressUpdated`.

**`pause()`** — admin only. Sets `paused = true`. Reverts if already paused. Emits `ContractPaused`.

**`unpause()`** — admin only. Sets `paused = false`. Reverts if not paused. Emits `ContractUnpaused`.

**`getAdmin()`** — view. Returns the current admin address.

**`isAdmin(address _who)`** — view. Returns true if the address is the admin.

### 18.3 Approval functions

**`applyAsSupplier(string _name, uint8 _type) payable returns (uint256)`**

Creates a pending supplier. Requires exact 100,000 wei, non-empty name, type <= 8. Emits `SupplierApplied`. Returns the new ID.

**`approveSupplier(uint256 _supplierId)`**

Admin-only. Moves Pending to Active. Emits `SupplierApproved` and `ReputationChanged`.

**`approveAllPending()`**

Admin-only. Loops through all suppliers and approves any that are Pending. Useful for bulk setup.

**`rejectSupplier(uint256 _supplierId)`**

Admin-only. Moves Pending to Rejected. Refunds 100,000 wei. Emits `SupplierRejected`.

### 18.4 Resource functions

**`registerResource(uint256 _supplierId, uint8 _resourceType, uint256 _quantity)`**

Owner-only. Requires Active supplier, valid type, not already registered, quantity > 0. Emits `ResourceRegistered`.

**`updateResourceQuantity(uint256 _supplierId, uint8 _resourceType, uint256 _quantity)`**

Owner-only. Requires Active supplier, registered resource, quantity > 0, compliance window not expired. Increments `compliantUpdates` and applies reputation reward. Emits `ResourceUpdated`, `ReputationChanged`.

**`isResourceCompliant(uint256 _supplierId, uint8 _resourceType) view returns (bool)`**

Returns true if resource is registered, supplier is Active, and the window is not expired.

**`remainingComplianceTime(uint256 _supplierId, uint8 _resourceType) view returns (uint256)`**

Returns seconds until the deadline, or 0 if expired.

**`getSupplierResourceQuantity(uint256 _supplierId, uint8 _resourceType) view returns (uint256)`**

Returns current quantity.

**`getSupplierResourceLastUpdated(uint256 _supplierId, uint8 _resourceType) view returns (uint256)`**

Returns the last update timestamp.

### 18.5 Compliance functions

**`checkAndDeactivate(uint256 _supplierId)`**

Admin-only. Iterates resources, counts expired, requires at least one expired, moves supplier to Inactive, applies weighted reputation loss, resets `successfulCycles`. Emits `SupplierDeactivated`, `ReputationChanged`.

### 18.6 Chainlink Automation

**`checkUpkeep(bytes calldata) view returns (bool, bytes memory)`**

View. Returns true if any supplier has an expired resource.

**`performUpkeep(bytes calldata performData)`**

Called by the keeper. Decodes the supplier ID and performs the same logic as `checkAndDeactivate`.

### 18.7 Penalty and reactivation

**`calculatePenalty(uint256 _supplierId) view returns (uint256)`**

Returns wei owed. Requires supplier is Inactive.

**`payPenaltyAndReactivate(uint256 _supplierId) payable`**

Owner-only. Requires Inactive supplier and exact penalty amount. Moves funds into escrow, reactivates supplier, resets resource timers, applies late-payment reputation penalty. Emits `PenaltyPaid`, `EscrowDeposited`, `SupplierReactivated`.

### 18.8 Escrow functions

**`releaseEscrow(uint256 _supplierId)`** — permissionless. Requires 30 days elapsed and supplier Active. Sends funds to supplier. Increments `successfulCycles`. Emits `EscrowReleased`.

**`forfeitEscrow(uint256 _supplierId)`** — permissionless. Requires window not elapsed and supplier not Active. Sends funds to aid fund. Increments `totalPenaltiesCollected`. Emits `EscrowForfeited`.

**`getEscrowInfo(uint256 _supplierId) view returns (uint256, uint256, bool, bool)`**

Returns `(balance, releaseTime, releasable, forfeitEligible)`.

### 18.9 Reputation views

**`getComplianceRatio(uint256 _supplierId) view returns (uint256)`** — basis points 0-10000.

**`getTrustTier(uint256 _supplierId) view returns (uint8)`** — 0-3.

**`predictDeactivationPenalty(uint256 _supplierId) view returns (uint256)`** — reputation points that would be lost if deactivated now.

**`getReputationTier(uint256 _supplierId) view returns (string memory)`** — tier name.

**`getLastDeactivationDays(uint256 _supplierId) view returns (uint256)`** — frozen days inactive at last penalty payment.

### 18.10 Supplier views

**`getSupplier(uint256 _supplierId) view returns (14 values)`**

id, wallet, name, supplierType, state, reputationScore, totalPenaltiesPaid, timesDeactivated, resourceCount, lastDeactivationDays, compliantUpdates, missedUpdates, successfulCycles, trustTier.

**`getSupplierIdsOf(address _who) view returns (uint256[])`** — all IDs owned by a wallet.

**`getMySupplierIds() view returns (uint256[])`** — same, for msg.sender.

**`getAllSupplierIds() view returns (uint256[])`** — every ID ever created.

### 18.11 Aggregate views

**`getStats() view returns (9 values)`** — total approved, active, inactive, pending, rejected, funds from registration, funds from penalties, escrow held, escrow refunded.

**`getTotalFundsCollected() view returns (uint256)`** — reg + penalties.

**`getTypeCounts() view returns (uint256[])`** — 9 counts, rejected excluded.

**`getTopPerformers(uint256 _limit) view returns (uint256[], uint256[])`** — top N by reputation.

**`getFrequentDefaulters(uint256 _limit) view returns (uint256[], uint256[])`** — top N by penalties paid.

**`getAggregateResourceQuantity(uint8 _resourceType) view returns (uint256)`** — total quantity per resource.

**`getSuppliersCountForResource(uint8 _resourceType) view returns (uint256)`** — count of suppliers with the resource registered.

---

## 19. Events Reference

Every event emitted by the contract.

**`AdminChanged(address indexed oldAdmin, address indexed newAdmin)`** — on `setAdmin` success.

**`AidFundAddressUpdated(address indexed newAddress)`** — on `setAidFundAddress` success.

**`SupplierApplied(uint256 indexed supplierId, address indexed wallet, string name, SupplierType supplierType, uint256 timestamp)`** — on every new application.

**`SupplierApproved(uint256 indexed supplierId, address indexed wallet, uint256 timestamp)`** — on approval.

**`SupplierRejected(uint256 indexed supplierId, address indexed wallet, uint256 refundedAmount, uint256 timestamp)`** — on rejection.

**`SupplierDeactivated(uint256 indexed supplierId, address indexed wallet, uint256 reputationLoss, uint256 timestamp)`** — on deactivation.

**`SupplierReactivated(uint256 indexed supplierId, address indexed wallet, uint256 timestamp)`** — on reactivation after penalty.

**`ResourceRegistered(uint256 indexed supplierId, address indexed wallet, string resource, uint256 timestamp)`** — on resource registration.

**`ResourceUpdated(uint256 indexed supplierId, address indexed wallet, string resource, uint256 quantity, uint256 timestamp)`** — on each successful update.

**`PenaltyPaid(uint256 indexed supplierId, address indexed wallet, uint256 amount, uint256 timestamp)`** — on penalty payment.

**`EscrowDeposited(uint256 indexed supplierId, address indexed wallet, uint256 amount, uint256 releaseTime, uint256 timestamp)`** — alongside every penalty payment.

**`EscrowReleased(uint256 indexed supplierId, address indexed wallet, uint256 amount, uint256 timestamp)`** — on refund.

**`EscrowForfeited(uint256 indexed supplierId, address indexed wallet, uint256 amount, address recipient, uint256 timestamp)`** — on forfeit.

**`ReputationChanged(uint256 indexed supplierId, address indexed wallet, uint256 oldScore, uint256 newScore, string reason, uint256 timestamp)`** — on every reputation change. Reason field carries a human-readable string.

**`ContractPaused(address indexed by, uint256 timestamp)`** — on pause.

**`ContractUnpaused(address indexed by, uint256 timestamp)`** — on unpause.

---

## 20. Revert Reasons Reference

Every require statement, with the exact message and its trigger.

| Revert message | Triggered by |
|----------------|--------------|
| Only admin can call this | onlyAdmin modifier |
| Contract is paused | whenNotPaused modifier |
| Invalid resource type | validResource modifier |
| Not owner of supplier | onlyOwnerOf modifier |
| Invalid admin | setAdmin with zero address |
| Invalid address | setAidFundAddress with zero address |
| Already paused | pause on already-paused contract |
| Not paused | unpause on running contract |
| Name required | applyAsSupplier with empty name |
| Invalid type | applyAsSupplier with type > 8 |
| Incorrect registration fee | applyAsSupplier with wrong msg.value |
| Unknown supplier | Any function with non-existent ID |
| Not pending | approve/reject on non-pending supplier |
| Refund failed | rejectSupplier's refund call |
| Supplier not active | register/update on non-active supplier |
| Resource already registered | duplicate registerResource |
| Quantity must be > 0 | zero or negative quantity |
| Resource not registered | update on unregistered resource |
| Compliance window expired | update after 24h |
| Not active | checkAndDeactivate on non-active |
| Supplier still compliant | checkAndDeactivate when no resources expired |
| Still compliant | performUpkeep when no resources expired |
| Not inactive | calculatePenalty or pay on non-inactive |
| Incorrect penalty amount | payPenalty with wrong msg.value |
| No escrow | release/forfeit with zero escrow |
| Period not elapsed | releaseEscrow before 30 days |
| Period elapsed | forfeitEscrow after 30 days |
| Active | forfeitEscrow while supplier active |
| Refund failed | releaseEscrow's transfer call |
| Aid fund failed | forfeitEscrow's transfer call |

---

## 21. Failure Mode Catalogue

System-level failure scenarios and what happens.

### 21.1 Admin loses their key

The old admin can no longer pause, approve, deactivate, or change the aid fund. Escrow in the contract is untouched — the release and forfeit functions are permissionless, so the escrow still flows to the correct destination (supplier on release, aid fund on forfeit). Existing approved suppliers continue to operate.

Mitigation in production: use a multi-sig wallet (e.g., Safe) as the admin address.

### 21.2 Supplier loses their key

The compromised wallet can still call `updateResourceQuantity` and `payPenaltyAndReactivate`. It cannot be used to withdraw escrow — the escrow is stored in the contract keyed by supplier ID, not by wallet balance. The most that can happen is the attacker maintains compliance and prevents deactivation.

The other direction — losing the key entirely — means the supplier can't update. Eventually they'll miss the deadline and get deactivated. Only the compromised wallet can pay the penalty to reactivate. If that wallet is lost, the supplier ID is effectively frozen.

### 21.3 Escrow sits unclaimed forever

If a supplier completes their 30-day window and never calls `releaseEscrow`, the funds stay in escrow indefinitely. Anyone can call `releaseEscrow` — the destination is fixed by contract logic. In practice, either the supplier or an observer will claim it, or it just sits there.

The funds can't be redirected. The contract has no admin override for escrow.

### 21.4 Wrong penalty amount

If a supplier sends less than the required penalty, `payPenaltyAndReactivate` reverts with `"Incorrect penalty amount"`. The transaction doesn't go through and no state changes.

If they send more, it also reverts. The contract requires exactly the amount owed.

### 21.5 Deactivate on a compliant supplier

`checkAndDeactivate` reverts with `"Supplier still compliant"`. No state changes.

### 21.6 Aid fund address can't receive Ether

If `aidFundAddress` is a contract that rejects Ether, `forfeitEscrow` reverts. Escrow stays in the contract. The admin would need to change the aid fund to a wallet that can receive funds, then retry.

### 21.7 RPC unreachable

The frontend shows connection errors. Existing transaction hashes still succeed on-chain — the client just can't read the results. When the RPC comes back, the frontend can resume.

### 21.8 Hardhat node crashes

All state is lost. Restarting the node wipes everything. Redeploy and start over. This is by design — it's a dev sandbox.

### 21.9 MetaMask on wrong chain

The DApp prompts a switch to Hardhat Local via `wallet_switchEthereumChain`. If the user cancels the prompt, the DApp shows a warning and refuses to proceed.

### 21.10 Duplicate application from same wallet

The wallet can call `applyAsSupplier` multiple times. Each call creates a new supplier ID. This is allowed by design — one wallet can own many suppliers.

---

## 22. Gas Cost Breakdown

Rough gas costs per function on the Hardhat network. Actual costs vary with storage state.

| Function | Approx gas | Notes |
|---|---|---|
| applyAsSupplier | 150,000 | Creates a struct + appends to two arrays |
| approveSupplier | 60,000 | Single struct write + two counters |
| approveAllPending | 80,000 per approval | Linear in pending count |
| rejectSupplier | 50,000 | Refund transfer + state write |
| registerResource | 100,000 | New struct + array push |
| updateResourceQuantity | 80,000 | Struct write + reputation math |
| checkAndDeactivate | 100,000 + 20k per resource | Loop over registered resources |
| payPenaltyAndReactivate | 130,000 | Escrow write + resource loop |
| releaseEscrow | 70,000 | Transfer + state writes |
| forfeitEscrow | 70,000 | Transfer + state writes |
| setAdmin | 30,000 | Single storage slot |
| pause / unpause | 30,000 | Single boolean |

On a real network these would be paid in ETH. On Hardhat, gas is free but still metered so the numbers reflect what a production version would cost.

---

## 23. Centralized System Comparison

How does this system differ from a standard centralized supplier database? Seven axes.

### 23.1 Tamper resistance

**Centralized.** Anyone with database access can edit any row. Logs can be modified. Backups can be doctored. Trust depends on the operator.

**Blockchain.** Every state change requires a signed transaction that goes through contract rules. There is no code path to edit a past event. To change state, you must submit a new transaction that's also permanently recorded.

### 23.2 Transparency

**Centralized.** Depends on what the operator decides to show. Rules are in prose documents. Enforcement is opaque.

**Blockchain.** The contract code is public. Every rule is in Solidity. Anyone can read the code, verify the rules, and inspect the event history.

### 23.3 Auditability

**Centralized.** Audit requires access to internal systems. Reconstruction of history is best-effort.

**Blockchain.** Every event is permanently stored, indexed, and queryable by anyone. Full history is always reconstructible from the chain.

### 23.4 Cost of operation

**Centralized.** Server hosting, database maintenance, backup infrastructure, audit personnel.

**Blockchain.** Gas per transaction (negligible on local). No hosting. No backups. No infrastructure beyond the chain itself.

### 23.5 Latency

**Centralized.** Sub-100ms for a database write.

**Blockchain.** Block time on Hardhat is instant (mined on transaction). On Ethereum mainnet, 12 seconds. On L2s, 1-2 seconds.

### 23.6 Failure modes

**Centralized.** Database corruption, server outage, compromised credentials, insider tampering.

**Blockchain.** Node failure (state loss on local), contract bug (would require redeploy), wallet compromise (bounded by access control).

### 23.7 Trust assumptions

**Centralized.** Users must trust the operator to follow the rules, keep data accurate, and not modify records.

**Blockchain.** Users need only trust the contract code and the consensus of the network. No operator trust required for rule enforcement.

**Summary.** The blockchain version trades some latency and cost for verifiability, tamper resistance, and independence from a central operator. For a compliance system where the entire point is "you can't fudge the record," that trade is favourable.

---

## 24. Frontend Walkthrough

The DApp is a single-page application built with plain HTML, CSS, and JavaScript. It uses Ethers.js to talk to the contract and Chart.js for analytics.

### 24.1 Page structure

- Header — title, Connect MetaMask button, wallet address, role badge.
- Admin dashboard — shown when the connected wallet matches `getAdmin()`.
- Supplier dashboard — shown for every other wallet.
- Global sections — Statistics and Live Event Log, visible to both roles.

### 24.2 Admin dashboard

Three tabs across the top.

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

Full table of every supplier. Search by name, filter by type, filter by state. Deactivate button on Active rows.

**Analytics tab.**

Summary cards, four charts, leaderboard table, Export CSV button.

### 24.3 Supplier dashboard

Top to bottom:

- Register New Supplier form.
- My Suppliers table with state and trust badges.
- Selected Supplier detail panel.
- Resource Management panel.
- Compliance Countdown panel.
- Penalty panel.
- Escrow panel.
- Reputation panel.
- Time Simulation panel.

### 24.4 Role detection

On connect, the frontend calls `getAdmin()` and compares to the connected wallet. If they match, show the admin dashboard. Otherwise, show the supplier dashboard.

### 24.5 Contract address resolution

The frontend fetches `deployed-address.json` on page load with a cache-buster. The deploy script rewrites this file with the new address on every deploy. No manual edits ever needed.

### 24.6 Chain switching

If MetaMask is on the wrong chain, the DApp calls `wallet_switchEthereumChain` to prompt a switch. If the chain isn't in MetaMask, `wallet_addEthereumChain` adds it.

### 24.7 Event log

The Live Event Log subscribes to every event via `rc.on(name, handler)`. As transactions confirm, events appear with timestamps. The log resets on page reload — it only streams events after the page loads.

---

## 25. Access Control Matrix

| Function | Admin | Owner | Anyone |
|----------|:-----:|:-----:|:------:|
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

Note that `releaseEscrow` and `forfeitEscrow` are permissionless. The destination is fixed by contract logic. There's no way to redirect the funds maliciously.

---

## 26. Security Notes

### 26.1 Only the admin can deactivate

Deactivation stops the supplier from working and starts the penalty clock. If any wallet could call it, anyone could grief any supplier. Admin-only is enforced by the `onlyAdmin` modifier.

### 26.2 The supplier pays their own penalty

`payPenaltyAndReactivate` requires `onlyOwnerOf`. Only the supplier's own wallet can pay. The reputation penalty, the escrow, and the eventual refund all apply to the supplier. If the admin could pay, the supplier would get off scot-free while the admin's wallet lost money.

### 26.3 Escrow is per-supplier

Each supplier has its own escrow balance. There's no shared pool. Escrow can only be released to that supplier or forfeited to the aid fund. It can never be diverted elsewhere.

### 26.4 No admin escape hatch

The admin cannot withdraw registration fees, withdraw escrow, move funds to an arbitrary address, or override a penalty calculation. The only money flow the admin controls is the aid fund address.

### 26.5 Pause is a brake, not a reset

Pausing freezes writes without erasing state, moving funds, or changing balances.

### 26.6 Compromised wallets

A compromised supplier wallet can update quantities and pay penalties — that's all. A compromised admin wallet can approve, reject, deactivate, pause, change the aid fund, and hand off admin to an attacker.

### 26.7 No reentrancy risk

Outbound transfers happen after all state changes. Balances are tracked in contract storage, not in the recipient's contract. There's no reentrancy vector.

### 26.8 Basis points, not floats

All ratio math uses integer basis points (0 to 10000). Solidity has no floats. Mixing them would cause rounding errors.

### 26.9 Input validation

Every external function validates its inputs before any state change. Invalid inputs revert with a specific, human-readable reason.

---

## 27. Extensibility and Production Notes

What would change if this were built for production rather than a coursework demo.

**Multi-sig admin.** Replace the single-EOA admin with a Safe multi-sig contract. Requires multiple signatures for pause, admin transfer, and aid fund changes.

**Configurable compliance period.** Make `COMPLIANCE_PERIOD` a mutable state variable set by the admin. Allows jurisdictions with different rules to coexist.

**ERC-20 payments.** Replace raw wei with an ERC-20 token (USDC, DAI). Penalties become real currency, not test-denominated wei.

**Chainlink price feeds.** Denominate penalties in USD, then convert to wei at payment time.

**Off-chain storage for names.** Full names can be large. Store a hash on-chain and the full text in IPFS.

**Subgraph for historical data.** Replace browser-side event aggregation with a Graph Protocol subgraph. Enables fast queries and larger history.

**Per-resource reputation.** Currently reputation is per-supplier. A supplier with one good resource and one bad one has a single score. Per-resource tracking would be more granular.

**Slashing for repeat offenders.** Instead of escrow forfeiture, consider a permanent stake that's slashed on violation. Stronger deterrence.

**Time-weighted compliance ratio.** Discount older mistakes. A violation from 2 years ago shouldn't count the same as one from last week.

**Severity weighting.** A miss of 1 hour vs. a miss of 3 weeks currently count the same toward the ratio. Add a severity dimension.

**Merkle-tree batch operations.** For systems with hundreds of suppliers, batch approvals and deactivations into a single Merkle root update.

**Upgradeability.** Use a proxy pattern (UUPS or Transparent) so the contract logic can be upgraded without changing the address.

---

## 28. Technology Stack

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

The `viaIR: true` compiler option is enabled in `hardhat.config.js` to avoid a stack-too-deep error on the 14-value `getSupplier` return.

---

## 29. Installation and Running

### 29.1 Prerequisites

- Node.js 18 or newer
- MetaMask browser extension
- Python 3 for serving the frontend

Verify:

```
node --version
npm --version
```

### 29.2 Installation

```
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npm install
npx hardhat compile
```

Compilation takes 30 to 60 seconds because `viaIR` is enabled.

### 29.3 Running

You need three terminals.

**Terminal 1: Hardhat Node**

```
Get-NetTCPConnection -LocalPort 8545 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npx hardhat node
```

Leave this window open.

**Terminal 2: Deploy**

```
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance"
npx hardhat run scripts/deploy.js --network localhost
```

**Terminal 3: Frontend Server**

```
Get-NetTCPConnection -LocalPort 4444 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
cd "C:\Users\Mark-II\Documents\blockchain-supplier-compliance\frontend"
python -m http.server 4444
```

Leave this window open.

**Browser**

```
http://localhost:4444
```

Press Ctrl+Shift+R to hard-refresh.

---

## 30. MetaMask Setup

Once per machine:

1. Install MetaMask.
2. Add a custom network: Network Name "Hardhat Local", RPC URL `http://127.0.0.1:8545`, Chain ID `31337`, Currency Symbol `ETH`.
3. Import the first Hardhat test account using this private key:

   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```

4. Rename it to Hardhat Admin.
5. Import the second Hardhat test account:

   ```
   0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
   ```

6. Rename it to Hardhat Supplier.

Both accounts should show 10,000 ETH on Hardhat Local.

If MetaMask shows 0 ETH after switching, clear its cache: Settings, Developer tools, Delete activity and nonce data.

---

## 31. Testing Methodology

The test suite lives in `test/SupplierCompliance.test.js`. It uses Mocha as the test runner, Chai for assertions, and the Hardhat Network Helpers library for time manipulation.

### 31.1 Structure

Tests are grouped into describe blocks by feature area:

- Admin role
- Apply and approve
- Resource ops
- Deactivation and penalty
- Aggregate views

Each `it` block tests one behaviour. The names are written as assertions: "admin deactivates non-compliant", "update after window expires reverts".

### 31.2 Time manipulation

The suite uses `time.increase(seconds)` from Hardhat Network Helpers to advance the blockchain clock without waiting real time. This is the same mechanism the frontend uses via `evm_increaseTime`.

### 31.3 Revert assertions

For failure cases, the tests use `.to.be.revertedWith("...")` to assert both that a revert happened and that the reason string is correct. This makes the tests self-documenting.

### 31.4 A representative test

```
it("update after window expires reverts", async () => {
  await contract.connect(s1).registerResource(1, 0, 100);
  await time.increase(25 * 3600);
  await expect(
    contract.connect(s1).updateResourceQuantity(1, 0, 500)
  ).to.be.revertedWith("Compliance window expired");
});
```

This test registers a resource, advances time by 25 hours, then asserts that an update reverts with the specific reason string.

### 31.5 Running

```
npx hardhat test
```

All tests should pass. If any fail, the failure message points to the exact assertion and line.

### 31.6 Coverage gaps

The suite does not include fuzz tests, invariant tests, or property-based tests. Those would strengthen confidence for a production system. For the coursework scope, the deterministic tests cover every feature and every revert path.

---

## 32. Demonstrating the Full Lifecycle

Because the compliance period is one day, the DApp exposes a Time Simulation panel.

### 32.1 Setup

- Terminal 1 running
- Terminal 2 deploy completed
- Terminal 3 running
- Browser open, MetaMask on Hardhat Local

### 32.2 The flow

**Supplier side.**

1. Switch MetaMask to Hardhat Supplier. Reload page. Blue SUPPLIER badge appears.
2. Register New Supplier: Name "Red Cross", Type NGO, click Apply, confirm.
3. Wait for "Application submitted, status Pending admin approval".
4. Click Load My Suppliers. A new row appears with state Pending.

**Admin side.**

5. Switch MetaMask to Hardhat Admin. Reload page. Yellow ADMIN badge appears.
6. In Pending Approvals, click Approve on the row.
7. Overview tab shows 1 approved, 1 active.

**Supplier side again.**

8. Switch to Hardhat Supplier, reload, Load My Suppliers, click Select.
9. Resource Water, Quantity 1000, click Register.
10. Quantity 2000, click Update.

**Break compliance.**

11. Click +25h in Time Simulation.
12. Click Load on Compliance Countdown. Shows EXPIRED.
13. Try to Update to 3000. Fails with "Compliance window expired".

**Deactivate.**

14. Switch to Hardhat Admin, reload, Suppliers tab, click Deactivate.

**Pay penalty.**

15. Switch to Hardhat Supplier, reload, Select the supplier.
16. Click Calculate in the Penalty panel. Shows 200,000 wei.
17. Click Pay and Reactivate. Confirm.
18. Reputation drops. Escrow shows 200,000 wei held.

**Check analytics.**

19. Switch to Hardhat Admin, reload, Analytics tab.
20. See charts and leaderboard.
21. Click Export CSV.

Screenshot each step for the submission.

---

## 33. Escrow Lifecycle Demonstration

### 33.1 Release (good outcome)

1. Get a supplier into escrow: deactivate, pay penalty.
2. Click +10d three times to reach 30 days.
3. Open the Hardhat console:

   ```
   npx hardhat console --network localhost
   ```

   ```
   const c = await ethers.getContractAt("SupplierCompliance", require("./frontend/deployed-address.json").address);
   await c.releaseEscrow(1);
   ```

4. Admin dashboard, Refresh, Funds Collected. "Escrow refunded" increased.

### 33.2 Forfeit (bad outcome)

1. Get a supplier into escrow.
2. Click +25h, then as admin deactivate again.
3. In the console:

   ```
   await c.forfeitEscrow(1);
   ```

4. Admin dashboard, Refresh. "Penalties forfeited to aid fund" increased.

---

## 34. Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| npx.ps1 cannot be loaded | PowerShell execution policy | Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force |
| Cannot find module | node_modules missing | npm install |
| ECONNREFUSED 127.0.0.1:8545 | Hardhat node not running | Start Terminal 1 |
| EADDRINUSE on 8545 | Old node still running | Kill command in Terminal 1 |
| EADDRINUSE on 4444 | Old frontend server running | Kill command in Terminal 3 |
| Stack too deep | Compiler limit | Ensure viaIR is true |
| ParserError: Expected pragma | BOM in .sol | Save as UTF-8 without BOM |
| deployed-address.json not found | Deployment not run | Run Terminal 2 |
| Only admin can call this | Wrong wallet | Switch MetaMask to the admin wallet |
| Not owner of supplier | Wrong wallet | Switch to the wallet that owns the supplier |
| Compliance window expired | Late update | Admin must deactivate, then pay penalty |
| Supplier not active | Pending or Inactive supplier | Approve or reactivate first |
| MetaMask shows 0 ETH | Cache or wrong RPC | Delete activity and nonce data; verify RPC |
| MetaMask on wrong chain | Default network | DApp auto-prompts to switch |
| Charts not rendering | Chart.js CDN blocked | Use a local copy of chart.umd.min.js |
| Contract address mismatch | Cached JSON | Hard reload with Ctrl+Shift+R |

---

## 35. Persistent Local State

The Hardhat node is a development sandbox. State is in memory and is wiped on restart.

Two ways to persist:

**Ganache with a disk database.**

```
npx ganache --server.port 8545 --chain.chainId 31337 --wallet.deterministic --database.dbPath ./.chain-data
```

Deploy once. On subsequent runs, the same command restores the previous state.

**Deploy to a public testnet.** Permanent state but `evm_increaseTime` doesn't work, so time-based demos become real-time.

For coursework, stick with the standard Hardhat node unless you specifically need persistence.

---

## 36. Glossary

**wei** — Smallest unit of Ether. 1 ETH = 10^18 wei.

**block.timestamp** — Unix timestamp of the current block.

**msg.sender** — The address that called the current function.

**msg.value** — The amount of wei sent with a payable call.

**payable** — A modifier allowing a function to receive Ether.

**modifier** — A reusable precondition check.

**require** — A statement that reverts if its condition is false.

**revert** — Abort a transaction. State changes are undone.

**event** — A structured log entry on the blockchain.

**indexed** — A parameter attribute that makes events filterable.

**escrow** — Funds held by the contract on behalf of a party, released under conditions.

**aid fund** — The wallet that receives forfeited escrow.

**reputation** — A 0-200 score reflecting a supplier's behaviour.

**trust tier** — One of New, Developing, Trusted, Established.

**compliance window** — The 24-hour period between mandatory updates.

**deactivation** — Moving a supplier from Active to Inactive.

**reactivation** — Moving from Inactive back to Active after penalty payment.

**ABI** — The interface description that Ethers.js uses to encode calls.

**RPC** — The HTTP interface used to talk to a blockchain node.

**nonce** — A per-account transaction counter.

**evm_increaseTime** — A Hardhat RPC method for advancing the clock.

**viaIR** — A compiler option that routes through an intermediate representation.

**basis points** — Parts per 10,000. 10000 bps = 100%.

**Chainlink Automation** — A keeper service for off-chain triggered on-chain actions.

---

## 37. Submission Contents

The Moodle submission ZIP contains:

- contracts/SupplierCompliance.sol — the smart contract
- scripts/deploy.js — deployment script
- test/SupplierCompliance.test.js — unit tests
- frontend/index.html, frontend/app.js, frontend/styles.css, frontend/ethers.min.js — the DApp
- screenshots/ — every step of the demonstration captured
- README.md — this file
- hardhat.config.js, package.json

node_modules, artifacts, and cache are not included. Regenerate with `npm install` and `npx hardhat compile`.

---

## 38. License

MIT, free to use for educational purposes.

---

## Author

ARGHO DAS / Group 8
Introduction to Blockchain
7th October 2026