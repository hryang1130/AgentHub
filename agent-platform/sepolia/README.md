# Sepolia On-Chain Registration Guide

Moving an agent identity from the local sandbox to a **real blockchain** takes 3 steps.

## Step 0: Environment

Node 22 and `ethers` are required. In this project's environment they are already installed at:

```
C:\Users\kevin\.workbuddy\binaries\node\workspace\node_modules
```

Set this before running the scripts (or use the commands below directly):

```
set NODE_PATH=C:\Users\kevin\.workbuddy\binaries\node\workspace\node_modules
```

## Step 1: Generate a testnet wallet

```
cd agent-platform/sepolia
node create-wallet.cjs
```

The script prints the address and writes the private key to `.env`
(**testnet use only — never use a wallet that holds real assets**).

## Step 2: Get free Sepolia test ETH

Use any faucet below with the address printed in step 1:

1. **https://sepolia-faucet.pk910.de** — proof-of-work style; "mine" for a few minutes in the browser, no account needed (recommended)
2. https://cloud.google.com/application/web3/faucet/ethereum/sepolia — requires Google sign-in
3. https://www.alchemy.com/faucets/ethereum-sepolia — requires registration

Only a small amount is needed: roughly 0.0002 ETH per registration.

## Step 3: Register on-chain for real

```
node register.cjs --name "MyFirstOnchainAgent" --desc "My first on-chain ERC-8004 agent"
```

The script performs the whole sequence: check the balance → build the canonical registration JSON
(embedded as a data URI, no IPFS needed) → dry-run with `staticCall` to obtain the agentId →
broadcast the transaction → wait for confirmation.

On success it prints an **Etherscan transaction link**, where you can inspect the real `Register`
transaction and your on-chain agentId.

## Real contract addresses (Sepolia testnet)

| Contract | Address |
|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

The canonical Ethereum mainnet address is
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (registration costs real gas, roughly $5–20; reads are free).

## Suggested walkthrough

1. Run the full loop locally first (AgentHub): register → marketplace → agent-to-agent trade;
2. Then open the real transaction on Etherscan and compare it with the local record;
3. Point out the two things that are identical — the registration JSON format and the IdentityRegistry
   contract — the only difference is that the chain is now public.
