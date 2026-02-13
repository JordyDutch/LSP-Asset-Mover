'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { lukso } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

const queryClient = new QueryClient();

export const config = createConfig({
  chains: [lukso],
  connectors: [injected()],
  transports: {
    [lukso.id]: http(),
  },
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
