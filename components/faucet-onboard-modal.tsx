"use client";

import MainnetFundingModal from "./mainnet-funding-modal";

/** Compatibility for saved UI imports. This component only reads real balances. */
export default function FaucetOnboardModal(props: {
  open: boolean;
  onClose: () => void;
  walletAddress: `0x${string}` | null;
  onWalletConnected: (address: `0x${string}`) => void;
  onClaimSuccess?: (amount: number, hash?: string) => void;
  currentCash?: number;
}) {
  return (
    <MainnetFundingModal
      open={props.open}
      onClose={props.onClose}
      walletAddress={props.walletAddress}
      onWalletConnected={props.onWalletConnected}
    />
  );
}
