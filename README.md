# LSP Asset Mover

Transfer LSP7 and LSP8 assets from any legacy wallet (MetaMask, Rabby, etc.) to a LUKSO Universal Profile in a guided three-step flow.

Built with **Next.js 14**, **Wagmi v2**, **Viem**, and **Tailwind CSS**.

---

## Features

- **EIP-6963 wallet discovery** -- automatically detects all injected wallets and filters out Universal Profile extensions so you never accidentally connect the wrong wallet as the source
- **Independent wallet connections** -- Step 1 (source) uses a pinned EIP-1193 provider reference; Step 2 (destination) connects directly to `window.lukso`, keeping the two completely isolated
- **LUKSO network management** -- detects the connected chain and offers to switch or add LUKSO Mainnet (chain ID 42) via `wallet_switchEthereumChain` / `wallet_addEthereumChain`
- **Envio indexer integration** -- discovers LSP7 (fungible) and LSP8 (identifiable digital asset / NFT) holdings via GraphQL queries to the [LUKSO Envio Indexer](https://envio.lukso-mainnet.universal.tech)
- **Custom transfer amounts** -- for LSP7 tokens you can type the exact amount to send, with a MAX button and balance validation
- **Per-asset transfer status** -- each asset shows a live spinner, green checkmark, or error tooltip as transfers execute sequentially
- **Provider pinning** -- the raw EIP-1193 provider from Step 1 is stored in React state and used directly for `eth_sendTransaction`, preventing the UP extension from hijacking the signing context

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  app/layout.tsx                                            │
│    └─ Providers (providers.tsx)                            │
│         ├─ WagmiProvider  (config: LUKSO chain, injected)  │
│         └─ QueryClientProvider                             │
│              └─ app/page.tsx  (main application logic)     │
└────────────────────────────────────────────────────────────┘
```

### Key modules in `app/page.tsx`

| Section | Purpose |
|---|---|
| `useEIP6963Providers()` | Custom hook — listens for `eip6963:announceProvider` events and collects all injected wallet providers |
| `isUPWallet()` | Filters providers by RDNS/name to exclude Universal Profile wallets from Step 1 |
| `fetchTokensForAddress()` | Queries the Envio GraphQL indexer for LSP7 and LSP8 holdings, returns typed `TokenAsset[]` |
| `sendViaProvider()` | Sends a raw `eth_sendTransaction` through a specific EIP-1193 provider, bypassing Wagmi's internal routing |
| `handleTransferAll()` | Iterates selected assets, encodes LSP7/LSP8 `transfer()` calldata with Viem, sends each transaction individually with real-time status updates |

### Wallet isolation strategy

The core challenge is keeping two separate wallet contexts (source legacy wallet + destination UP) without them interfering:

1. **Step 1** — User picks a legacy wallet via EIP-6963. The raw `provider` object is saved in `sourceProvider` state. Wagmi is used only for chain/address state.
2. **Step 2** — The UP Browser Extension is accessed directly via `window.lukso.request({ method: 'eth_requestAccounts' })`. This is completely independent of Wagmi.
3. **Step 3** — Transfers use `sourceProvider.request({ method: 'eth_sendTransaction', ... })` directly, ensuring MetaMask (or whichever legacy wallet) signs — never the UP extension.

### Asset discovery

Assets are fetched from the [LUKSO Envio Indexer](https://envio.lukso-mainnet.universal.tech/v1/graphql) using two parallel GraphQL queries:

**LSP7 (fungible tokens):**
```graphql
{
  Hold(where: {
    profile_id: { _eq: "<address>" },
    asset: { standard: { _eq: "LSP7DigitalAsset" } },
    balance: { _gt: "0" }
  }, limit: 100) {
    balance
    asset { id lsp4TokenName lsp4TokenSymbol decimals icons(limit: 1) { src } }
  }
}
```

**LSP8 (NFTs / identifiable digital assets):**
```graphql
{
  Hold(where: {
    profile_id: { _eq: "<address>" },
    baseAsset: { standard: { _eq: "LSP8IdentifiableDigitalAsset" } },
    balance: { _gt: "0" }
  }, limit: 100) {
    balance token_id baseAsset_id
    baseAsset { id lsp4TokenName lsp4TokenSymbol icons(limit: 1) { src } }
  }
}
```

LSP8 results are grouped by collection address, with individual `tokenId` values (bytes32) collected for transfer.

### Transfer execution

Each transfer encodes calldata using Viem's `encodeFunctionData`:

- **LSP7**: `transfer(address from, address to, uint256 amount, bool force, bytes data)` — amount is parsed from the user-editable input field
- **LSP8**: `transfer(address from, address to, bytes32 tokenId, bool force, bytes data)` — one call per token ID

The `force` parameter is set to `true` to allow transfers to any address (including non-UP receivers if needed).

---

## Tech Stack

| Dependency | Version | Role |
|---|---|---|
| [Next.js](https://nextjs.org/) | 14.1.0 | App Router, SSR, React Server Components |
| [React](https://react.dev/) | 18.2.0 | UI framework |
| [TypeScript](https://www.typescriptlang.org/) | 5.x | Type safety |
| [Wagmi](https://wagmi.sh/) | 2.5.0 | React hooks for Ethereum (account, chain, connect/disconnect) |
| [Viem](https://viem.sh/) | 2.7.0 | ABI encoding, unit conversion (`parseUnits`, `formatUnits`) |
| [TanStack Query](https://tanstack.com/query) | 5.x | Async state management (required by Wagmi v2) |
| [Tailwind CSS](https://tailwindcss.com/) | 3.3.0 | Utility-first styling |

---

## Getting Started

### Prerequisites

- **Node.js** 18+
- **npm** (or yarn / pnpm)
- A legacy wallet browser extension (MetaMask, Rabby, etc.)
- The [UP Browser Extension](https://chromewebstore.google.com/detail/universal-profiles/abpickdkkbnbcoepogfhkhennhfhehfn) (optional — you can also enter a UP address manually)

### Installation

```bash
git clone https://github.com/JordyDutch/lsp-asset-mover.git
cd lsp-asset-mover
npm install
```

### Environment

```bash
cp .env.example .env
```

Edit `.env` and set your values:

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_RPC_URL=https://rpc.mainnet.lukso.network  # optional
```

> The WalletConnect project ID is kept for compatibility but is not actively used — the app connects exclusively through injected (EIP-6963) providers.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

---

## Usage

### Step 1 — Connect Source Wallet

Select your legacy wallet (MetaMask, Rabby, etc.) from the auto-discovered list. If you're on the wrong network, the app prompts you to switch to LUKSO Mainnet. If the UP Browser Extension accidentally connects here, a clear warning is shown with a disconnect button.

### Step 2 — Connect Destination Profile

Connect your Universal Profile via the UP Browser Extension, or paste any UP address manually. The app validates that source and destination are not the same address.

### Step 3 — Transfer Assets

The app scans the source address for LSP7 and LSP8 tokens. For each token you can:

- Toggle selection with the checkbox
- Edit the transfer amount (LSP7 only) — type a custom amount or click MAX
- See real-time transfer status per asset

Click **Transfer** and confirm each transaction in your legacy wallet.

---

## Project Structure

```
lsp-asset-mover/
├── app/
│   ├── layout.tsx          # Root layout, metadata, font loading
│   ├── page.tsx            # Main application (all 3 steps, wallet logic, transfers)
│   ├── providers.tsx       # Wagmi + TanStack Query provider setup
│   └── globals.css         # Tailwind directives + global styles
├── public/                 # Static assets
├── next.config.js          # Next.js config (image domains, webpack fallbacks)
├── tailwind.config.js      # Tailwind theme (custom LUKSO colors)
├── tsconfig.json           # TypeScript configuration
├── .env.example            # Environment variable template
└── package.json
```

---

## LUKSO Standards Reference

- [LSP7 — Digital Asset (Fungible)](https://docs.lukso.tech/standards/tokens/LSP7-Digital-Asset)
- [LSP8 — Identifiable Digital Asset (NFT)](https://docs.lukso.tech/standards/tokens/LSP8-Identifiable-Digital-Asset)
- [EIP-6963 — Multi Injected Provider Discovery](https://eips.ethereum.org/EIPS/eip-6963)

---

## License

MIT
# LSP-Asset-Mover
