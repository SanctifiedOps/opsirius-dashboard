import { Commitment, Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import base58 from "bs58";
import axios from "axios";
import { LIL_JIT_ENDPOINT, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from "../constants";
import { sendBundle } from "./liljito";
const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
})

export const executeJitoTx = async (transactions: VersionedTransaction[], payer: Keypair, commitment: Commitment) => {

  try {
    let latestBlockhash = await solanaConnection.getLatestBlockhash();

    const jitoTxsignature = base58.encode(transactions[0].signatures[0]);

    // Serialize the transactions once here
    const serializedTransactions: string[] = [];
    for (let i = 0; i < transactions.length; i++) {
      const serializedTransaction = base58.encode(transactions[i].serialize());
      serializedTransactions.push(serializedTransaction);
    }

    const endpoints = [
      'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
      'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
      'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
      'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
      'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
    ];


    console.log('Sending transactions to endpoints...');

    const results = await Promise.all(
      endpoints.map(async (url) => {
        try {
          const response = await axios.post(url, {
            jsonrpc: '2.0',
            id: 1,
            method: 'sendBundle',
            params: [serializedTransactions],
          });
          return { url, ok: true, response };
        } catch (error) {
          return { url, ok: false, error };
        }
      })
    );

    const successfulResults = results.filter((result) => result.ok);

    if (successfulResults.length > 0) {
      console.log("Waiting for response")
      const confirmation = await solanaConnection.confirmTransaction(
        {
          signature: jitoTxsignature,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          blockhash: latestBlockhash.blockhash,
        },
        commitment,
      );

      console.log("Wallets bought the token plz check keypairs in the data.json file in key folder")

      if (confirmation.value.err) {
        console.log("Confirmtaion error")
        return null
      } else {
        console.log("Transaction confirmed successfully:", jitoTxsignature);
        return jitoTxsignature;
      }
    } else {
      console.log(`No successful responses received for jito`);
      results.forEach((result) => {
        if (result.ok) return;
        const err: any = result.error;
        const status = err?.response?.status;
        const data = err?.response?.data;
        const message = err?.message || "Unknown error";
        console.log(`Jito error from ${result.url}: ${status || "no_status"} ${message}`);
        if (data) {
          console.log(`Jito response: ${JSON.stringify(data)}`);
        }
      });
      if (LIL_JIT_ENDPOINT) {
        console.log("Falling back to Lil Jito bundle submission...");
        const bundleId = await sendBundle(transactions);
        if (bundleId) {
          return bundleId;
        }
      }
      console.log("Falling back to direct RPC send...");
      for (const tx of transactions) {
        try {
          const signature = await solanaConnection.sendRawTransaction(tx.serialize(), {
            skipPreflight: true,
            maxRetries: 3,
          });
          await solanaConnection.confirmTransaction(signature, commitment);
          console.log("Transaction confirmed via RPC:", signature);
        } catch (error: any) {
          console.log("RPC send failed:", error?.message || "Unknown error");
          return null;
        }
      }
    }
    return null
  } catch (error) {
    console.log('Error during transaction execution', error);
    return null
  }
}
