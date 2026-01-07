import { VersionedTransaction, Keypair, Connection, ComputeBudgetProgram, TransactionInstruction, TransactionMessage, PublicKey } from "@solana/web3.js"
import base58 from "bs58"

import { LIL_JIT_MODE, PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SWAP_AMOUNT, TARGET_MINT, WALLET_MIN_SOL, UNDERFUNDED_MODE, WALLET_LIMIT, TARGET_CREATOR, BUNDLE_TOTAL_SOL } from "./constants"
import { readJson, sleep } from "./utils"
import { createLUT, makeBuyIx, addAddressesToTableMultiExtend } from "./src/main";
import { executeJitoTx } from "./executor/jito";
import { sendBundle } from "./executor/liljito";

const commitment = "confirmed"

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))

const MIN_LAMPORTS = 5_000

const loadExistingWallets = (limit: number) => {
  const rawKeys = readJson("data.json");
  const wallets = rawKeys
    .map((secret) => {
      try {
        return Keypair.fromSecretKey(base58.decode(secret));
      } catch (error) {
        return null;
      }
    })
    .filter((kp): kp is Keypair => Boolean(kp));
  if (limit > 0) return wallets.slice(0, limit);
  return wallets;
};

const randomSplitLamports = (totalLamports: number, count: number) => {
  if (totalLamports < count * MIN_LAMPORTS) {
    return null;
  }
  const weights = Array.from({ length: count }, () => Math.random());
  const sum = weights.reduce((acc, val) => acc + val, 0);
  const base = totalLamports - count * MIN_LAMPORTS;
  const allocations = weights.map((weight) =>
    Math.floor((weight / sum) * base) + MIN_LAMPORTS
  );
  const used = allocations.reduce((acc, val) => acc + val, 0);
  allocations[0] += totalLamports - used;
  return allocations;
};

const main = async () => {
  if (!TARGET_MINT) {
    console.log("TARGET_MINT is required for bundle-existing.")
    return
  }

  const mintAddress = new PublicKey(TARGET_MINT)
  const creator = TARGET_CREATOR ? new PublicKey(TARGET_CREATOR) : mainKp.publicKey
  const desiredWalletCount = WALLET_LIMIT > 0 ? WALLET_LIMIT : 0

  let kps = loadExistingWallets(desiredWalletCount)
  if (!kps.length) {
    console.log("No existing wallets found. Fund wallets and try again.")
    return
  }

  if (WALLET_MIN_SOL > 0) {
    const minLamports = WALLET_MIN_SOL * 10 ** 9
    const balances = await Promise.all(kps.map((kp) => connection.getBalance(kp.publicKey)))
    const funded = kps.filter((kp, idx) => balances[idx] >= minLamports)
    const skipped = kps.length - funded.length
    if (skipped > 0) {
      console.log(`Skipping ${skipped} underfunded wallets (< ${WALLET_MIN_SOL} SOL).`)
    }
    if (UNDERFUNDED_MODE === "fail" && skipped > 0) {
      console.log("Underfunded wallets detected. Aborting.")
      return
    }
    kps = funded
  }

  if (!kps.length) {
    console.log("No funded wallets available to bundle.")
    return
  }

  console.log("Creating LUT started")
  const lutAddress = await createLUT(mainKp)
  if (!lutAddress) {
    console.log("Lut creation failed")
    return
  }
  console.log("LUT Address:", lutAddress.toBase58())
  if (!(await addAddressesToTableMultiExtend(lutAddress, mintAddress, kps, mainKp, creator))) {
    console.log("Adding addresses to table failed")
    return
  }

  const buyIxs: TransactionInstruction[] = []
  const totalLamports = Math.floor(BUNDLE_TOTAL_SOL * 10 ** 9)
  const perWalletLamports = BUNDLE_TOTAL_SOL > 0
    ? randomSplitLamports(totalLamports, kps.length)
    : kps.map(() => Math.floor(SWAP_AMOUNT * 10 ** 9))

  if (BUNDLE_TOTAL_SOL > 0 && !perWalletLamports) {
    console.log("Total SOL is too low for random split across wallets.")
    return
  }

  const walletLamports = perWalletLamports || []
  for (let i = 0; i < kps.length; i++) {
    const amountLamports = walletLamports[i]
    const ix = await makeBuyIx(kps[i], amountLamports, i, creator, mintAddress)
    buyIxs.push(...ix)
  }

  const lookupTable = (await connection.getAddressLookupTable(lutAddress)).value;
  if (!lookupTable) {
    console.log("Lookup table not ready")
    return
  }

  const transactions: VersionedTransaction[] = []
  const groupSize = 4

  for (let i = 0; i < Math.ceil(kps.length / groupSize); i++) {
    const latestBlockhash = await connection.getLatestBlockhash()
    const instructions: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
    ]

    for (let j = 0; j < groupSize; j++) {
      const index = i * groupSize + j
      if (kps[index]) {
        instructions.push(buyIxs[index * 2], buyIxs[index * 2 + 1])
      }
    }
    const msg = new TransactionMessage({
      payerKey: kps[i * groupSize].publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions
    }).compileToV0Message([lookupTable])

    const tx = new VersionedTransaction(msg)
    for (let j = 0; j < groupSize; j++) {
      const index = i * groupSize + j
      if (kps[index]) {
        tx.sign([kps[index]])
      }
    }
    transactions.push(tx)
  }

  console.log("Sending bundle...")
  if (LIL_JIT_MODE) {
    const bundleId = await sendBundle(transactions)
    if (!bundleId) {
      console.log("Failed to send bundle")
      return
    }
  } else {
    await executeJitoTx(transactions, mainKp, commitment)
  }
  await sleep(10000)
}

main()
