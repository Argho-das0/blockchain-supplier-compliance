const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const SupplierCompliance = await hre.ethers.getContractFactory("SupplierCompliance");
  const contract = await SupplierCompliance.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("SupplierCompliance deployed to:", address);

  const outPath = path.join(__dirname, "..", "frontend", "deployed-address.json");
  fs.writeFileSync(outPath, JSON.stringify({ address }, null, 2));
  console.log("Wrote address to frontend/deployed-address.json");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });