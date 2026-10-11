"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { bsc } from "viem/chains";
import type { ReactNode } from "react";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
if (!PRIVY_APP_ID)
  throw new Error("Set NEXT_PUBLIC_PRIVY_APP_ID before building Stockva.");

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#f0b90b",
          walletChainType: "ethereum-only",
          showWalletLoginFirst: true,
          logo: "/assets/ai_logo.png",
        },
        defaultChain: bsc,
        supportedChains: [bsc],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
