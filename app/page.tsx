'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { lukso } from 'wagmi/chains';
import { encodeFunctionData, formatUnits, parseUnits, type Address } from 'viem';

// --- Types ---

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EthereumProvider;
}

interface TokenAsset {
  address: string;
  name: string;
  symbol: string;
  type: 'LSP7' | 'LSP8';
  balance: string;
  decimals: number;
  selected: boolean;
  iconUrl?: string;
  tokenIds?: string[]; // bytes32 token IDs for LSP8
  transferAmount: string; // human-readable amount to transfer (LSP7 only)
}

interface TransferStatus {
  address: string;
  status: 'pending' | 'transferring' | 'success' | 'error';
  txHash?: string;
  error?: string;
}

// --- Constants ---

const LUKSO_CHAIN_PARAMS = {
  chainId: '0x2a',
  chainName: 'LUKSO Mainnet',
  nativeCurrency: {
    name: 'LUKSO',
    symbol: 'LYX',
    decimals: 18,
  },
  rpcUrls: ['https://rpc.mainnet.lukso.network'],
  blockExplorerUrls: ['https://explorer.execution.mainnet.lukso.network'],
};

const ENVIO_INDEXER = 'https://envio.lukso-mainnet.universal.tech/v1/graphql';

// LSP7 transfer(address from, address to, uint256 amount, bool force, bytes data)
const LSP7_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'force', type: 'bool' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

// LSP8 transfer(address from, address to, bytes32 tokenId, bool force, bytes data)
const LSP8_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'bytes32' },
      { name: 'force', type: 'bool' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

// --- EIP-6963: Multi Injected Provider Discovery ---

const UP_FILTERS = ['universalprofile', 'lukso', 'universal profile', 'universal-profile'];

function useEIP6963Providers() {
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([]);

  useEffect(() => {
    const handleAnnouncement = (event: Event) => {
      const e = event as CustomEvent<EIP6963ProviderDetail>;
      if (!e.detail?.info?.uuid) return;
      setProviders(prev => {
        if (prev.some(p => p.info.uuid === e.detail.info.uuid)) return prev;
        return [...prev, e.detail];
      });
    };

    window.addEventListener('eip6963:announceProvider', handleAnnouncement);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    return () => {
      window.removeEventListener('eip6963:announceProvider', handleAnnouncement);
    };
  }, []);

  return providers;
}

function isUPWallet(value: string): boolean {
  const lower = value.toLowerCase();
  return UP_FILTERS.some(f => lower.includes(f));
}

// --- Helpers ---

function getEthereumProvider(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

function getLuksoProvider(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { lukso?: EthereumProvider }).lukso;
}

function formatBalance(balance: string, decimals: number): string {
  const formatted = formatUnits(BigInt(balance), decimals);
  const num = parseFloat(formatted);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

async function queryIndexer(query: string): Promise<unknown> {
  const res = await fetch(ENVIO_INDEXER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Indexer request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'GraphQL error');
  return json.data;
}

async function fetchTokensForAddress(address: string): Promise<TokenAsset[]> {
  const tokens: TokenAsset[] = [];
  const addr = address.toLowerCase();

  // Fetch LSP7 and LSP8 holdings in parallel from the Envio indexer
  const [lsp7Data, lsp8Data] = await Promise.all([
    queryIndexer(`{
      Hold(
        where: {
          profile_id: { _eq: "${addr}" },
          asset: { standard: { _eq: "LSP7DigitalAsset" } },
          balance: { _gt: "0" }
        },
        limit: 100
      ) {
        balance
        asset {
          id
          lsp4TokenName
          lsp4TokenSymbol
          decimals
          icons(limit: 1) { src }
        }
      }
    }`) as Promise<{ Hold: Array<{
      balance: string;
      asset: {
        id: string;
        lsp4TokenName: string | null;
        lsp4TokenSymbol: string | null;
        decimals: number | null;
        icons: Array<{ src: string }>;
      };
    }> }>,
    queryIndexer(`{
      Hold(
        where: {
          profile_id: { _eq: "${addr}" },
          baseAsset: { standard: { _eq: "LSP8IdentifiableDigitalAsset" } },
          balance: { _gt: "0" }
        },
        limit: 100
      ) {
        balance
        token_id
        baseAsset_id
        baseAsset {
          id
          lsp4TokenName
          lsp4TokenSymbol
          icons(limit: 1) { src }
        }
      }
    }`) as Promise<{ Hold: Array<{
      balance: string;
      token_id: string;
      baseAsset_id: string;
      baseAsset: {
        id: string;
        lsp4TokenName: string | null;
        lsp4TokenSymbol: string | null;
        icons: Array<{ src: string }>;
      };
    }> }>,
  ]);

  // Process LSP7 tokens
  for (const hold of lsp7Data.Hold) {
    if (!hold.asset) continue;
    const decimals = hold.asset.decimals ?? 18;
    tokens.push({
      address: hold.asset.id,
      name: hold.asset.lsp4TokenName || 'Unknown Token',
      symbol: hold.asset.lsp4TokenSymbol || '???',
      type: 'LSP7',
      balance: hold.balance,
      decimals,
      selected: true,
      iconUrl: hold.asset.icons?.[0]?.src,
      transferAmount: formatUnits(BigInt(hold.balance), decimals),
    });
  }

  // Process LSP8 tokens — group by collection, collect tokenIds
  const collections = new Map<string, TokenAsset>();
  for (const hold of lsp8Data.Hold) {
    if (!hold.baseAsset) continue;
    const collectionAddr = hold.baseAsset.id;
    // Extract the bytes32 tokenId from the compound token_id ("collectionAddr-tokenId")
    const tokenId = hold.token_id.slice(hold.token_id.indexOf('-') + 1);

    if (collections.has(collectionAddr)) {
      const existing = collections.get(collectionAddr)!;
      existing.balance = String(parseInt(existing.balance) + 1);
      existing.tokenIds?.push(tokenId);
    } else {
      collections.set(collectionAddr, {
        address: collectionAddr,
        name: hold.baseAsset.lsp4TokenName || 'Unknown NFT',
        symbol: hold.baseAsset.lsp4TokenSymbol || '???',
        type: 'LSP8',
        balance: '1',
        decimals: 0,
        selected: true,
        iconUrl: hold.baseAsset.icons?.[0]?.src,
        tokenIds: [tokenId],
        transferAmount: '1',
      });
    }
  }
  tokens.push(...Array.from(collections.values()));

  return tokens;
}

// --- Component ---

export default function Home() {
  const [step, setStep] = useState(1);

  // Step 1: Source wallet (managed by wagmi — stays connected for signing)
  const { address: liveAddress, isConnected: isSourceConnected, chainId, connector } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  // Snapshot the source address and its provider when leaving Step 1
  const [savedSourceAddress, setSavedSourceAddress] = useState('');
  const [sourceProvider, setSourceProvider] = useState<EthereumProvider | null>(null);
  // In Step 1, use the live address; in Steps 2/3, use the snapshot
  const sourceAddress = step === 1 ? liveAddress : (savedSourceAddress || liveAddress);

  // Step 2: Destination UP address (independent of wagmi)
  const [upAddress, setUpAddress] = useState('');
  const [upConnected, setUpConnected] = useState(false);
  const [upConnecting, setUpConnecting] = useState(false);

  // Step 3: Assets
  const [assets, setAssets] = useState<TokenAsset[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [transferStatuses, setTransferStatuses] = useState<TransferStatus[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);

  // EIP-6963 wallet discovery (filter out UP extension)
  const allProviders = useEIP6963Providers();
  const legacyWallets = allProviders.filter(p =>
    !isUPWallet(p.info.rdns) && !isUPWallet(p.info.name)
  );

  // Network state
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const isOnLukso = chainId === lukso.id;

  // Detect if connected wallet in Step 1 is a UP wallet
  const isSourceUP = isSourceConnected && connector
    ? isUPWallet(connector.id) || isUPWallet(connector.name ?? '')
    : false;

  // Inline error messages
  const [upError, setUpError] = useState('');

  // --- Step 1 handlers ---

  const handleDisconnectSource = () => {
    disconnect();
    setSourceProvider(null);
    setSavedSourceAddress('');
  };

  const handleConnectWallet = (wallet: EIP6963ProviderDetail) => {
    // Save the raw provider so we can use it directly for transactions later
    // (prevents the UP extension from hijacking transactions in Step 3)
    setSourceProvider(wallet.provider);
    connect({
      connector: injected({
        target() {
          return {
            id: wallet.info.rdns,
            name: wallet.info.name,
            // EIP-6963 providers are full EIP-1193 providers at runtime
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            provider: wallet.provider as any,
          };
        },
      }),
    });
  };

  const handleSwitchToLukso = useCallback(async () => {
    setSwitchingNetwork(true);
    try {
      const ethereum = getEthereumProvider();
      if (!ethereum) return;
      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: LUKSO_CHAIN_PARAMS.chainId }],
        });
      } catch (switchError: unknown) {
        const error = switchError as { code?: number };
        if (error.code === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [LUKSO_CHAIN_PARAMS],
          });
        } else {
          throw switchError;
        }
      }
    } catch (error) {
      console.error('Failed to switch/add network:', error);
    } finally {
      setSwitchingNetwork(false);
    }
  }, []);

  // --- Step 2 handlers ---

  const handleConnectUPExtension = useCallback(async () => {
    setUpConnecting(true);
    setUpError('');
    try {
      const luksoProvider = getLuksoProvider();
      if (!luksoProvider) {
        setUpError(
          'UP Browser Extension not detected. Install it from the LUKSO website or enter your Universal Profile address manually below.'
        );
        return;
      }
      const accounts = await luksoProvider.request({
        method: 'eth_requestAccounts',
      }) as string[];
      if (accounts && accounts.length > 0) {
        const upAddr = accounts[0];
        // Prevent connecting the same address as the source wallet
        if (upAddr.toLowerCase() === savedSourceAddress.toLowerCase()) {
          setUpError('This is the same address as your source wallet. Please connect a different Universal Profile.');
          return;
        }
        setUpAddress(upAddr);
        setUpConnected(true);
        setUpError('');
      }
    } catch (error) {
      console.error('Failed to connect UP Extension:', error);
      setUpError('Failed to connect. Please try again.');
    } finally {
      setUpConnecting(false);
    }
  }, [savedSourceAddress]);

  const handleDisconnectUP = () => {
    setUpAddress('');
    setUpConnected(false);
  };

  // --- Step 3 handlers ---

  // Check if source and destination are the same
  const isSameAddress = upAddress && sourceAddress
    ? upAddress.toLowerCase() === sourceAddress.toLowerCase()
    : false;

  const handleFindAssets = async () => {
    if (!sourceAddress || !upAddress) return;
    if (isSameAddress) {
      setScanError('Source and destination addresses are the same. Please use different wallets.');
      return;
    }
    setScanning(true);
    setScanError('');
    try {
      const tokens = await fetchTokensForAddress(sourceAddress);
      setAssets(tokens);
      setTransferStatuses([]);
      setStep(3);
    } catch (error) {
      console.error('Failed to scan assets:', error);
      setScanError('Failed to scan assets. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const toggleAsset = (address: string) => {
    setAssets(prev => prev.map(a =>
      a.address === address ? { ...a, selected: !a.selected } : a
    ));
  };

  const selectAll = () => {
    setAssets(prev => prev.map(a => ({ ...a, selected: true })));
  };

  const deselectAll = () => {
    setAssets(prev => prev.map(a => ({ ...a, selected: false })));
  };

  const updateTransferAmount = (address: string, amount: string) => {
    setAssets(prev => prev.map(a =>
      a.address === address ? { ...a, transferAmount: amount } : a
    ));
  };

  const setMaxAmount = (address: string) => {
    setAssets(prev => prev.map(a => {
      if (a.address !== address) return a;
      return { ...a, transferAmount: formatUnits(BigInt(a.balance), a.decimals) };
    }));
  };

  // Send transaction via a specific provider (bypasses Wagmi to avoid UP hijack)
  const sendViaProvider = async (provider: EthereumProvider, from: string, to: string, data: string): Promise<string> => {
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from, to, data }],
    }) as string;
    return txHash;
  };

  const handleTransferAll = async () => {
    // Resolve provider: use saved one, or fall back to Wagmi connector
    let provider = sourceProvider;
    if (!provider && connector) {
      try {
        provider = await connector.getProvider() as EthereumProvider;
        setSourceProvider(provider);
      } catch {
        // ignore
      }
    }
    if (!provider || !sourceAddress || !upAddress) return;

    const selectedAssets = assets.filter(a => a.selected);
    if (selectedAssets.length === 0) return;

    setIsTransferring(true);
    setTransferStatuses(selectedAssets.map(a => ({
      address: a.address,
      status: 'pending',
    })));

    for (const asset of selectedAssets) {
      setTransferStatuses(prev => prev.map(s =>
        s.address === asset.address ? { ...s, status: 'transferring' } : s
      ));

      try {
        if (asset.type === 'LSP7') {
          let rawAmount: bigint;
          try {
            rawAmount = parseUnits(asset.transferAmount, asset.decimals);
          } catch {
            setTransferStatuses(prev => prev.map(s =>
              s.address === asset.address ? { ...s, status: 'error', error: 'Invalid amount' } : s
            ));
            continue;
          }
          if (rawAmount <= BigInt(0)) {
            setTransferStatuses(prev => prev.map(s =>
              s.address === asset.address ? { ...s, status: 'error', error: 'Amount must be greater than 0' } : s
            ));
            continue;
          }
          if (rawAmount > BigInt(asset.balance)) {
            setTransferStatuses(prev => prev.map(s =>
              s.address === asset.address ? { ...s, status: 'error', error: 'Amount exceeds balance' } : s
            ));
            continue;
          }

          const data = encodeFunctionData({
            abi: LSP7_TRANSFER_ABI,
            functionName: 'transfer',
            args: [sourceAddress as Address, upAddress as Address, rawAmount, true, '0x'],
          });

          const txHash = await sendViaProvider(provider, sourceAddress, asset.address, data);

          setTransferStatuses(prev => prev.map(s =>
            s.address === asset.address ? { ...s, status: 'success', txHash } : s
          ));

        } else if (asset.type === 'LSP8' && asset.tokenIds && asset.tokenIds.length > 0) {
          let lastTxHash = '';
          for (const tokenId of asset.tokenIds) {
            const data = encodeFunctionData({
              abi: LSP8_TRANSFER_ABI,
              functionName: 'transfer',
              args: [sourceAddress as Address, upAddress as Address, tokenId as `0x${string}`, true, '0x'],
            });

            lastTxHash = await sendViaProvider(provider, sourceAddress, asset.address, data);
          }

          setTransferStatuses(prev => prev.map(s =>
            s.address === asset.address ? { ...s, status: 'success', txHash: lastTxHash } : s
          ));
        }
      } catch (error: unknown) {
        const err = error as { shortMessage?: string; message?: string };
        setTransferStatuses(prev => prev.map(s =>
          s.address === asset.address
            ? { ...s, status: 'error', error: err.shortMessage || err.message || 'Transfer failed' }
            : s
        ));
      }
    }

    setIsTransferring(false);
  };

  const selectedCount = assets.filter(a => a.selected).length;
  const completedTransfers = transferStatuses.filter(s => s.status === 'success').length;
  const failedTransfers = transferStatuses.filter(s => s.status === 'error').length;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
            LSP Asset Mover
          </h1>
          <p className="text-gray-400 text-lg">
            Transfer your LSP7 and LSP8 assets from your legacy wallet to your Universal Profile
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 font-semibold text-sm ${
            step >= 1 ? 'border-pink-500 bg-pink-500/20 text-pink-500' : 'border-gray-600 text-gray-600'
          }`}>
            1
          </div>
          <div className={`w-16 h-0.5 ${step >= 2 ? 'bg-pink-500' : 'bg-gray-600'}`} />
          <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 font-semibold text-sm ${
            step >= 2 ? 'border-pink-500 bg-pink-500/20 text-pink-500' : 'border-gray-600 text-gray-600'
          }`}>
            2
          </div>
          <div className={`w-16 h-0.5 ${step >= 3 ? 'bg-pink-500' : 'bg-gray-600'}`} />
          <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 font-semibold text-sm ${
            step >= 3 ? 'border-pink-500 bg-pink-500/20 text-pink-500' : 'border-gray-600 text-gray-600'
          }`}>
            3
          </div>
        </div>

        {/* Step 1: Connect Legacy Wallet */}
        {step === 1 && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold mb-2 text-white">Step 1: Connect Legacy Wallet</h2>
            <p className="text-gray-400 mb-6">
              Connect the legacy wallet that holds your LSP7 and LSP8 assets.
            </p>

            <div className="flex justify-center">
              {isSourceConnected ? (
                <div className="text-center w-full">
                  {isSourceUP ? (
                    <>
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                        <div className="flex items-center justify-center gap-2 text-red-400 mb-2">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-medium">Universal Profile detected</span>
                        </div>
                        <p className="text-red-400/80 text-sm">
                          Your Universal Profile connected as the source wallet. Step 1 requires a legacy wallet (e.g. MetaMask, Rabby). Please disconnect and choose a different wallet.
                        </p>
                      </div>
                      <button
                        onClick={handleDisconnectSource}
                        className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-semibold py-3 px-8 rounded-xl transition-all transform hover:scale-105"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : isOnLukso ? (
                    <>
                      <button
                        onClick={handleDisconnectSource}
                        className="w-full bg-green-500/20 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg mb-4 flex items-center justify-center gap-2 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 transition-colors group"
                      >
                        <svg className="w-5 h-5 group-hover:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <svg className="w-5 h-5 hidden group-hover:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span className="group-hover:hidden">Connected: {sourceAddress?.slice(0, 6)}...{sourceAddress?.slice(-4)}</span>
                        <span className="hidden group-hover:inline">Disconnect</span>
                      </button>
                      <button
                        onClick={async () => {
                          setSavedSourceAddress(liveAddress || '');
                          // Ensure we have the source provider (covers auto-reconnect)
                          if (!sourceProvider && connector) {
                            try {
                              const provider = await connector.getProvider() as EthereumProvider;
                              setSourceProvider(provider);
                            } catch (e) {
                              console.error('Failed to get provider from connector:', e);
                            }
                          }
                          setStep(2);
                        }}
                        className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold py-3 px-8 rounded-xl transition-all transform hover:scale-105"
                      >
                        Continue to Step 2
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 px-4 py-3 rounded-lg mb-4">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Wrong network detected
                        </div>
                        <p className="text-yellow-400/70 text-sm">
                          Your wallet is not on the LUKSO network. Switch to continue.
                        </p>
                      </div>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={handleSwitchToLukso}
                          disabled={switchingNetwork}
                          className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-all transform hover:scale-105 flex items-center gap-2"
                        >
                          {switchingNetwork ? (
                            <>
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Switching...
                            </>
                          ) : (
                            'Switch to LUKSO'
                          )}
                        </button>
                        <button
                          onClick={handleDisconnectSource}
                          className="border border-gray-600 text-gray-400 font-semibold py-3 px-6 rounded-xl hover:bg-gray-800 transition-colors"
                        >
                          Disconnect
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="w-full">
                  {legacyWallets.length > 0 ? (
                    <div className="space-y-2">
                      {legacyWallets.map((wallet) => (
                        <button
                          key={wallet.info.uuid}
                          onClick={() => handleConnectWallet(wallet)}
                          className="w-full p-4 bg-gray-800/50 border border-gray-700 rounded-xl hover:border-pink-500/50 hover:bg-gray-800 transition-all flex items-center gap-4 group"
                        >
                          <img
                            src={wallet.info.icon}
                            alt={wallet.info.name}
                            className="w-10 h-10 rounded-xl"
                          />
                          <div className="text-left flex-1">
                            <p className="text-white font-medium group-hover:text-pink-300 transition-colors">
                              {wallet.info.name}
                            </p>
                            <p className="text-xs text-gray-500">{wallet.info.rdns}</p>
                          </div>
                          <svg className="w-5 h-5 text-gray-600 group-hover:text-pink-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <svg className="w-10 h-10 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h.008a2.25 2.25 0 012.243 2.077M21 12v7.5M3 12a2.25 2.25 0 002.25 2.25h3.75a3 3 0 110 6h-.008a2.25 2.25 0 01-2.243-2.077M3 12V4.5" />
                      </svg>
                      <p className="text-gray-400 mb-1">No legacy wallets detected</p>
                      <p className="text-gray-500 text-sm">
                        Install a wallet like MetaMask or Rabby to continue.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Destination Profile */}
        {step === 2 && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold mb-2 text-white">Step 2: Destination Profile</h2>
            <p className="text-gray-400 mb-6">
              Connect your Universal Profile or enter its address. This is where the assets will be sent.
            </p>

            {/* Source wallet reminder */}
            <div className="mb-6 p-3 bg-gray-800/50 border border-gray-700 rounded-lg flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-gray-400">
                  Source: <span className="text-white font-mono">{sourceAddress?.slice(0, 6)}...{sourceAddress?.slice(-4)}</span>
                </p>
              </div>
            </div>

            {/* Connect UP Extension */}
            <div className="mb-6">
              {upConnected ? (
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-green-300">UP Connected</p>
                        <p className="text-xs text-gray-400 font-mono truncate">{upAddress}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleDisconnectUP}
                      className="text-sm text-gray-400 hover:text-white py-1.5 px-3 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleConnectUPExtension}
                  disabled={upConnecting}
                  className="w-full p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl hover:bg-pink-500/20 transition-colors flex items-center justify-center gap-3 group"
                >
                  {upConnecting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-pink-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-pink-300 font-medium">Connecting...</span>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center group-hover:bg-pink-500/30 transition-colors">
                        <svg className="w-5 h-5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-pink-300">Connect UP Browser Extension</p>
                        <p className="text-xs text-gray-400">Use the Universal Profile extension to connect</p>
                      </div>
                    </>
                  )}
                </button>
              )}

              {/* UP connection error */}
              {upError && !upConnected && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {upError}
                </div>
              )}
            </div>

            {/* Manual address input */}
            {!upConnected && (
              <div className="border-t border-gray-800 pt-6">
                <p className="text-gray-400 mb-4 text-sm">
                  Or enter your Universal Profile address manually:
                </p>
                <input
                  type="text"
                  placeholder="0x..."
                  value={upAddress}
                  onChange={(e) => { setUpAddress(e.target.value); setUpError(''); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 transition-colors font-mono text-sm"
                />
              </div>
            )}

            {/* Same address warning */}
            {isSameAddress && (
              <div className="mt-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Source and destination are the same address. Use a different wallet.
              </div>
            )}

            {/* Error */}
            {scanError && !isSameAddress && (
              <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {scanError}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-gray-600 text-gray-400 font-semibold py-3 px-6 rounded-xl hover:bg-gray-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleFindAssets}
                disabled={!upAddress || scanning || isSameAddress}
                className={`flex-1 font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 ${
                  upAddress && !scanning && !isSameAddress
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white transform hover:scale-[1.02]'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {scanning ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Scanning...
                  </>
                ) : (
                  'Find My Assets'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Transfer Assets */}
        {step === 3 && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold mb-2 text-white">Step 3: Transfer Assets</h2>
            <p className="text-gray-400 mb-6">
              Select the assets you want to transfer to your Universal Profile.
            </p>

            {/* Address summary */}
            <div className="mb-6 grid grid-cols-1 gap-2">
              <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg flex items-center gap-3 text-sm">
                <span className="text-gray-500 w-12 shrink-0">From</span>
                <span className="text-white font-mono truncate">{sourceAddress}</span>
              </div>
              <div className="flex justify-center">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg flex items-center gap-3 text-sm">
                <span className="text-gray-500 w-12 shrink-0">To</span>
                <span className="text-white font-mono truncate">{upAddress}</span>
              </div>
            </div>

            {/* Asset list */}
            {assets.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-gray-400 mb-2">No assets found</p>
                <p className="text-gray-500 text-sm">This wallet doesn&apos;t hold any LSP7 or LSP8 tokens on LUKSO.</p>
              </div>
            ) : (
              <>
                {/* Select controls */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-400">
                    {selectedCount} of {assets.length} selected
                  </p>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-pink-400 hover:text-pink-300 transition-colors">
                      Select all
                    </button>
                    <span className="text-gray-600">·</span>
                    <button onClick={deselectAll} className="text-xs text-gray-400 hover:text-gray-300 transition-colors">
                      Deselect all
                    </button>
                  </div>
                </div>

                {/* Token list */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {assets.map((asset) => {
                    const status = transferStatuses.find(s => s.address === asset.address);
                    return (
                      <div
                        key={asset.address}
                        onClick={() => !isTransferring && toggleAsset(asset.address)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          asset.selected
                            ? 'bg-pink-500/10 border-pink-500/30'
                            : 'bg-gray-800/30 border-gray-700 hover:border-gray-600'
                        } ${isTransferring ? 'cursor-default' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Checkbox */}
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                            asset.selected ? 'bg-pink-500 border-pink-500' : 'border-gray-600'
                          }`}>
                            {asset.selected && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>

                          {/* Token icon */}
                          {asset.iconUrl ? (
                            <img
                              src={asset.iconUrl}
                              alt={asset.name}
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                              asset.type === 'LSP7' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                            }`}>
                              {asset.symbol.slice(0, 2)}
                            </div>
                          )}

                          {/* Token info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium truncate">{asset.name}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                asset.type === 'LSP7'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-purple-500/20 text-purple-400'
                              }`}>
                                {asset.type}
                              </span>
                            </div>
                            {asset.type === 'LSP7' ? (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="relative flex items-center">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={asset.transferAmount}
                                    onChange={(e) => {
                                      // Allow only valid decimal numbers
                                      const val = e.target.value;
                                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                        updateTransferAmount(asset.address, val);
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={isTransferring}
                                    className="w-28 bg-gray-900/60 border border-gray-600 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-pink-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    placeholder="0.0"
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMaxAmount(asset.address);
                                    }}
                                    disabled={isTransferring}
                                    className="ml-1 text-xs text-pink-400 hover:text-pink-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    MAX
                                  </button>
                                </div>
                                <span className="text-xs text-gray-500">
                                  / {formatBalance(asset.balance, asset.decimals)} {asset.symbol}
                                </span>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">
                                {asset.balance} NFT{parseInt(asset.balance) !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>

                          {/* Transfer status */}
                          {status && (
                            <div className="shrink-0">
                              {status.status === 'transferring' && (
                                <svg className="animate-spin h-5 w-5 text-pink-400" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              )}
                              {status.status === 'success' && (
                                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                              {status.status === 'error' && (
                                <div className="group relative">
                                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {status.error && (
                                    <div className="absolute right-0 bottom-full mb-2 w-48 p-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-red-400 hidden group-hover:block z-10">
                                      {status.error}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Transfer summary */}
            {transferStatuses.length > 0 && !isTransferring && (
              <div className={`mt-4 p-3 rounded-lg border text-sm ${
                failedTransfers > 0
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                  : 'bg-green-500/10 border-green-500/30 text-green-400'
              }`}>
                {completedTransfers} of {transferStatuses.length} transfers completed
                {failedTransfers > 0 && ` · ${failedTransfers} failed`}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4 mt-6">
              <button
                onClick={() => { setStep(2); setTransferStatuses([]); }}
                disabled={isTransferring}
                className="flex-1 border border-gray-600 text-gray-400 font-semibold py-3 px-6 rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleTransferAll}
                disabled={selectedCount === 0 || isTransferring || assets.length === 0}
                className={`flex-1 font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 ${
                  selectedCount > 0 && !isTransferring
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white transform hover:scale-[1.02]'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isTransferring ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Transferring...
                  </>
                ) : (
                  `Transfer ${selectedCount} Asset${selectedCount !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-gray-600 text-xs space-y-1">
          <p>Powered by LUKSO</p>
          <p>
            Use at your own risk ·{' '}
            <a
              href="https://github.com/JordyDutch/LSP-Asset-Mover"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-400 transition-colors"
            >
              Open-source
            </a>
            {' '}· MIT License
          </p>
        </div>
      </div>
    </main>
  );
}
