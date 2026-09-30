const hre = require("hardhat");

async function main() {
  const contractAddress = "0x4eF4AA916EaabA0Cfc86A33be295005a1Bc40daa";
  const [signer] = await hre.ethers.getSigners();
  console.log(`Running compliance check as: ${signer.address}`);

  const contract = await hre.ethers.getContractAt("SupplierCompliance", contractAddress);

  const total = await contract.getTotalRegisteredSuppliers();
  console.log(`Total registered suppliers: ${total}`);

  const addresses = await contract.getAllSupplierAddresses();
  console.log(`Found ${addresses.length} supplier address(es).`);

  let deactivatedCount = 0;
  let escrowReleased = 0;
  let escrowForfeited = 0;

  for (const addr of addresses) {
    const info = await contract.getSupplierInfo(addr);
    const isActive = info[3];

    if (isActive) {
      // Supplier is active — check if it should be deactivated
      try {
        console.log(`- ${addr}: attempting deactivation...`);
        const tx = await contract.checkAndDeactivate(addr);
        const receipt = await tx.wait();

        const after = await contract.getSupplierInfo(addr);
        if (!after[3]) {
          console.log(`  ✅ Deactivated (tx: ${receipt.hash})`);
          deactivatedCount++;
        } else {
          console.log(`  ℹ️ Still compliant, no action.`);
        }
      } catch (err) {
        console.log(`  ⚠️ Deactivation skipped (${err.reason || err.message})`);
      }
    } else {
      console.log(`- ${addr}: already inactive, checking escrow...`);
    }

    // Escrow management — handle both active and inactive suppliers
    try {
      const escrow = await contract.getEscrowInfo(addr);

      if (escrow.forfeitEligible) {
        const tx = await contract.forfeitEscrow(addr);
        const receipt = await tx.wait();
        console.log(`  💸 Escrow forfeited for ${addr} (tx: ${receipt.hash})`);
        escrowForfeited++;
      } else if (escrow.releasable) {
        const tx = await contract.releaseEscrow(addr);
        const receipt = await tx.wait();
        console.log(`  💰 Escrow released to ${addr} (tx: ${receipt.hash})`);
        escrowReleased++;
      }
    } catch (err) {
      console.log(`  ⚠️ Escrow op skipped (${err.reason || err.message})`);
    }
  }

  console.log(`\nDone.`);
  console.log(`  Suppliers deactivated : ${deactivatedCount}`);
  console.log(`  Escrows released      : ${escrowReleased}`);
  console.log(`  Escrows forfeited     : ${escrowForfeited}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });