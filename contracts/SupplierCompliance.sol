// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

contract SupplierCompliance is AutomationCompatibleInterface {
    // ============================================================
    // CONSTANTS — FEES & TIMING
    // ============================================================
    uint256 public constant REGISTRATION_FEE = 100000 wei;
    uint256 public constant COMPLIANCE_PERIOD = 1 days;
    uint256 public constant PENALTY_RATE_LOW = 200000 wei;
    uint256 public constant PENALTY_RATE_MID = 400000 wei;
    uint256 public constant PENALTY_RATE_HIGH = 800000 wei;
    uint256 public constant PENALTY_RATE_MAX = 1000000 wei;
    uint256 public constant ESCROW_PERIOD = 30 days;

    // ============================================================
    // CONSTANTS — REPUTATION
    // ============================================================
    uint256 public constant REPUTATION_START = 100;
    uint256 public constant REPUTATION_MAX = 200;
    uint256 public constant REPUTATION_PENALTY_BASE = 20;
    uint256 public constant REPUTATION_PENALTY_CAP = 40;
    uint256 public constant REPUTATION_PROMPT_WINDOW = 1 hours;
    uint256 public constant REPUTATION_PROMPT_RELIEF = 5;

    // Trust tier thresholds (successful cycles)
    uint256 public constant TRUST_DEVELOPING = 3;
    uint256 public constant TRUST_TRUSTED = 8;
    uint256 public constant TRUST_ESTABLISHED = 16;

    // ============================================================
    // ENUMS
    // ============================================================
    enum ResourceType { Water, Clothing, Medicine, Food }
    enum SupplierType { NGO, Vendor, Corporate, Individual, Government, Healthcare, Educational, Religious, Other }
    enum SupplierState { Pending, Active, Inactive, Rejected }
    enum TrustTier { New, Developing, Trusted, Established }

    // ============================================================
    // STRUCTS
    // ============================================================
    struct Resource {
        ResourceType resourceType;
        uint256 quantity;
        uint256 lastUpdated;
        bool registered;
        bool compliant;
    }

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

        // Reputation & behaviour tracking
        uint256 reputationScore;
        uint256 compliantUpdates;
        uint256 missedUpdates;
        uint256 successfulCycles;

        uint256 totalPenaltiesPaid;

        // Escrow
        uint256 escrowAmount;
        uint256 escrowStartTime;

        ResourceType[] registeredResources;
        mapping(ResourceType => Resource) resources;
    }

    // ============================================================
    // STATE
    // ============================================================
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

    // ============================================================
    // EVENTS
    // ============================================================
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event AidFundAddressUpdated(address indexed newAddress);
    event SupplierApplied(uint256 indexed supplierId, address indexed wallet, string name, SupplierType supplierType, uint256 timestamp);
    event SupplierApproved(uint256 indexed supplierId, uint256 timestamp);
    event SupplierRejected(uint256 indexed supplierId, uint256 refundedAmount, uint256 timestamp);
    event SupplierDeactivated(uint256 indexed supplierId, uint256 reputationLoss, uint256 timestamp);
    event SupplierReactivated(uint256 indexed supplierId, uint256 timestamp);
    event ResourceRegistered(uint256 indexed supplierId, string resource, uint256 timestamp);
    event ResourceUpdated(uint256 indexed supplierId, string resource, uint256 quantity, uint256 timestamp);
    event PenaltyPaid(uint256 indexed supplierId, uint256 amount, uint256 timestamp);
    event EscrowDeposited(uint256 indexed supplierId, uint256 amount, uint256 releaseTime, uint256 timestamp);
    event EscrowReleased(uint256 indexed supplierId, uint256 amount, uint256 timestamp);
    event EscrowForfeited(uint256 indexed supplierId, uint256 amount, address recipient, uint256 timestamp);
    event ReputationChanged(uint256 indexed supplierId, uint256 oldScore, uint256 newScore, string reason, uint256 timestamp);
    event ContractPaused(address indexed by, uint256 timestamp);
    event ContractUnpaused(address indexed by, uint256 timestamp);

    // ============================================================
    // MODIFIERS
    // ============================================================
    modifier onlyAdmin() { require(msg.sender == admin, "Only admin can call this"); _; }
    modifier whenNotPaused() { require(!paused, "Contract is paused"); _; }
    modifier validResource(uint8 _resourceType) { require(_resourceType <= uint8(ResourceType.Food), "Invalid resource type"); _; }
    modifier onlyOwnerOf(uint256 _supplierId) { require(suppliers[_supplierId].wallet == msg.sender, "Not owner of supplier"); _; }

    constructor() {
        admin = msg.sender;
        aidFundAddress = msg.sender;
        paused = false;
    }

    // ============================================================
    // ADMIN
    // ============================================================
    function setAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Invalid admin");
        emit AdminChanged(admin, _newAdmin);
        admin = _newAdmin;
    }

    function setAidFundAddress(address _newAddress) external onlyAdmin {
        require(_newAddress != address(0), "Invalid address");
        aidFundAddress = _newAddress;
        emit AidFundAddressUpdated(_newAddress);
    }

    function pause() external onlyAdmin { require(!paused, "Already paused"); paused = true; emit ContractPaused(msg.sender, block.timestamp); }
    function unpause() external onlyAdmin { require(paused, "Not paused"); paused = false; emit ContractUnpaused(msg.sender, block.timestamp); }
    function getAdmin() external view returns (address) { return admin; }
    function isAdmin(address _who) external view returns (bool) { return _who == admin; }

    // ============================================================
    // APPLY
    // ============================================================
    function applyAsSupplier(string calldata _name, uint8 _type)
        external payable whenNotPaused returns (uint256)
    {
        require(bytes(_name).length > 0, "Name required");
        require(_type <= uint8(SupplierType.Other), "Invalid type");
        require(msg.value == REGISTRATION_FEE, "Incorrect registration fee");

        uint256 id = ++nextSupplierId;
        Supplier storage s = suppliers[id];
        s.id = id;
        s.wallet = msg.sender;
        s.name = _name;
        s.supplierType = SupplierType(_type);
        s.state = SupplierState.Pending;
        s.registrationTimestamp = block.timestamp;
        s.registered = false;
        s.reputationScore = REPUTATION_START;

        ownedSupplierIds[msg.sender].push(id);
        totalPendingSuppliers++;

        emit SupplierApplied(id, msg.sender, _name, SupplierType(_type), block.timestamp);
        return id;
    }

    function approveSupplier(uint256 _supplierId) external onlyAdmin whenNotPaused {
        Supplier storage s = suppliers[_supplierId];
        require(s.id == _supplierId, "Unknown supplier");
        require(s.state == SupplierState.Pending, "Not pending");

        s.state = SupplierState.Active;
        s.registered = true;
        s.approvalTimestamp = block.timestamp;

        totalPendingSuppliers--;
        totalRegisteredSuppliers++;
        totalRegistrationFeesCollected += REGISTRATION_FEE;

        emit SupplierApproved(_supplierId, block.timestamp);
        emit ReputationChanged(_supplierId, 0, REPUTATION_START, "approval", block.timestamp);
    }

    function approveAllPending() external onlyAdmin whenNotPaused {
        for (uint256 id = 1; id <= nextSupplierId; id++) {
            Supplier storage s = suppliers[id];
            if (s.id == id && s.state == SupplierState.Pending) {
                s.state = SupplierState.Active;
                s.registered = true;
                s.approvalTimestamp = block.timestamp;
                totalPendingSuppliers--;
                totalRegisteredSuppliers++;
                totalRegistrationFeesCollected += REGISTRATION_FEE;
                emit SupplierApproved(id, block.timestamp);
                emit ReputationChanged(id, 0, REPUTATION_START, "approval", block.timestamp);
            }
        }
    }

    function rejectSupplier(uint256 _supplierId) external onlyAdmin whenNotPaused {
        Supplier storage s = suppliers[_supplierId];
        require(s.id == _supplierId, "Unknown supplier");
        require(s.state == SupplierState.Pending, "Not pending");

        s.state = SupplierState.Rejected;
        totalPendingSuppliers--;
        totalRejectedSuppliers++;

        (bool sent, ) = payable(s.wallet).call{value: REGISTRATION_FEE}("");
        require(sent, "Refund failed");
        emit SupplierRejected(_supplierId, REGISTRATION_FEE, block.timestamp);
    }

    // ============================================================
    // RESOURCES
    // ============================================================
    function registerResource(uint256 _supplierId, uint8 _resourceType, uint256 _quantity)
        external onlyOwnerOf(_supplierId) validResource(_resourceType) whenNotPaused
    {
        Supplier storage s = suppliers[_supplierId];
        require(s.state == SupplierState.Active, "Supplier not active");
        ResourceType rType = ResourceType(_resourceType);
        require(!s.resources[rType].registered, "Resource already registered");
        require(_quantity > 0, "Quantity must be > 0");

        s.resources[rType] = Resource({
            resourceType: rType,
            quantity: _quantity,
            lastUpdated: block.timestamp,
            registered: true,
            compliant: true
        });
        s.registeredResources.push(rType);

        emit ResourceRegistered(_supplierId, _resourceName(rType), block.timestamp);
    }

    function updateResourceQuantity(uint256 _supplierId, uint8 _resourceType, uint256 _quantity)
        external onlyOwnerOf(_supplierId) validResource(_resourceType) whenNotPaused
    {
        Supplier storage s = suppliers[_supplierId];
        require(s.state == SupplierState.Active, "Supplier not active");
        ResourceType rType = ResourceType(_resourceType);
        require(s.resources[rType].registered, "Resource not registered");
        require(_quantity > 0, "Quantity must be > 0");
        require(
            block.timestamp - s.resources[rType].lastUpdated <= COMPLIANCE_PERIOD,
            "Compliance window expired"
        );

        s.resources[rType].quantity = _quantity;
        s.resources[rType].lastUpdated = block.timestamp;
        s.resources[rType].compliant = true;

        // Track record
        s.compliantUpdates++;

        // Reward scales with trust tier
        uint8 tier = uint8(_trustTierOf(s));
        uint256 reward = 1;
        if (tier == 1) reward = 2;
        if (tier == 2) reward = 3;
        if (tier == 3) reward = 5;

        if (s.reputationScore < REPUTATION_MAX) {
            uint256 old = s.reputationScore;
            uint256 neu = old + reward;
            if (neu > REPUTATION_MAX) neu = REPUTATION_MAX;
            s.reputationScore = neu;

            emit ReputationChanged(_supplierId, old, neu, "compliance_update", block.timestamp);
        }

        emit ResourceUpdated(_supplierId, _resourceName(rType), _quantity, block.timestamp);
    }

    // ============================================================
    // COMPLIANCE
    // ============================================================
    function isResourceCompliant(uint256 _supplierId, uint8 _resourceType)
        public view validResource(_resourceType) returns (bool)
    {
        Supplier storage s = suppliers[_supplierId];
        ResourceType rType = ResourceType(_resourceType);
        if (!s.resources[rType].registered) return false;
        if (s.state != SupplierState.Active) return false;
        return (block.timestamp - s.resources[rType].lastUpdated) <= COMPLIANCE_PERIOD;
    }

    function remainingComplianceTime(uint256 _supplierId, uint8 _resourceType)
        external view validResource(_resourceType) returns (uint256)
    {
        Supplier storage s = suppliers[_supplierId];
        ResourceType rType = ResourceType(_resourceType);
        if (!s.resources[rType].registered) return 0;
        uint256 deadline = s.resources[rType].lastUpdated + COMPLIANCE_PERIOD;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    function checkAndDeactivate(uint256 _supplierId) external onlyAdmin whenNotPaused {
        Supplier storage s = suppliers[_supplierId];
        require(s.id == _supplierId, "Unknown supplier");
        require(s.state == SupplierState.Active, "Not active");

        uint256 missed = 0;
        for (uint256 i = 0; i < s.registeredResources.length; i++) {
            ResourceType rType = s.registeredResources[i];
            if ((block.timestamp - s.resources[rType].lastUpdated) > COMPLIANCE_PERIOD) {
                s.resources[rType].compliant = false;
                missed++;
            }
        }
        require(missed > 0, "Supplier still compliant");

        s.missedUpdates += missed;

        uint256 loss = _deactivationLoss(s);
        uint256 oldRep = s.reputationScore;
        uint256 newRep = oldRep > loss ? oldRep - loss : 0;
        s.reputationScore = newRep;

        s.state = SupplierState.Inactive;
        s.deactivationTimestamp = block.timestamp;
        s.timesDeactivated++;
        s.successfulCycles = 0;

        emit ReputationChanged(_supplierId, oldRep, newRep, "deactivation", block.timestamp);
        emit SupplierDeactivated(_supplierId, loss, block.timestamp);
    }

    // ============================================================
    // CHAINLINK AUTOMATION
    // ============================================================
    function checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData) {
        for (uint256 id = 1; id <= nextSupplierId; id++) {
            Supplier storage s = suppliers[id];
            if (s.id != id || s.state != SupplierState.Active) continue;
            for (uint256 j = 0; j < s.registeredResources.length; j++) {
                ResourceType rType = s.registeredResources[j];
                if (block.timestamp - s.resources[rType].lastUpdated > COMPLIANCE_PERIOD) {
                    return (true, abi.encode(id));
                }
            }
        }
        return (false, bytes(""));
    }

    function performUpkeep(bytes calldata performData) external override whenNotPaused {
        uint256 id = abi.decode(performData, (uint256));
        Supplier storage s = suppliers[id];
        require(s.id == id, "Unknown supplier");
        require(s.state == SupplierState.Active, "Not active");

        uint256 missed = 0;
        for (uint256 i = 0; i < s.registeredResources.length; i++) {
            ResourceType rType = s.registeredResources[i];
            if (block.timestamp - s.resources[rType].lastUpdated > COMPLIANCE_PERIOD) {
                s.resources[rType].compliant = false;
                missed++;
            }
        }
        require(missed > 0, "Still compliant");

        s.missedUpdates += missed;
        uint256 loss = _deactivationLoss(s);
        uint256 oldRep = s.reputationScore;
        uint256 newRep = oldRep > loss ? oldRep - loss : 0;
        s.reputationScore = newRep;

        s.state = SupplierState.Inactive;
        s.deactivationTimestamp = block.timestamp;
        s.timesDeactivated++;
        s.successfulCycles = 0;

        emit ReputationChanged(id, oldRep, newRep, "deactivation", block.timestamp);
        emit SupplierDeactivated(id, loss, block.timestamp);
    }

    // ============================================================
    // PENALTY
    // ============================================================
    function _penaltyForDays(uint256 _daysInactive) internal pure returns (uint256) {
        if (_daysInactive <= 1) return PENALTY_RATE_LOW;
        if (_daysInactive <= 7) return PENALTY_RATE_MID;
        if (_daysInactive <= 21) return PENALTY_RATE_HIGH;
        return PENALTY_RATE_MAX;
    }

    function calculatePenalty(uint256 _supplierId) public view returns (uint256) {
        Supplier storage s = suppliers[_supplierId];
        require(s.id == _supplierId, "Unknown supplier");
        require(s.state == SupplierState.Inactive, "Not inactive");
        return _penaltyForDays((block.timestamp - s.deactivationTimestamp) / 1 days);
    }

    function payPenaltyAndReactivate(uint256 _supplierId)
        external payable onlyOwnerOf(_supplierId) whenNotPaused
    {
        Supplier storage s = suppliers[_supplierId];
        require(s.state == SupplierState.Inactive, "Not inactive");

        uint256 daysInactive = (block.timestamp - s.deactivationTimestamp) / 1 days;
        uint256 penalty = _penaltyForDays(daysInactive);
        require(msg.value == penalty, "Incorrect penalty amount");

        s.lastDeactivationDays = daysInactive;

        // Additional relief if paid late
        uint256 lateRelief = (block.timestamp - s.deactivationTimestamp > REPUTATION_PROMPT_WINDOW)
            ? REPUTATION_PROMPT_RELIEF : 0;
        if (lateRelief > 0 && s.reputationScore > lateRelief) {
            uint256 old = s.reputationScore;
            s.reputationScore = old - lateRelief;
            emit ReputationChanged(_supplierId, old, s.reputationScore, "late_penalty_payment", block.timestamp);
        }

        s.escrowAmount += msg.value;
        s.escrowStartTime = block.timestamp;
        totalEscrowHeld += msg.value;
        s.totalPenaltiesPaid += msg.value;

        s.state = SupplierState.Active;
        for (uint256 i = 0; i < s.registeredResources.length; i++) {
            ResourceType rType = s.registeredResources[i];
            s.resources[rType].lastUpdated = block.timestamp;
            s.resources[rType].compliant = true;
        }

        emit PenaltyPaid(_supplierId, msg.value, block.timestamp);
        emit EscrowDeposited(_supplierId, msg.value, block.timestamp + ESCROW_PERIOD, block.timestamp);
        emit SupplierReactivated(_supplierId, block.timestamp);
    }

    // ============================================================
    // ESCROW
    // ============================================================
    function releaseEscrow(uint256 _supplierId) external {
        Supplier storage s = suppliers[_supplierId];
        require(s.id == _supplierId, "Unknown supplier");
        require(s.escrowAmount > 0, "No escrow");
        require(block.timestamp >= s.escrowStartTime + ESCROW_PERIOD, "Period not elapsed");
        require(s.state == SupplierState.Active, "Not active");

        uint256 amount = s.escrowAmount;
        s.escrowAmount = 0;
        s.escrowStartTime = 0;
        totalEscrowHeld -= amount;
        totalEscrowRefunded += amount;

        s.successfulCycles++;

        (bool sent, ) = payable(s.wallet).call{value: amount}("");
        require(sent, "Refund failed");
        emit EscrowReleased(_supplierId, amount, block.timestamp);
    }

    function forfeitEscrow(uint256 _supplierId) external {
        Supplier storage s = suppliers[_supplierId];
        require(s.id == _supplierId, "Unknown supplier");
        require(s.escrowAmount > 0, "No escrow");
        require(block.timestamp < s.escrowStartTime + ESCROW_PERIOD, "Period elapsed");
        require(s.state != SupplierState.Active, "Active");

        uint256 amount = s.escrowAmount;
        s.escrowAmount = 0;
        s.escrowStartTime = 0;
        totalEscrowHeld -= amount;
        totalPenaltiesCollected += amount;

        (bool sent, ) = payable(aidFundAddress).call{value: amount}("");
        require(sent, "Aid fund failed");
        emit EscrowForfeited(_supplierId, amount, aidFundAddress, block.timestamp);
    }

    function getEscrowInfo(uint256 _supplierId)
        external view returns (uint256 balance, uint256 releaseTime, bool releasable, bool forfeitEligible)
    {
        Supplier storage s = suppliers[_supplierId];
        balance = s.escrowAmount;
        if (balance == 0) return (0, 0, false, false);
        releaseTime = s.escrowStartTime + ESCROW_PERIOD;
        bool elapsed = block.timestamp >= releaseTime;
        bool active = s.state == SupplierState.Active;
        releasable = elapsed && active;
        forfeitEligible = !elapsed && !active;
    }

    // ============================================================
    // REPUTATION MATH
    // ============================================================

    /// @dev Compliance ratio in basis points (0..10000). 10000 = perfect.
    function _complianceRatioBps(Supplier storage s) internal view returns (uint256) {
        uint256 total = s.compliantUpdates + s.missedUpdates;
        if (total == 0) return 0;
        return (s.compliantUpdates * 10000) / total;
    }

    /// @dev Trust tier based on successful cycles.
    function _trustTierOf(Supplier storage s) internal view returns (TrustTier) {
        if (s.successfulCycles >= TRUST_ESTABLISHED) return TrustTier.Established;
        if (s.successfulCycles >= TRUST_TRUSTED)     return TrustTier.Trusted;
        if (s.successfulCycles >= TRUST_DEVELOPING)  return TrustTier.Developing;
        return TrustTier.New;
    }

    /// @dev Reputation loss for one deactivation, weighted by track record and trust.
    function _deactivationLoss(Supplier storage s) internal view returns (uint256) {
        uint256 ratio = _complianceRatioBps(s);
        uint256 trackMultiplierBps = 20000 - ratio;   // 20000..10000

        TrustTier tier = _trustTierOf(s);
        uint256 trustMultiplierBps;
        if (tier == TrustTier.Established) trustMultiplierBps = 5000;
        else if (tier == TrustTier.Trusted) trustMultiplierBps = 7000;
        else if (tier == TrustTier.Developing) trustMultiplierBps = 10000;
        else trustMultiplierBps = 15000;

        uint256 loss = (REPUTATION_PENALTY_BASE * trackMultiplierBps * trustMultiplierBps) / 100000000;
        if (loss > REPUTATION_PENALTY_CAP) loss = REPUTATION_PENALTY_CAP;
        if (loss == 0) loss = 1;
        return loss;
    }

    // ============================================================
    // SUPPLIER VIEWS
    // ============================================================
    function getSupplier(uint256 _supplierId)
        external view returns (
            uint256 id,
            address wallet,
            string memory name,
            uint8 supplierType,
            uint8 state,
            uint256 reputationScore,
            uint256 totalPenaltiesPaid,
            uint256 timesDeactivated,
            uint256 resourceCount,
            uint256 lastDeactivationDays,
            uint256 compliantUpdates,
            uint256 missedUpdates,
            uint256 successfulCycles,
            uint8 trustTier
        )
    {
        Supplier storage s = suppliers[_supplierId];
        return (
            s.id,
            s.wallet,
            s.name,
            uint8(s.supplierType),
            uint8(s.state),
            s.reputationScore,
            s.totalPenaltiesPaid,
            s.timesDeactivated,
            s.registeredResources.length,
            s.lastDeactivationDays,
            s.compliantUpdates,
            s.missedUpdates,
            s.successfulCycles,
            uint8(_trustTierOf(s))
        );
    }

    function getComplianceRatio(uint256 _supplierId) external view returns (uint256) {
        return _complianceRatioBps(suppliers[_supplierId]);
    }

    function getTrustTier(uint256 _supplierId) external view returns (uint8) {
        return uint8(_trustTierOf(suppliers[_supplierId]));
    }

    function predictDeactivationPenalty(uint256 _supplierId) external view returns (uint256) {
        return _deactivationLoss(suppliers[_supplierId]);
    }

    function getReputationTier(uint256 _supplierId) external view returns (string memory) {
        uint256 score = suppliers[_supplierId].reputationScore;
        if (score >= 180) return "Platinum";
        if (score >= 150) return "Gold";
        if (score >= 120) return "Silver";
        if (score >= 80)  return "Bronze";
        return "Probation";
    }

    function getLastDeactivationDays(uint256 _supplierId) external view returns (uint256) {
        return suppliers[_supplierId].lastDeactivationDays;
    }

    function getMySupplierIds() external view returns (uint256[] memory) { return ownedSupplierIds[msg.sender]; }
    function getSupplierIdsOf(address _who) external view returns (uint256[] memory) { return ownedSupplierIds[_who]; }

    function getAllSupplierIds() external view returns (uint256[] memory) {
        uint256[] memory ids = new uint256[](nextSupplierId);
        for (uint256 i = 0; i < nextSupplierId; i++) ids[i] = i + 1;
        return ids;
    }

    function getSupplierResourceQuantity(uint256 _supplierId, uint8 _resourceType)
        external view validResource(_resourceType) returns (uint256)
    {
        return suppliers[_supplierId].resources[ResourceType(_resourceType)].quantity;
    }

    function getSupplierResourceLastUpdated(uint256 _supplierId, uint8 _resourceType)
        external view validResource(_resourceType) returns (uint256)
    {
        return suppliers[_supplierId].resources[ResourceType(_resourceType)].lastUpdated;
    }

    // ============================================================
    // AGGREGATES
    // ============================================================
    function getStats() external view returns (
        uint256 total, uint256 active, uint256 inactive, uint256 pending, uint256 rejected,
        uint256 fundsFromRegistration, uint256 fundsFromPenalties, uint256 escrowHeld, uint256 escrowRefunded
    ) {
        uint256 a; uint256 i_; uint256 p; uint256 r;
        for (uint256 id = 1; id <= nextSupplierId; id++) {
            Supplier storage s = suppliers[id];
            if (s.id != id) continue;
            if (s.state == SupplierState.Active) a++;
            else if (s.state == SupplierState.Inactive) i_++;
            else if (s.state == SupplierState.Pending) p++;
            else if (s.state == SupplierState.Rejected) r++;
        }
        return (totalRegisteredSuppliers, a, i_, p, r,
                totalRegistrationFeesCollected, totalPenaltiesCollected, totalEscrowHeld, totalEscrowRefunded);
    }

    function getTotalFundsCollected() external view returns (uint256) {
        return totalRegistrationFeesCollected + totalPenaltiesCollected;
    }

    function getTypeCounts() external view returns (uint256[] memory) {
        uint256[] memory counts = new uint256[](9);
        for (uint256 id = 1; id <= nextSupplierId; id++) {
            Supplier storage s = suppliers[id];
            if (s.id != id) continue;
            if (s.state == SupplierState.Rejected) continue;
            counts[uint256(s.supplierType)]++;
        }
        return counts;
    }

    function getTopPerformers(uint256 _limit) external view returns (uint256[] memory ids, uint256[] memory scores) {
        uint256 n = 0;
        for (uint256 id = 1; id <= nextSupplierId; id++) {
            Supplier storage s = suppliers[id];
            if (s.id == id && s.state == SupplierState.Active) n++;
        }
        uint256 take = n < _limit ? n : _limit;
        ids = new uint256[](take);
        scores = new uint256[](take);
        for (uint256 k = 0; k < take; k++) {
            uint256 bestId = 0;
            uint256 bestScore = 0;
            for (uint256 id = 1; id <= nextSupplierId; id++) {
                Supplier storage s = suppliers[id];
                if (s.id != id || s.state != SupplierState.Active) continue;
                bool used = false;
                for (uint256 m = 0; m < k; m++) if (ids[m] == id) { used = true; break; }
                if (used) continue;
                if (s.reputationScore > bestScore) { bestScore = s.reputationScore; bestId = id; }
            }
            if (bestId == 0) break;
            ids[k] = bestId;
            scores[k] = bestScore;
        }
    }

    function getFrequentDefaulters(uint256 _limit) external view returns (uint256[] memory ids, uint256[] memory amounts) {
        uint256 n = 0;
        for (uint256 id = 1; id <= nextSupplierId; id++) {
            Supplier storage s = suppliers[id];
            if (s.id == id && s.totalPenaltiesPaid > 0) n++;
        }
        uint256 take = n < _limit ? n : _limit;
        ids = new uint256[](take);
        amounts = new uint256[](take);
        for (uint256 k = 0; k < take; k++) {
            uint256 worstId = 0;
            uint256 worstAmt = 0;
            for (uint256 id = 1; id <= nextSupplierId; id++) {
                Supplier storage s = suppliers[id];
                if (s.id != id || s.totalPenaltiesPaid == 0) continue;
                bool used = false;
                for (uint256 m = 0; m < k; m++) if (ids[m] == id) { used = true; break; }
                if (used) continue;
                if (s.totalPenaltiesPaid > worstAmt) { worstAmt = s.totalPenaltiesPaid; worstId = id; }
            }
            if (worstId == 0) break;
            ids[k] = worstId;
            amounts[k] = worstAmt;
        }
    }

    function getAggregateResourceQuantity(uint8 _resourceType)
        external view validResource(_resourceType) returns (uint256)
    {
        ResourceType rType = ResourceType(_resourceType);
        uint256 total;
        for (uint256 id = 1; id <= nextSupplierId; id++) {
            Supplier storage s = suppliers[id];
            if (s.id != id) continue;
            total += s.resources[rType].quantity;
        }
        return total;
    }

    function _resourceName(ResourceType _type) internal pure returns (string memory) {
        if (_type == ResourceType.Water) return "Water";
        if (_type == ResourceType.Clothing) return "Clothing";
        if (_type == ResourceType.Medicine) return "Medicine";
        return "Food";
    }
}