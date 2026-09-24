declare const liveContract: {
  LIVE_PROVISION_CONFIRMATION: string;
  liveContractEnvNames: Record<string, string>;
  missingLiveContract(env: Record<string, string | undefined>): string[];
  readLiveAppContract(env: Record<string, string | undefined>): Promise<string | null>;
  validateLiveContract(
    env: Record<string, string | undefined>,
    options?: { requireWrapper?: boolean; requireConfirmation?: boolean },
  ): string | null;
};

export = liveContract;
