import { VersionedTransaction, Keypair, Connection, TransactionMessage } from "@solana/web3.js"
import base58 from "bs58"

import { PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, VANITY_MODE } from "./constants"
import { generateVanityAddress, saveDataToFile } from "./utils"
import { createTokenTx } from "./src/main"

const commitment = "confirmed"

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})

const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
let mintKp = Keypair.generate()

if (VANITY_MODE) {
  const { keypair, pubkey } = generateVanityAddress("pump")
  mintKp = keypair
  console.log(`Keypair generated with "pump" ending: ${pubkey}`)
}

const mintAddress = mintKp.publicKey

const main = async () => {
  console.log("Mint address of token", mintAddress.toBase58())
  saveDataToFile([base58.encode(mintKp.secretKey)], "mint.json")

  const tokenCreationIxs = await createTokenTx(mainKp, mintKp)
  if (tokenCreationIxs.length === 0) {
    console.log("Token creation failed")
    return
  }

  const latestBlockhash = await connection.getLatestBlockhash()
  const tokenCreationTx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: mainKp.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: tokenCreationIxs
    }).compileToV0Message()
  )
  tokenCreationTx.sign([mainKp, mintKp])

  const sig = await connection.sendRawTransaction(tokenCreationTx.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  })
  console.log(`Deploy-only tx sent: https://solscan.io/tx/${sig}`)

  const confirmation = await connection.confirmTransaction(sig, "confirmed")
  if (confirmation.value.err) {
    console.log("Transaction failed")
  }
}

main()
