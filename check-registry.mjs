import { createPublicClient, http } from "viem";

const client = createPublicClient({
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});
const REG = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

const abi = [
  {
    name: "nextInstanceId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
];

async function tryCall(name) {
  try {
    const r = await client.readContract({ address: REG, abi, functionName: name });
    console.log(`${name} => ${r.toString()}`);
    return true;
  } catch {
    return false;
  }
}

const code = await client.getBytecode({ address: REG });
console.log("contract deployed:", !!code && code.length > 2, "| code size:", (code?.length ?? 0) - 2, "bytes");
const ok = await tryCall("nextInstanceId");
if (!ok) await tryCall("totalSupply");
