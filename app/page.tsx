'use client';

import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

export default function Home() {
  const [step, setStep] = useState(1);
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const [upAddress, setUpAddress] = useState('');

  const handleConnectMetaMask = () => {
    connect({ connector: injected({ target: 'metaMask' }) });
  };

  const handleNextStep = () => {
    if (step === 1 && isConnected) {
      setStep(2);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
            LSP Asset Mover
          </h1>
          <p className="text-gray-400 text-lg">
            Transfer your LSP7 and LSP8 assets from MetaMask to your Universal Profile
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
            step >= 1 ? 'border-pink-500 bg-pink-500/20 text-pink-500' : 'border-gray-600 text-gray-600'
          }`}>
            1
          </div>
          <div className={`w-24 h-0.5 ${step >= 2 ? 'bg-pink-500' : 'bg-gray-600'}`} />
          <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
            step >= 2 ? 'border-pink-500 bg-pink-500/20 text-pink-500' : 'border-gray-600 text-gray-600'
          }`}>
            2
          </div>
        </div>

        {/* Step 1: Connect MetaMask */}
        {step === 1 && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold mb-4 text-white">Step 1: Connect MetaMask</h2>
            <p className="text-gray-400 mb-6">
              Connect your MetaMask wallet that holds your LSP7 and LSP8 assets.
            </p>
            
            <div className="flex justify-center">
              {isConnected ? (
                <div className="text-center">
                  <div className="bg-green-500/20 border border-green-500 text-green-400 px-4 py-2 rounded-lg mb-4">
                    Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
                  </div>
                  <button
                    onClick={handleNextStep}
                    className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold py-3 px-8 rounded-xl transition-all transform hover:scale-105"
                  >
                    Continue to Step 2
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectMetaMask}
                  className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold py-3 px-8 rounded-xl transition-all transform hover:scale-105 flex items-center gap-2"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 13 4.45 6.23 3.89 4.41 1.88 1.41 6.66 8.5 12 6.67z" fill="#FBBC05"/>
                    <path d="M12 13l2.94-2.24L6.66 8.5 1.88 1.41 12 13z" fill="#EA4335"/>
                    <path d="M12 6.67V13l5.34-1.83L12 6.67z" fill="#4285F4"/>
                    <path d="M12 6.67V3c0-1.1-.9-2-2-2H3.41l8.59 5.67z" fill="#34A853"/>
                  </svg>
                  Connect MetaMask
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Connect Universal Profile */}
        {step === 2 && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 backdrop-blur-sm">
            <h2 className="text-2xl font-semibold mb-4 text-white">Step 2: Connect Universal Profile</h2>
            <p className="text-gray-400 mb-6">
              Connect your LUKSO Universal Profile where you want to receive the assets.
            </p>
            
            <div className="flex justify-center mb-6">
              <ConnectButton 
                showBalance={false}
                chainStatus="icon"
                accountStatus="address"
              />
            </div>

            <div className="border-t border-gray-800 pt-6 mt-6">
              <p className="text-gray-400 mb-4">
                Or enter your Universal Profile address manually:
              </p>
              <input
                type="text"
                placeholder="0x..."
                value={upAddress}
                onChange={(e) => setUpAddress(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 transition-colors"
              />
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border border-gray-600 text-gray-400 font-semibold py-3 px-6 rounded-xl hover:bg-gray-800 transition-colors"
              >
                Back
              </button>
              <button
                disabled={!upAddress}
                className={`flex-1 font-semibold py-3 px-6 rounded-xl transition-all ${
                  upAddress 
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white' 
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                Find My Assets
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>Powered by LUKSO · Built with RainbowKit & Next.js</p>
        </div>
      </div>
    </main>
  );
}