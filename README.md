# LSP Asset Mover

A Next.js application that helps you transfer your LSP7 and LSP8 assets from MetaMask to your LUKSO Universal Profile.

## Features

- **Two-step connection flow**: Connect MetaMask (source) → Connect Universal Profile (destination)
- **Rainbow Kit integration**: Beautiful wallet connection UI
- **Dark theme**: Matching the UP-Agent-Onboard aesthetic
- **Asset discovery**: Automatically finds your LSP7/LSP8 tokens
- **Batch transfers**: Move multiple assets in one transaction

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/JordyDutch/lsp-asset-mover.git
cd lsp-asset-mover
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your WalletConnect Project ID
```

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## How It Works

1. **Step 1**: Connect your MetaMask wallet that holds the assets
2. **Step 2**: Connect your Universal Profile (or enter the address manually)
3. The app scans for LSP7 (fungible) and LSP8 (NFT) tokens
4. Select which assets to transfer
5. Execute the transfer

## Technical Details

- Built with Next.js 14 and TypeScript
- Uses Rainbow Kit for wallet connections
- Interacts with LUKSO smart contracts
- Styled with Tailwind CSS
- Dark UI theme

## License

MIT# lsp-asset-mover
