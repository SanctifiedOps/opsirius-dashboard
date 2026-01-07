import { retrieveEnvVariable } from "../utils"
import { PublicKey } from "@solana/web3.js";

export const PRIVATE_KEY = retrieveEnvVariable('PRIVATE_KEY')
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT')
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT')

export const LIL_JIT_ENDPOINT = retrieveEnvVariable('LIL_JIT_ENDPOINT')
export const LIL_JIT_WEBSOCKET_ENDPOINT = retrieveEnvVariable('LIL_JIT_WEBSOCKET_ENDPOINT')

export const LIL_JIT_MODE = retrieveEnvVariable('LIL_JIT_MODE') == "true"

export const TOKEN_NAME = retrieveEnvVariable('TOKEN_NAME')
export const TOKEN_SYMBOL = retrieveEnvVariable('TOKEN_SYMBOL')
export const DESCRIPTION = retrieveEnvVariable('DESCRIPTION')
export const TOKEN_SHOW_NAME = retrieveEnvVariable('TOKEN_SHOW_NAME')
export const TOKEN_CREATE_ON = retrieveEnvVariable('TOKEN_CREATE_ON')
export const TWITTER = retrieveEnvVariable('TWITTER')
export const TELEGRAM = retrieveEnvVariable('TELEGRAM')
export const WEBSITE = retrieveEnvVariable('WEBSITE')
export const FILE = retrieveEnvVariable('FILE')
export const VANITY_MODE = retrieveEnvVariable('VANITY_MODE') == "true"

export const SWAP_AMOUNT = Number(retrieveEnvVariable('SWAP_AMOUNT'))
export const DISTRIBUTION_WALLETNUM = Number(retrieveEnvVariable('DISTRIBUTION_WALLETNUM'))

export const JITO_FEE = Number(retrieveEnvVariable('JITO_FEE'))

export const global_mint = new PublicKey("p89evAyzjd9fphjJx7G3RFA48sbZdpGEppRcfRNpump")
export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export const BUYER_WALLET = retrieveEnvVariable('BUYER_WALLET')
export const BUYER_AMOUNT = Number(retrieveEnvVariable('BUYER_AMOUNT'))
export const BONK_PLATFROM_ID = new PublicKey("FfYek5vEz23cMkWsdJwG2oa6EphsvXSHrGpdALN4g6W1")

export const SKIP_DISTRIBUTION = process.env.SKIP_DISTRIBUTION === "true"
export const REUSE_WALLETS = process.env.REUSE_WALLETS === "true"
export const WALLET_MIN_SOL = Number(process.env.WALLET_MIN_SOL || "0")
export const UNDERFUNDED_MODE = (process.env.UNDERFUNDED_MODE || "skip").toLowerCase()
export const TARGET_MINT = process.env.TARGET_MINT || ""
export const TARGET_CREATOR = process.env.TARGET_CREATOR || ""
export const BUNDLE_TOTAL_SOL = Number(process.env.BUNDLE_TOTAL_SOL || "0")
export const WALLET_LIMIT = Number(process.env.WALLET_LIMIT || "0")
export const KEYS_DIR = process.env.KEYS_DIR || "keys"
