// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

/**
 * @title SupplierCompliance
 * @dev Blockchain-based Supplier Registration, Resource Management, and Compliance System.
 *      Includes escrow-backed penalties, a reputation score for each supplier, and
 *      an emergency pause mechanism for the compliance officer.
 */
contract SupplierCompliance is AutomationCompatibleInterface {
    // ============================================================
    // CONSTANTS
    // ============================================================
    uint256 public constant REGISTRATION_FEE = 100000 wei;
    uint256 public constant COMPLIANCE_PERIOD = 1 days;
    uint256 public constant PENALTY_RATE_LOW = 200000 wei;
    uint256 public constant PENALTY_RATE_MID = 400000 wei;
    uint256 public constant PENALTY_RATE_HIGH = 800000 wei;
    uint256 public constant PENALTY_RATE_MAX = 1000000 wei;
    uint256 public constant ESCROW_PERIOD = 30 days;

    // Reputation constants
    uint256 public constant REPUTATION_START = 100;
    uint256 public constant REPUTATION_MAX = 200;
    uint256 public constant REPUTATION_GAIN_PER_UPDATE = 1;
    uint256 public constant REPUTATION_PENALTY_FULL = 20;
    uint256 public constant REPUTATION_PENALTY_PROMPT = 10;
    uint256 public constant REPUTATION_PROMPT_WINDOW = 1 hours;

    // ============================================================
    // ENUMS
    // ============================================================
    enum ResourceType { Water, Clothing, Medicine, Food }
    enum SupplierStatus { Inactive, Active }

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
        address wallet;
        uint256 registrationTimestamp;
        uint256 deactivationTimestamp;
        bool verified;
        bool active;
        bool registered;
        uint256 totalPenaltiesPaid;
        uint256 reputationScore;
        ResourceType[] registeredResources;
        mapping(ResourceType => Resource) resources;
    }

    // ============================================================
    // STATE VARIABLES
    // ============================================================
    mapping(address => Supplier) private suppliers;
    address[] private supplierAddresses;
    uint256 public totalPenaltiesCollected;
    uint256 public totalRegisteredSuppliers;

    mapping(address => uint256) public escrowBalance;
    mapping(address => uint256) public escrowStartTime;
    uint256 public totalEscrowHeld;
    address public aidFundAddress;

    address public immutable owner;

    /// @notice Emergency pause. When true, all state-changing operations revert.
    bool public paused;

    // ============================================================
    // CONSTRUCTOR
    // ============================================================
    constructor() {
        owner = msg.sender;
        aidFundAddress = msg.sender;
        paused = false;
    }

    // ============================================================
    // EVENTS
    // ============================================================
    event SupplierRegistered(address indexed supplier, uint256 timestamp);
    event ResourceRegistered(address indexed supplier, string resource);
    event ResourceUpdated(address indexed supplier, string resource, uint256 quantity);
    event SupplierDeactivated(address indexed supplier, uint256 timestamp);
    event PenaltyPaid(address indexed supplier, uint256 amount);
    event SupplierReactivated(address indexed supplier, uint256 timestamp);
    event EscrowDeposited(address indexed supplier, uint256 amount, uint256 releaseTime);
    event EscrowReleased(address indexed supplier, uint256 amount);
    event EscrowForfeited(address indexed supplier, uint256 amount, address recipient);
    event AidFundAddressUpdated(address indexed newAddress);
    event ReputationChanged(address indexed supplier, uint256 oldScore, uint256 newScore, string reason);
    event ContractPaused(address indexed by, uint256 timestamp);
    event ContractUnpaused(address indexed by, uint256 timestamp);

    // ============================================================
    // MODIFIERS
    // ============================================================
    modifier onlyRegistered() {
        require(suppliers[msg.sender].registered, "Supplier not registered");
        _;
    }

    modifier onlyActive() {
        require(suppliers[msg.sender].registered, "Supplier not registered");
        require(suppliers[msg.sender].active, "Supplier is inactive");
        _;
    }

    modifier validResource(uint8 _resourceType) {
        require(_resourceType <= uint8(ResourceType.Food), "Invalid resource type");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only compliance officer can call this");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    // ============================================================
    // SUPPLIER REGISTRATION
    // ============================================================
    function registerSupplier() external payable whenNotPaused {
        require(!suppliers[msg.sender].registered, "Supplier already registered");
        require(msg.value == REGISTRATION_FEE, "Incorrect registration fee");

        Supplier storage s = suppliers[msg.sender];
        s.wallet = msg.sender;
        s.registrationTimestamp = block.timestamp;
        s.verified = true;
        s.active = true;
        s.registered = true;
        s.reputationScore = REPUTATION_START;

        supplierAddresses.push(msg.sender);
        totalRegisteredSuppliers++;

        emit SupplierRegistered(msg.sender, block.timestamp);
        emit ReputationChanged(msg.sender, 0, REPUTATION_START, "registration");
    }

    // ============================================================
    // RESOURCE REGISTRATION
    // ============================================================
    function registerResource(uint8 _resourceType, uint256 _quantity)
        external
        onlyActive
        validResource(_resourceType)
        whenNotPaused
    {
        ResourceType rType = ResourceType(_resourceType);
        Supplier storage s = suppliers[msg.sender];
        require(!s.resources[rType].registered, "Resource already registered");
        require(_quantity > 0, "Quantity must be greater than zero");

        s.resources[rType] = Resource({
            resourceType: rType,
            quantity: _quantity,
            lastUpdated: block.timestamp,
            registered: true,
            compliant: true
        });

        s.registeredResources.push(rType);

        emit ResourceRegistered(msg.sender, _resourceName(rType));
    }

    // ============================================================
    // QUANTITY MANAGEMENT
    // ============================================================
    function updateResourceQuantity(uint8 _resourceType, uint256 _quantity)
        external
        onlyActive
        validResource(_resourceType)
        whenNotPaused
    {
        ResourceType rType = ResourceType(_resourceType);
        Supplier storage s = suppliers[msg.sender];
        require(s.resources[rType].registered, "Resource not registered");
        require(_quantity > 0, "Quantity must be greater than zero");

        s.resources[rType].quantity = _quantity;
        s.resources[rType].lastUpdated = block.timestamp;
        s.resources[rType].compliant = true;

        // Reward consistent updates with a small reputation gain.
        if (s.reputationScore < REPUTATION_MAX) {
            uint256 oldScore = s.reputationScore;
            uint256 newScore = oldScore + REPUTATION_GAIN_PER_UPDATE;
            if (newScore > REPUTATION_MAX) newScore = REPUTATION_MAX;
            s.reputationScore = newScore;
            emit ReputationChanged(msg.sender, oldScore, newScore, "compliance_update");
        }

        emit ResourceUpdated(msg.sender, _resourceName(rType), _quantity);
    }

    // ============================================================
    // COMPLIANCE MONITORING
    // ============================================================
    function isResourceCompliant(address _supplier, uint8 _resourceType)
        public
        view
        validResource(_resourceType)
        returns (bool)
    {
        Supplier storage s = suppliers[_supplier];
        ResourceType rType = ResourceType(_resourceType);
        if (!s.resources[rType].registered) return false;
        if (!s.active) return false;
        return (block.timestamp - s.resources[rType].lastUpdated) <= COMPLIANCE_PERIOD;
    }

    function remainingComplianceTime(address _supplier, uint8 _resourceType)
        external
        view
        validResource(_resourceType)
        returns (uint256)
    {
        Supplier storage s = suppliers[_supplier];
        ResourceType rType = ResourceType(_resourceType);
        if (!s.resources[rType].registered) return 0;
        uint256 deadline = s.resources[rType].lastUpdated + COMPLIANCE_PERIOD;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    function checkAndDeactivate(address _supplier) external onlyOwner whenNotPaused {
        Supplier storage s = suppliers[_supplier];
        require(s.registered, "Supplier not registered");
        require(s.active, "Supplier already inactive");

        bool nonCompliant = false;
        for (uint256 i = 0; i < s.registeredResources.length; i++) {
            ResourceType rType = s.registeredResources[i];
            if ((block.timestamp - s.resources[rType].lastUpdated) > COMPLIANCE_PERIOD) {
                s.resources[rType].compliant = false;
                nonCompliant = true;
            }
        }

        if (nonCompliant) {
            uint256 oldRep = s.reputationScore;
            uint256 newRep = oldRep > REPUTATION_PENALTY_FULL ? oldRep - REPUTATION_PENALTY_FULL : 0;
            s.reputationScore = newRep;

            s.active = false;
            s.deactivationTimestamp = block.timestamp;

            emit ReputationChanged(_supplier, oldRep, newRep, "deactivation");
            emit SupplierDeactivated(_supplier, block.timestamp);
        }
    }

    // ============================================================
    // CHAINLINK AUTOMATION
    // ============================================================
    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        for (uint256 i = 0; i < supplierAddresses.length; i++) {
            address supplierAddr = supplierAddresses[i];
            Supplier storage s = suppliers[supplierAddr];

            if (!s.active) continue;

            for (uint256 j = 0; j < s.registeredResources.length; j++) {
                ResourceType rType = s.registeredResources[j];
                if (block.timestamp - s.resources[rType].lastUpdated > COMPLIANCE_PERIOD) {
                    return (true, abi.encode(supplierAddr));
                }
            }
        }
        return (false, bytes(""));
    }

    function performUpkeep(bytes calldata performData) external override whenNotPaused {
        address supplierAddr = abi.decode(performData, (address));

        Supplier storage s = suppliers[supplierAddr];
        require(s.registered, "Supplier not registered");
        require(s.active, "Supplier already inactive");

        bool nonCompliant = false;
        for (uint256 i = 0; i < s.registeredResources.length; i++) {
            ResourceType rType = s.registeredResources[i];
            if (block.timestamp - s.resources[rType].lastUpdated > COMPLIANCE_PERIOD) {
                s.resources[rType].compliant = false;
                nonCompliant = true;
            }
        }

        require(nonCompliant, "Supplier is still compliant");

        uint256 oldRep = s.reputationScore;
        uint256 newRep = oldRep > REPUTATION_PENALTY_FULL ? oldRep - REPUTATION_PENALTY_FULL : 0;
        s.reputationScore = newRep;

        s.active = false;
        s.deactivationTimestamp = block.timestamp;

        emit ReputationChanged(supplierAddr, oldRep, newRep, "deactivation");
        emit SupplierDeactivated(supplierAddr, block.timestamp);
    }

    // ============================================================
    // PENALTY CALCULATION & REACTIVATION
    // ============================================================
    function calculatePenalty(address _supplier) public view returns (uint256) {
        Supplier storage s = suppliers[_supplier];
        require(s.registered, "Supplier not registered");
        require(!s.active, "Supplier is active");

        uint256 nonCompliantDays = (block.timestamp - s.deactivationTimestamp) / 1 days;

        if (nonCompliantDays <= 1) {
            return PENALTY_RATE_LOW;
        } else if (nonCompliantDays <= 7) {
            return PENALTY_RATE_MID;
        } else if (nonCompliantDays <= 21) {
            return PENALTY_RATE_HIGH;
        } else {
            return PENALTY_RATE_MAX;
        }
    }

    function payPenaltyAndReactivate() external payable whenNotPaused {
        Supplier storage s = suppliers[msg.sender];
        require(s.registered, "Supplier not registered");
        require(!s.active, "Supplier is active");

        uint256 penalty = calculatePenalty(msg.sender);
        require(msg.value == penalty, "Incorrect penalty amount");

        // Prompt-payment bonus: only deduct half reputation if paid within 1 hour.
        uint256 reputationPenalty = (block.timestamp - s.deactivationTimestamp <= REPUTATION_PROMPT_WINDOW)
            ? REPUTATION_PENALTY_PROMPT
            : REPUTATION_PENALTY_FULL;

        uint256 oldRep = s.reputationScore;
        uint256 newRep = oldRep > reputationPenalty ? oldRep - reputationPenalty : 0;
        s.reputationScore = newRep;

        // Route payment into escrow.
        escrowBalance[msg.sender] += msg.value;
        escrowStartTime[msg.sender] = block.timestamp;
        totalEscrowHeld += msg.value;

        s.totalPenaltiesPaid += msg.value;
        s.active = true;
        s.deactivationTimestamp = 0;

        for (uint256 i = 0; i < s.registeredResources.length; i++) {
            ResourceType rType = s.registeredResources[i];
            s.resources[rType].lastUpdated = block.timestamp;
            s.resources[rType].compliant = true;
        }

        emit ReputationChanged(msg.sender, oldRep, newRep, "penalty_paid");
        emit PenaltyPaid(msg.sender, msg.value);
        emit EscrowDeposited(msg.sender, msg.value, block.timestamp + ESCROW_PERIOD);
        emit SupplierReactivated(msg.sender, block.timestamp);
    }

    // ============================================================
    // ESCROW MANAGEMENT
    // ============================================================
    function releaseEscrow(address _supplier) external {
        uint256 balance = escrowBalance[_supplier];
        require(balance > 0, "No escrow to release");

        uint256 startTime = escrowStartTime[_supplier];
        require(block.timestamp >= startTime + ESCROW_PERIOD, "Escrow period not yet elapsed");

        Supplier storage s = suppliers[_supplier];
        require(s.active, "Supplier is inactive - escrow forfeit eligible");

        escrowBalance[_supplier] = 0;
        escrowStartTime[_supplier] = 0;
        totalEscrowHeld -= balance;

        (bool sent, ) = payable(_supplier).call{value: balance}("");
        require(sent, "Refund transfer failed");

        emit EscrowReleased(_supplier, balance);
    }

    function forfeitEscrow(address _supplier) external {
        uint256 balance = escrowBalance[_supplier];
        require(balance > 0, "No escrow to forfeit");

        uint256 startTime = escrowStartTime[_supplier];
        require(block.timestamp < startTime + ESCROW_PERIOD, "Escrow period elapsed - use releaseEscrow");

        Supplier storage s = suppliers[_supplier];
        require(!s.active, "Supplier is active - cannot forfeit");

        escrowBalance[_supplier] = 0;
        escrowStartTime[_supplier] = 0;
        totalEscrowHeld -= balance;
        totalPenaltiesCollected += balance;

        (bool sent, ) = payable(aidFundAddress).call{value: balance}("");
        require(sent, "Aid fund transfer failed");

        emit EscrowForfeited(_supplier, balance, aidFundAddress);
    }

    function setAidFundAddress(address _newAddress) external onlyOwner {
        require(_newAddress != address(0), "Invalid address");
        aidFundAddress = _newAddress;
        emit AidFundAddressUpdated(_newAddress);
    }

    function getEscrowInfo(address _supplier)
        external
        view
        returns (uint256 balance, uint256 releaseTime, bool releasable, bool forfeitEligible)
    {
        balance = escrowBalance[_supplier];
        if (balance == 0) return (0, 0, false, false);

        uint256 start = escrowStartTime[_supplier];
        releaseTime = start + ESCROW_PERIOD;
        bool windowElapsed = block.timestamp >= releaseTime;
        bool supplierActive = suppliers[_supplier].active;

        releasable = windowElapsed && supplierActive;
        forfeitEligible = !windowElapsed && !supplierActive;
    }

    // ============================================================
    // EMERGENCY PAUSE
    // ============================================================
    /**
     * @notice Pause all state-changing operations.
     * @dev Restricted to the compliance officer. View functions continue to work.
     */
    function pause() external onlyOwner {
        require(!paused, "Already paused");
        paused = true;
        emit ContractPaused(msg.sender, block.timestamp);
    }

    /**
     * @notice Resume normal operation.
     */
    function unpause() external onlyOwner {
        require(paused, "Not paused");
        paused = false;
        emit ContractUnpaused(msg.sender, block.timestamp);
    }

    // ============================================================
    // REPUTATION VIEWS
    // ============================================================
    function getSupplierReputation(address _supplier) external view returns (uint256) {
        return suppliers[_supplier].reputationScore;
    }

    function getReputationTier(address _supplier) external view returns (string memory) {
        uint256 score = suppliers[_supplier].reputationScore;
        if (score >= 180) return "Platinum";
        if (score >= 150) return "Gold";
        if (score >= 120) return "Silver";
        if (score >= 80)  return "Bronze";
        return "Probation";
    }

    // ============================================================
    // SUPPLIER STATISTICS
    // ============================================================
    function getTotalRegisteredSuppliers() external view returns (uint256) {
        return totalRegisteredSuppliers;
    }

    function getAllSupplierAddresses() external view returns (address[] memory) {
        return supplierAddresses;
    }

    function getActiveSuppliersCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < supplierAddresses.length; i++) {
            if (suppliers[supplierAddresses[i]].active) count++;
        }
        return count;
    }

    function getInactiveSuppliersCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < supplierAddresses.length; i++) {
            if (!suppliers[supplierAddresses[i]].active) count++;
        }
        return count;
    }

    function getVerifiedSuppliersCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < supplierAddresses.length; i++) {
            if (suppliers[supplierAddresses[i]].verified) count++;
        }
        return count;
    }

    function getSupplierInfo(address _supplier)
        external
        view
        returns (
            address wallet,
            uint256 registrationTimestamp,
            bool verified,
            bool active,
            uint256 totalPenaltiesPaid,
            uint256 resourceCount
        )
    {
        Supplier storage s = suppliers[_supplier];
        return (
            s.wallet,
            s.registrationTimestamp,
            s.verified,
            s.active,
            s.totalPenaltiesPaid,
            s.registeredResources.length
        );
    }

    function getSupplierResourceQuantity(address _supplier, uint8 _resourceType)
        external
        view
        validResource(_resourceType)
        returns (uint256)
    {
        return suppliers[_supplier].resources[ResourceType(_resourceType)].quantity;
    }

    function getSupplierResourceLastUpdated(address _supplier, uint8 _resourceType)
        external
        view
        validResource(_resourceType)
        returns (uint256)
    {
        return suppliers[_supplier].resources[ResourceType(_resourceType)].lastUpdated;
    }

    // ============================================================
    // RESOURCE STATISTICS
    // ============================================================
    function getSuppliersCountForResource(uint8 _resourceType)
        external
        view
        validResource(_resourceType)
        returns (uint256)
    {
        ResourceType rType = ResourceType(_resourceType);
        uint256 count = 0;
        for (uint256 i = 0; i < supplierAddresses.length; i++) {
            if (suppliers[supplierAddresses[i]].resources[rType].registered) count++;
        }
        return count;
    }

    function getAggregateResourceQuantity(uint8 _resourceType)
        external
        view
        validResource(_resourceType)
        returns (uint256)
    {
        ResourceType rType = ResourceType(_resourceType);
        uint256 total = 0;
        for (uint256 i = 0; i < supplierAddresses.length; i++) {
            total += suppliers[supplierAddresses[i]].resources[rType].quantity;
        }
        return total;
    }

    function getCompliantResourceCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < supplierAddresses.length; i++) {
            Supplier storage s = suppliers[supplierAddresses[i]];
            if (!s.active) continue;
            for (uint256 j = 0; j < s.registeredResources.length; j++) {
                ResourceType rType = s.registeredResources[j];
                if ((block.timestamp - s.resources[rType].lastUpdated) <= COMPLIANCE_PERIOD) {
                    count++;
                }
            }
        }
        return count;
    }

    function getNonCompliantResourceCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < supplierAddresses.length; i++) {
            Supplier storage s = suppliers[supplierAddresses[i]];
            for (uint256 j = 0; j < s.registeredResources.length; j++) {
                ResourceType rType = s.registeredResources[j];
                if (!s.active || (block.timestamp - s.resources[rType].lastUpdated) > COMPLIANCE_PERIOD) {
                    count++;
                }
            }
        }
        return count;
    }

    function getTotalPenaltiesCollected() external view returns (uint256) {
        return totalPenaltiesCollected;
    }

    function getTotalEscrowHeld() external view returns (uint256) {
        return totalEscrowHeld;
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================
    function _resourceName(ResourceType _type) internal pure returns (string memory) {
        if (_type == ResourceType.Water) return "Water";
        if (_type == ResourceType.Clothing) return "Clothing";
        if (_type == ResourceType.Medicine) return "Medicine";
        return "Food";
    }
}