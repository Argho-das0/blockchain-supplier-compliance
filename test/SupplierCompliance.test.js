const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SupplierCompliance", function () {
  let contract, admin, s1, s2, s3;
  const FEE = 100000n;

  beforeEach(async () => {
    [admin, s1, s2, s3] = await ethers.getSigners();
    const C = await ethers.getContractFactory("SupplierCompliance");
    contract = await C.deploy();
    await contract.waitForDeployment();
  });

  describe("Admin", () => {
    it("deployer becomes admin", async () => {
      expect(await contract.getAdmin()).to.equal(admin.address);
    });
    it("admin can be reassigned", async () => {
      await contract.setAdmin(s1.address);
      expect(await contract.getAdmin()).to.equal(s1.address);
    });
    it("non-admin cannot setAdmin", async () => {
      await expect(contract.connect(s1).setAdmin(s1.address))
        .to.be.revertedWith("Only admin can call this");
    });
  });

  describe("Apply + approve", () => {
    it("wallet can apply, state pending", async () => {
      await contract.connect(s1).applyAsSupplier("Red Cross", 0, { value: FEE });
      const ids = await contract.getSupplierIdsOf(s1.address);
      const s = await contract.getSupplier(ids[0]);
      expect(s[2]).to.equal("Red Cross");
      expect(Number(s[4])).to.equal(0);
    });
    it("admin approves; supplier active", async () => {
      await contract.connect(s1).applyAsSupplier("Red Cross", 0, { value: FEE });
      await contract.approveSupplier(1);
      const s = await contract.getSupplier(1);
      expect(Number(s[4])).to.equal(1);
    });
    it("one wallet can own multiple suppliers", async () => {
      await contract.connect(s1).applyAsSupplier("A", 0, { value: FEE });
      await contract.connect(s1).applyAsSupplier("B", 1, { value: FEE });
      const ids = await contract.getSupplierIdsOf(s1.address);
      expect(ids.length).to.equal(2);
    });
    it("reject refunds fee", async () => {
      const before = await ethers.provider.getBalance(s1.address);
      const tx = await contract.connect(s1).applyAsSupplier("X", 0, { value: FEE });
      await tx.wait();
      const mid = await ethers.provider.getBalance(s1.address);
      expect(mid).to.be.lt(before);
      await contract.rejectSupplier(1);
      const after = await ethers.provider.getBalance(s1.address);
      expect(after).to.be.gt(mid);
    });
  });

  describe("Resource ops", () => {
    beforeEach(async () => {
      await contract.connect(s1).applyAsSupplier("NGO1", 0, { value: FEE });
      await contract.approveSupplier(1);
    });
    it("approved supplier can register resource", async () => {
      await contract.connect(s1).registerResource(1, 0, 500);
      expect(await contract.getSupplierResourceQuantity(1, 0)).to.equal(500);
    });
    it("non-owner cannot register", async () => {
      await expect(contract.connect(s2).registerResource(1, 0, 500))
        .to.be.revertedWith("Not owner of supplier");
    });
    it("update refreshes compliance", async () => {
      await contract.connect(s1).registerResource(1, 0, 100);
      await time.increase(23 * 3600);
      await contract.connect(s1).updateResourceQuantity(1, 0, 200);
      expect(await contract.isResourceCompliant(1, 0)).to.equal(true);
      expect(await contract.getSupplierResourceQuantity(1, 0)).to.equal(200);
    });
    it("update within window resets timer", async () => {
      await contract.connect(s1).registerResource(1, 0, 100);
      await time.increase(12 * 3600);
      await contract.connect(s1).updateResourceQuantity(1, 0, 400);
      const remaining = await contract.remainingComplianceTime(1, 0);
      expect(remaining).to.be.gt(23 * 3600);
    });
    it("update after window expires reverts", async () => {
      await contract.connect(s1).registerResource(1, 0, 100);
      await time.increase(25 * 3600);
      await expect(
        contract.connect(s1).updateResourceQuantity(1, 0, 500)
      ).to.be.revertedWith("Compliance window expired");
    });
    it("update at boundary + 1s reverts", async () => {
      await contract.connect(s1).registerResource(1, 0, 100);
      await time.increase(24 * 3600 + 1);
      await expect(
        contract.connect(s1).updateResourceQuantity(1, 0, 500)
      ).to.be.revertedWith("Compliance window expired");
    });
    it("update at boundary - 2s succeeds", async () => {
      await contract.connect(s1).registerResource(1, 0, 100);
      await time.increase(24 * 3600 - 2);
      await contract.connect(s1).updateResourceQuantity(1, 0, 500);
      expect(await contract.getSupplierResourceQuantity(1, 0)).to.equal(500);
    });
  });

  describe("Deactivation + penalty", () => {
    beforeEach(async () => {
      await contract.connect(s1).applyAsSupplier("NGO1", 0, { value: FEE });
      await contract.approveSupplier(1);
      await contract.connect(s1).registerResource(1, 0, 100);
    });
    it("admin deactivates non-compliant", async () => {
      await time.increase(25 * 3600);
      await contract.checkAndDeactivate(1);
      const s = await contract.getSupplier(1);
      expect(Number(s[4])).to.equal(2);
    });
    it("penalty escalates", async () => {
      await time.increase(25 * 3600);
      await contract.checkAndDeactivate(1);
      expect(await contract.calculatePenalty(1)).to.equal(200000n);
      await time.increase(10 * 86400);
      expect(await contract.calculatePenalty(1)).to.equal(800000n);
    });
    it("owner can pay + reactivate", async () => {
      await time.increase(25 * 3600);
      await contract.checkAndDeactivate(1);
      const p = await contract.calculatePenalty(1);
      await contract.connect(s1).payPenaltyAndReactivate(1, { value: p });
      const s = await contract.getSupplier(1);
      expect(Number(s[4])).to.equal(1);
    });
  });

  describe("Aggregate views", () => {
    beforeEach(async () => {
      await contract.connect(s1).applyAsSupplier("A", 0, { value: FEE });
      await contract.connect(s2).applyAsSupplier("B", 1, { value: FEE });
      await contract.approveSupplier(1);
      await contract.approveSupplier(2);
      await contract.connect(s1).registerResource(1, 0, 1000);
      await contract.connect(s2).registerResource(2, 0, 2000);
    });
    it("getStats", async () => {
      const st = await contract.getStats();
      expect(st[0]).to.equal(2);
      expect(st[1]).to.equal(2);
      expect(st[5]).to.equal(2n * FEE);
    });
    it("getTypeCounts", async () => {
      const c = await contract.getTypeCounts();
      expect(Number(c[0])).to.equal(1);
      expect(Number(c[1])).to.equal(1);
    });
    it("getTopPerformers", async () => {
      const res = await contract.getTopPerformers(5);
      expect(res[0].length).to.be.gte(1);
    });
    it("getFrequentDefaulters empty", async () => {
      const res = await contract.getFrequentDefaulters(5);
      expect(res[0].length).to.equal(0);
    });
  });
});