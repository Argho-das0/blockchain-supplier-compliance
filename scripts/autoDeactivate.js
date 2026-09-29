const hre = require("hardhat");

async function main() {
  const contractAddress = "0x0dCcC074183260a50CA203C2a9dE5E946d99D1aC";
  const [signer] = await hre.ethers.getSigners();
  console.log(`Running compliance check as: ${signer.address}`);

  const contract = await hre.ethers.getContractAt("SupplierCompliance", contractAddress);

  const total = await contract.getTotalRegisteredSuppliers();
  console.log(`Total registered suppliers: ${total}`);

  // Get all supplier addresses directly from the contract.
  const addresses = await contract.getAllSupplierAddresses();
  console.log(`Found ${addresses.length} supplier address(es).`);

  let deactivatedCount = 0;

  for (const addr of addresses) {
    const info = await contract.getSupplierInfo(addr);
    const isActive = info[3];

    if (!isActive) {
      console.log(`- ${addr}: already inactive, skipping.`);
      continue;
    }

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
      console.log(`  ⚠️ Skipped (${err.reason || err.message})`);
    }
  }

  console.log(`\nDone. ${deactivatedCount} supplier(s) deactivated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });