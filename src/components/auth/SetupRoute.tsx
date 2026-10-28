"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";

import { InvalidClaim, LoadingClaim, PreparedClaimPage } from "@/components/auth/PreparedClaimPage";
import { SetupForm } from "@/components/auth/SetupForm";
import type { SetupPreview } from "@/components/auth/setup-claim-state";
import { hashSetupToken } from "@/lib/auth/setup-token";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { setupPreview as demoSetupPreview, useDemoState } from "@/lib/demo/store";
import { api } from "../../../convex/_generated/api";

export function SetupRoute({ token }: { token: string }) {
  return isLocalDemoMode() ? <LocalSetupRoute token={token} /> : <ConvexSetupRoute token={token} />;
}

function LocalSetupRoute({ token }: { token: string }) {
  const demoState = useDemoState();
  const legacy = demoState.customers.some((customer) => customer.setupToken === token);
  const [preview, setPreview] = useState<SetupPreview | null | undefined>();
  const [tokenHash, setTokenHash] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([hashSetupToken(token), demoSetupPreview(token)])
      .then(([hash, result]) => {
        if (cancelled) return;
        setTokenHash(hash);
        setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (preview === undefined) return <LoadingClaim />;
  if (preview !== null && tokenHash !== undefined) {
    return <PreparedClaimPage preview={preview} token={token} tokenHash={tokenHash} />;
  }
  if (legacy) return <SetupForm token={token} />;
  return <InvalidClaim />;
}

function ConvexSetupRoute({ token }: { token: string }) {
  const [tokenHash, setTokenHash] = useState<string>();
  const [preparedPreview, setPreparedPreview] = useState<SetupPreview>();
  useEffect(() => {
    let cancelled = false;
    void hashSetupToken(token)
      .then((hash) => {
        if (!cancelled) setTokenHash(hash);
      })
      .catch(() => {
        if (!cancelled) setTokenHash("");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const preview = useQuery(api.invitations.setupPreview, tokenHash ? { tokenHash } : "skip");
  const status = useQuery(api.invitations.status, tokenHash ? { tokenHash } : "skip");

  useEffect(() => {
    if (preview !== undefined && preview !== null) {
      queueMicrotask(() => setPreparedPreview(preview));
    }
  }, [preview]);

  if (preparedPreview !== undefined && tokenHash !== undefined) {
    return <PreparedClaimPage preview={preparedPreview} token={token} tokenHash={tokenHash} />;
  }
  if (tokenHash === "") return <InvalidClaim />;
  if (tokenHash === undefined || preview === undefined || status === undefined)
    return <LoadingClaim />;
  if (preview !== null) return <LoadingClaim />;
  if (status.state === "valid" || status.state === "revoked") return <SetupForm token={token} />;
  return <InvalidClaim />;
}
