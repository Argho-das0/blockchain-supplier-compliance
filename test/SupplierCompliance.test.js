const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SupplierCompliance", function () {
  let contract;
  let owner, supplier1, supplier2, supplier3;
  const REGISTRATION_FEE = ethers.parseUnits("100000", 0);

  beforeEach(async function () {
    [owner, supplier1, supplier2, supplier3] = await ethers.getSigners();
    const SupplierCompliance = await ethers.getContractFactory("SupplierCompliance");
    contract = await SupplierCompliance.deploy();
    await contract.waitForDeployment();
  });

  describe("Supplier Registration", function () {
    it("Should register a supplier with correct fee", async function () {
      await expect(
        contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE })
      ).to.emit(contract, "SupplierRegistered");

      const info = await contract.getSupplierInfo(supplier1.address);
      expect(info.verified).to.equal(true);
      expect(info.active).to.equal(true);
    });

    it("Should reject registration with incorrect fee", async function () {
      await expect(
        contract.connect(supplier1).registerSupplier({ value: 50000 })
      ).to.be.revertedWith("Incorrect registration fee");
    });

    it("Should prevent duplicate registration", async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await expect(
        contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE })
      ).to.be.revertedWith("Supplier already registered");
    });

    it("Should track total registered suppliers", async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier2).registerSupplier({ value: REGISTRATION_FEE });
      expect(await contract.getTotalRegisteredSuppliers()).to.equal(2);
    });
  });

  describe("Resource Registration", function () {
    beforeEach(async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
    });

    it("Should register water resource", async function () {
      await expect(contract.connect(supplier1).registerResource(0, 1000))
        .to.emit(contract, "ResourceRegistered")
        .withArgs(supplier1.address, "Water");
    });

    it("Should register food resource", async function () {
      await expect(contract.connect(supplier1).registerResource(3, 500))
        .to.emit(contract, "ResourceRegistered")
        .withArgs(supplier1.address, "Food");
    });

    it("Should reject invalid resource type", async function () {
      await expect(
        contract.connect(supplier1).registerResource(4, 100)
      ).to.be.revertedWith("Invalid resource type");
    });

    it("Should reject duplicate resource", async function () {
      await contract.connect(supplier1).registerResource(0, 1000);
      await expect(
        contract.connect(supplier1).registerResource(0, 2000)
      ).to.be.revertedWith("Resource already registered");
    });

    it("Should reject zero quantity", async function () {
      await expect(
        contract.connect(supplier1).registerResource(0, 0)
      ).to.be.revertedWith("Quantity must be greater than zero");
    });
  });

  describe("Quantity Management", function () {
    beforeEach(async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier1).registerResource(0, 1000);
    });

    it("Should update resource quantity", async function () {
      await expect(contract.connect(supplier1).updateResourceQuantity(0, 2000))
        .to.emit(contract, "ResourceUpdated")
        .withArgs(supplier1.address, "Water", 2000);
    });

    it("Should reject update for unregistered resource", async function () {
      await expect(
        contract.connect(supplier1).updateResourceQuantity(1, 500)
      ).to.be.revertedWith("Resource not registered");
    });
  });

  describe("Compliance Mechanism", function () {
    beforeEach(async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier1).registerResource(0, 1000);
    });

    it("Should be compliant immediately", async function () {
      expect(await contract.isResourceCompliant(supplier1.address, 0)).to.equal(true);
    });

    it("Should be compliant within one day", async function () {
      await time.increase(12 * 60 * 60);
      expect(await contract.isResourceCompliant(supplier1.address, 0)).to.equal(true);
    });

    it("Should become non-compliant after one day", async function () {
      await time.increase(24 * 60 * 60 + 1);
      expect(await contract.isResourceCompliant(supplier1.address, 0)).to.equal(false);
    });

    it("Should refresh compliance on update", async function () {
      await time.increase(23 * 60 * 60);
      await contract.connect(supplier1).updateResourceQuantity(0, 1500);
      await time.increase(12 * 60 * 60);
      expect(await contract.isResourceCompliant(supplier1.address, 0)).to.equal(true);
    });
  });

  describe("Deactivation", function () {
    beforeEach(async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier1).registerResource(0, 1000);
    });

    it("Should deactivate non-compliant supplier", async function () {
      await time.increase(24 * 60 * 60 + 1);
      await expect(contract.connect(owner).checkAndDeactivate(supplier1.address))
        .to.emit(contract, "SupplierDeactivated");
    });

    it("Should prevent inactive supplier from updating", async function () {
      await time.increase(24 * 60 * 60 + 1);
      await contract.connect(owner).checkAndDeactivate(supplier1.address);
      await expect(
        contract.connect(supplier1).updateResourceQuantity(0, 2000)
      ).to.be.revertedWith("Supplier is inactive");
    });

    it("Should reject deactivation from a non-owner wallet", async function () {
      await time.increase(24 * 60 * 60 + 1);
      await expect(
        contract.connect(supplier2).checkAndDeactivate(supplier1.address)
      ).to.be.revertedWith("Only compliance officer can call this");
    });
  });

  describe("Penalty and Reactivation", function () {
    beforeEach(async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier1).registerResource(0, 1000);
      await time.increase(24 * 60 * 60 + 1);
      await contract.connect(owner).checkAndDeactivate(supplier1.address);
    });

    it("Should calculate low penalty", async function () {
      const penalty = await contract.calculatePenalty(supplier1.address);
      expect(penalty).to.equal(200000);
    });

    it("Should calculate mid penalty after several days", async function () {
      await time.increase(3 * 24 * 60 * 60);
      const penalty = await contract.calculatePenalty(supplier1.address);
      expect(penalty).to.equal(400000);
    });

    it("Should reject incorrect penalty payment", async function () {
      await expect(
        contract.connect(supplier1).payPenaltyAndReactivate({ value: 100000 })
      ).to.be.revertedWith("Incorrect penalty amount");
    });

    it("Should reactivate after penalty payment", async function () {
      const penalty = await contract.calculatePenalty(supplier1.address);
      await expect(
        contract.connect(supplier1).payPenaltyAndReactivate({ value: penalty })
      ).to.emit(contract, "SupplierReactivated");
    });

    it("Should resume updates after reactivation", async function () {
      const penalty = await contract.calculatePenalty(supplier1.address);
      await contract.connect(supplier1).payPenaltyAndReactivate({ value: penalty });
      await expect(contract.connect(supplier1).updateResourceQuantity(0, 3000))
        .to.emit(contract, "ResourceUpdated");
    });
  });

  describe("Statistics", function () {
    beforeEach(async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier2).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier1).registerResource(0, 1000);
      await contract.connect(supplier2).registerResource(0, 2000);
    });

    it("Should return correct totals", async function () {
      expect(await contract.getTotalRegisteredSuppliers()).to.equal(2);
      expect(await contract.getActiveSuppliersCount()).to.equal(2);
    });

    it("Should return aggregate quantities", async function () {
      expect(await contract.getAggregateResourceQuantity(0)).to.equal(3000);
    });
  });

  describe("Reputation", function () {
    it("Should start at 100 on registration", async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      expect(await contract.getSupplierReputation(supplier1.address)).to.equal(100);
    });

    it("Should increase by 1 on each resource update", async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier1).registerResource(0, 1000);
      await contract.connect(supplier1).updateResourceQuantity(0, 1500);
      expect(await contract.getSupplierReputation(supplier1.address)).to.equal(101);
    });

    it("Should drop by 20 on deactivation", async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier1).registerResource(0, 1000);
      await time.increase(24 * 60 * 60 + 1);
      await contract.connect(owner).checkAndDeactivate(supplier1.address);
      expect(await contract.getSupplierReputation(supplier1.address)).to.equal(80);
    });

    it("Should return correct tier based on score", async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      expect(await contract.getReputationTier(supplier1.address)).to.equal("Bronze");
    });

    it("Should cap at 200", async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier1).registerResource(0, 1000);

      for (let i = 0; i < 120; i++) {
        await contract.connect(supplier1).updateResourceQuantity(0, 1000 + i);
      }

      expect(await contract.getSupplierReputation(supplier1.address)).to.equal(200);
    });
  });

  describe("Emergency Pause", function () {
    it("Should revert state-changing operations when paused", async function () {
      await contract.connect(owner).pause();
      await expect(
        contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE })
      ).to.be.revertedWith("Contract is paused");
    });

    it("Should prevent resource updates when paused", async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(supplier1).registerResource(0, 1000);
      await contract.connect(owner).pause();
      await expect(
        contract.connect(supplier1).updateResourceQuantity(0, 2000)
      ).to.be.revertedWith("Contract is paused");
    });

    it("Should allow view functions when paused", async function () {
      await contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE });
      await contract.connect(owner).pause();
      expect(await contract.getTotalRegisteredSuppliers()).to.equal(1);
    });

    it("Should resume normal operation after unpause", async function () {
      await contract.connect(owner).pause();
      await contract.connect(owner).unpause();
      await expect(
        contract.connect(supplier1).registerSupplier({ value: REGISTRATION_FEE })
      ).to.not.be.reverted;
    });

    it("Should prevent non-owner from pausing", async function () {
      await expect(
        contract.connect(supplier1).pause()
      ).to.be.revertedWith("Only compliance officer can call this");
    });

    it("Should prevent pausing when already paused", async function () {
      await contract.connect(owner).pause();
      await expect(
        contract.connect(owner).pause()
      ).to.be.revertedWith("Already paused");
    });

    it("Should prevent unpausing when not paused", async function () {
      await expect(
        contract.connect(owner).unpause()
      ).to.be.revertedWith("Not paused");
    });
  });
});