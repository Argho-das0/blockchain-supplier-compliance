// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SupplierCompliance
 * @dev Blockchain-based Supplier Registration, Resource Management, and Compliance System
 * @notice Manages suppliers, humanitarian resources, one-day compliance mechanism,
 *         penalties, and statistics on an Ethereum-compatible blockchain.
 */
contract SupplierCompliance {
    // ============================================================
    // CONSTANTS
    // ============================================================
    uint256 public constant REGISTRATION_FEE = 100000 wei;
    uint256 public constant COMPLIANCE_PERIOD = 1 days; // one-day compliance mechanism
    uint256 public constant PENALTY_RATE_LOW = 200000 wei;   // 0-1 days
    uint256 public constant PENALTY_RATE_MID = 400000 wei;   // 2-7 days
    uint256 public constant PENALTY_RATE_HIGH = 800000 wei;  // 8-21 days
    uint256 public constant PENALTY_RATE_MAX = 1000000 wei;  // >21 days

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
        uint256 lastUpdated;      // timestamp of last quantity update
        bool registered;
        bool compliant;          // whether currently compliant
    }

    struct Supplier {
        address wallet;
        uint256 registrationTimestamp;
        uint256 deactivationTimestamp;
        bool verified;
        bool active;
        bool registered;
        uint256 totalPenaltiesPaid;
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

    /// @notice The compliance officer — the wallet that deployed the contract.
    ///         Only this address may call checkAndDeactivate().
    address public immutable owner;

    // ============================================================
    // CONSTRUCTOR
    // ============================================================
    constructor() {
        owner = msg.sender;
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

    // ============================================================
    // SUPPLIER REGISTRATION
    // ============================================================
    /**
     * @notice Register a new supplier by paying the fixed registration fee.
     */
    function registerSupplier() external payable {
        require(!suppliers[msg.sender].registered, "Supplier already registered");
        require(msg.value == REGISTRATION_FEE, "Incorrect registration fee");

        Supplier storage s = suppliers[msg.sender];
        s.wallet = msg.sender;
        s.registrationTimestamp = block.timestamp;
        s.verified = true;
        s.active = true;
        s.registered = true;

        supplierAddresses.push(msg.sender);
        totalRegisteredSuppliers++;

        emit SupplierRegistered(msg.sender, block.timestamp);
    }

    // ============================================================
    // RESOURCE REGISTRATION
    // ============================================================
    /**
     * @notice Register a predefined resource with an initial quantity.
     */
    function registerResource(uint8 _resourceType, uint256 _quantity)
        external
        onlyActive
        validResource(_resourceType)
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
    /**
     * @notice Update the quantity of a registered resource.
     *         Refreshes compliance timestamp.
     */
    function updateResourceQuantity(uint8 _resourceType, uint256 _quantity)
        external
        onlyActive
        validResource(_resourceType)
    {
        ResourceType rType = ResourceType(_resourceType);
        Supplier storage s = suppliers[msg.sender];
        require(s.resources[rType].registered, "Resource not registered");
        require(_quantity > 0, "Quantity must be greater than zero");

        s.resources[rType].quantity = _quantity;
        s.resources[rType].lastUpdated = block.timestamp;
        s.resources[rType].compliant = true;

        emit ResourceUpdated(msg.sender, _resourceName(rType), _quantity);
    }

    // ============================================================
    // COMPLIANCE MONITORING
    // ============================================================
    /**
     * @notice Check whether a supplier's resource is compliant.
     */
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

    /**
     * @notice Returns remaining compliance time in seconds for a resource.
     */
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

    /**
     * @notice Identify and deactivate a non-compliant supplier.
     * @dev Restricted to the compliance officer (the contract owner) to prevent
     *      unauthorized parties from triggering deactivations.
     */
    function checkAndDeactivate(address _supplier) external onlyOwner {
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
            s.active = false;
            s.deactivationTimestamp = block.timestamp;
            emit SupplierDeactivated(_supplier, block.timestamp);
        }
    }

    // ============================================================
    // PENALTY CALCULATION & REACTIVATION
    // ============================================================
    /**
     * @notice Calculate penalty based on non-compliance duration.
     */
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

    /**
     * @notice Pay penalty and reactivate supplier.
     */
    function payPenaltyAndReactivate() external payable {
        Supplier storage s = suppliers[msg.sender];
        require(s.registered, "Supplier not registered");
        require(!s.active, "Supplier is active");

        uint256 penalty = calculatePenalty(msg.sender);
        require(msg.value == penalty, "Incorrect penalty amount");

        s.totalPenaltiesPaid += msg.value;
        totalPenaltiesCollected += msg.value;
        s.active = true;
        s.deactivationTimestamp = 0;

        // Restart compliance timers for all registered resources
        for (uint256 i = 0; i < s.registeredResources.length; i++) {
            ResourceType rType = s.registeredResources[i];
            s.resources[rType].lastUpdated = block.timestamp;
            s.resources[rType].compliant = true;
        }

        emit PenaltyPaid(msg.sender, msg.value);
        emit SupplierReactivated(msg.sender, block.timestamp);
    }

    // ============================================================
    // SUPPLIER STATISTICS
    // ============================================================
    function getTotalRegisteredSuppliers() external view returns (uint256) {
        return totalRegisteredSuppliers;
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