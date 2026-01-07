# Solana Token Bundler Suite

A comprehensive collection of Solana token bundlers designed for creating and launching tokens on **pump.fun** and **bonk.fun** with advanced features including multi-wallet bundling, vanity address generation, and dual bundle execution support (Jito/Lil Jito) for MEV protection.

## 📦 Project Structure

This repository contains two distinct bundler implementations:

```
├── Bonkfun/              # Bonk.fun token bundler
└── pumpfun/              # Pump.fun token bundler
```

## 🚀 Features

### Common Features (Both Bundlers)

- ✅ **Multi-Wallet Bundling**: Distributes SOL across multiple wallets and executes coordinated token purchases
- ✅ **Dual Bundle Execution**: Support for both Jito and Lil Jito bundle services for MEV protection
- ✅ **Address Lookup Tables (LUT)**: Optimizes transaction size and reduces fees
- ✅ **Flexible Configuration**: Support for both multi-wallet and single-wallet bundling modes
- ✅ **Automatic Retry Logic**: Built-in retry mechanisms for RPC and bundle execution failures
- ✅ **Atomic Execution**: Creates tokens and executes multi-wallet buys in a single atomic block
- ✅ **Optimized Compute Unit Pricing**: Configurable priority fees for faster confirmation

### Platform-Specific Features

#### Bonkfun Bundler

- Uses Raydium SDK v2 for token launches
- Bonk.fun platform integration
- Custom metadata handling via `@solana-launchpad/sdk`

#### Pumpfun Bundler

- Pump.fun SDK integration
- Vanity address generation (optional)
- IPFS metadata upload support
- Token metadata with social links and images

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Solana CLI (optional, for advanced users)
- Sufficient SOL balance for:
  - Token creation fees
  - Distribution to bundler wallets
  - Jito tips
  - Transaction fees

## 🛠️ Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd Bonkfun-Bundler-Bonk.fun-Bundler
```

2. Install dependencies for both bundlers:

```bash
# Install Bonkfun bundler dependencies
cd Bonkfun
npm install

# Install Pumpfun bundler dependencies
cd ../pumpfun
npm install
```

3. Create a `.env` file in each bundler directory with the appropriate configuration (see platform-specific sections below).

## 🎯 Usage

### Bonkfun Bundler

Navigate to the Bonkfun directory:

```bash
cd Bonkfun
```

Available scripts:

- `npm start` - Run the main multi-wallet bundler
- `npm run single` - Run single wallet mode
- `npm run close` - Close Address Lookup Table
- `npm run gather` - Gather funds from bundler wallets
- `npm run status` - Check transaction status
- `npm test` - Run test script

See [Bonkfun/README.MD](Bonkfun/README.MD) for detailed configuration.

### Pumpfun Bundler

Navigate to the pumpfun directory:

```bash
cd pumpfun
```

Available scripts:

- `npm start` - Run the main multi-wallet bundler
- `npm run single` - Run single wallet mode
- `npm run close` - Close Address Lookup Table
- `npm run gather` - Gather funds from bundler wallets
- `npm run status` - Check transaction status

See [pumpfun/README.md](pumpfun/README.md) for detailed configuration.

## ⚙️ Configuration

### Environment Variables

Both bundlers require a `.env` file with the following structure:

```env
# Required Configuration
PRIVATE_KEY=your_main_wallet_private_key_in_base58
RPC_ENDPOINT=https://your-solana-rpc-endpoint
RPC_WEBSOCKET_ENDPOINT=wss://your-solana-websocket-endpoint

# Bundle Execution Configuration
LIL_JIT_MODE=true                                      # true for Lil Jito, false for standard Jito
LIL_JIT_ENDPOINT=https://your-lil-jit-endpoint         # Required if LIL_JIT_MODE=true
LIL_JIT_WEBSOCKET_ENDPOINT=wss://your-lil-jit-ws       # Required if LIL_JIT_MODE=true

# Token Configuration
TOKEN_NAME=Your Token Name
TOKEN_SYMBOL=SYMBOL
DESCRIPTION=Your token description
TWITTER=https://twitter.com/yourhandle
TELEGRAM=https://t.me/yourchannel
WEBSITE=https://yourwebsite.com
FILE=./image/your_token_image.jpg

# Bundling Configuration
SWAP_AMOUNT=0.1                                        # SOL amount per wallet
DISTRIBUTION_WALLETNUM=10                              # Number of bundler wallets
JITO_FEE=0.001                                        # Jito tip amount in SOL

# Platform-Specific (Pumpfun only)
TOKEN_SHOW_NAME=Display Name
TOKEN_CREATE_ON=Launch Date
VANITY_MODE=false
```

### Bundle Execution Modes

The bundlers support two different bundle execution services:

#### Standard Jito Mode (Default)

- **Configuration**: Set `LIL_JIT_MODE=false`
- Multi-regional endpoint submission (NY, Tokyo)
- Automatic failover between endpoints
- Well-established service with high reliability
- **Best for**: Production deployments requiring maximum redundancy

#### Lil Jito Mode

- **Configuration**: Set `LIL_JIT_MODE=true`
- Single endpoint configuration
- Simplified setup process
- Alternative bundle execution service
- **Best for**: Testing alternative execution paths or when Jito is congested

## 🔀 Technical Architecture

### Transaction Flow

1. **Token Creation**: Creates token with metadata on respective platform
2. **SOL Distribution**: Distributes SOL to generated bundler wallets
3. **LUT Creation**: Creates and populates Address Lookup Table
4. **Bundle Assembly**: Prepares coordinated buy transactions
5. **Bundle Submission**: Submits via Jito or Lil Jito based on configuration
6. **Atomic Execution**: All transactions execute in single block

### Key Components

```
├── constants/              # Configuration constants
├── executor/              # Transaction execution logic
│   ├── jito.ts           # Jito bundle execution
│   ├── liljito.ts        # Lil Jito bundle execution
│   └── legacy.ts         # Legacy transaction execution
├── src/                   # Core functionality
│   ├── main.ts           # Main bundling logic
│   ├── util.ts           # Utility functions
│   ├── types.ts          # TypeScript types
│   └── vanity.ts         # Vanity address generation (pumpfun)
├── utils/                 # Shared utilities
│   ├── logger.ts         # Logging utilities
│   └── utils.ts          # Helper functions
├── index.ts              # Main entry point
└── package.json          # Dependencies and scripts
```

## 🚨 Troubleshooting

### Common Issues

#### RPC Errors

```
Error: RPC endpoint failed
```

**Solutions:**

- Use a premium RPC provider (Helius, QuickNode, Alchemy)
- Implement RPC endpoint rotation
- Check network connectivity
- Reduce concurrent requests

#### Bundle Submission Failures

```
Error: Jito/Lil Jito bundle submission failed
```

**Solutions:**

- **For Jito Mode**: Increase `JITO_FEE`, check multiple regional endpoints
- **For Lil Jito Mode**: Verify endpoint accessibility, check rate limits
- Reduce bundle size
- Verify transaction signatures
- Check network congestion

#### Insufficient Balance

```
Error: Main wallet balance is not enough
```

**Solutions:**

- Calculate required SOL: `(SWAP_AMOUNT + 0.01) * DISTRIBUTION_WALLETNUM + 0.04 + JITO_FEE`
- Add more SOL to main wallet
- Reduce `DISTRIBUTION_WALLETNUM` or `SWAP_AMOUNT`

#### LUT Extension Failures

**Solutions:**

- Wait for slot activation (15-20 seconds after creation)
- Retry with increased compute units
- Check authority permissions

### Performance Optimization

1. **RPC Optimization**:

   - Use dedicated RPC endpoints
   - Implement connection pooling
   - Monitor rate limits

2. **Transaction Optimization**:

   - Use Address Lookup Tables effectively
   - Optimize compute unit allocation
   - Batch operations when possible

3. **Bundle Execution**:
   - Use appropriate tip amounts during congestion
   - Monitor bundle success rates
   - Test both Jito and Lil Jito modes

## 📊 Sample Bundles

Example Jito bundles demonstrating successful multi-wallet atomic execution:

### Bonkfun Bundler

| Wallet Count | Jito Bundle                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| 12 Wallets   | [🔗 View](https://explorer.jito.wtf/bundle/dfec1729f72262df142ecd8b9a275fbe0addf35af743a99c5c0f1deb0fc0cf43) |

### Pumpfun Bundler

| Wallet Count | Jito Bundle                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| 16-Wallet    | [🔗 View](https://explorer.jito.wtf/bundle/be86e4bbdf227a2f4892228d57557bf1d69497555c07a8967295387c5ea251bc) |

> **Note**: These are real-world examples showing atomic bundle execution on Solana. The bundlers support any number of wallets based on your configuration.

## 🔐 Security Considerations

- **Private Keys**: Store private keys securely and never commit them to version control
- **RPC Endpoints**: Use trusted RPC providers to prevent data interception
- **Environment Variables**: Use `.env` files and ensure they're in `.gitignore`
- **Wallet Management**: Consider using hardware wallets for main operations
- **Fund Management**: Only load wallets with necessary amounts
- **Testing**: Always test with small amounts first

## 📁 Key Files Generated

```
Bonkfun/keys/              # Generated wallet keys and data
pumpfun/keys/              # Generated wallet keys and data
```

⚠️ **Important**: Keep the `keys/` directory secure and never commit it to version control!

## 🛠 Tech Stack

- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [Raydium SDK v2](https://github.com/raydium-io/raydium-sdk) (Bonkfun)
- [Pump.fun SDK](https://github.com/solana-launchpad/sdk) (Pumpfun)
- [Jito-Solana](https://jito.network/)
- [Anchor Framework](https://www.anchor-lang.com/)
- TypeScript
- Node.js

## ⚠️ Disclaimer

This software is for educational and research purposes. Users are responsible for:

- Compliance with local regulations
- Proper tax reporting
- Understanding the risks of cryptocurrency trading
- Securing their private keys and funds
- Following platform terms of service

**Use at your own risk.** The authors are not responsible for any financial losses.

## 📄 License

ISC License - see LICENSE file for details

## 👨‍💻 Author

**0xMuseNine**

## 📬 Contact & Support

For MEV bot customization, consulting, or private collaboration:

**Telegram**: [@xMuseNine](https://t.me/xMuseNine)

For issues and questions:

1. Check the troubleshooting section
2. Review the platform-specific README files
3. Review the logs for specific error messages
4. Ensure all environment variables are properly set
5. Verify sufficient SOL balance and RPC connectivity

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 🆘 Additional Resources

- [Bonkfun Bundler Documentation](Bonkfun/README.MD)
- [Pumpfun Bundler Documentation](pumpfun/README.md)
- [Solana Documentation](https://docs.solana.com/)
- [Jito Documentation](https://docs.jito.wtf/)

---

**Note**: These bundlers are designed for their respective token launch platforms. Always test with small amounts first and understand the risks involved in cryptocurrency operations. Market conditions, network congestion, and platform changes can affect performance.
