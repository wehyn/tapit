"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CheckCircleIcon, GearSixIcon, LifebuoyIcon } from "@phosphor-icons/react";

import { useDemoState, updateDemoState } from "@/lib/demo/store";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";

function DemoSettingsManager() {
  // Retained only as an inert compatibility helper for the merged worktree.
  const state = useDemoState();
  const [supportUrl, setSupportUrl] = useState(state.supportUrl);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = supportUrl.trim();
    try {
      const parsed = new URL(value);
      if (!["https:", "mailto:"].includes(parsed.protocol)) throw new Error();
    } catch {
      setMessage({
        tone: "error",
        text: "Support destination must be a valid HTTPS or mailto address.",
      });
      return;
    }
    updateDemoState((current) => ({
      ...current,
      supportUrl: value,
      audits: [
        {
          id: `audit-${Date.now()}`,
          actor: "admin@tapit.local",
          action: "settings.support_updated",
          target: "supportUrl",
          occurredAt: new Date().toISOString(),
          before: current.supportUrl,
          after: value,
        },
        ...current.audits,
      ],
    }));
    setMessage({ tone: "success", text: "Support destination saved." });
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <Panel
        description="Use a generic support destination for inactive cards, unavailable profiles, and account help. Keep customer-specific data out of this setting."
        title="Support contact"
      >
        <form className="mt-6 grid max-w-xl gap-5" onSubmit={save}>
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          <div className="flex items-center gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-4 text-sm text-tapit-muted">
            <GearSixIcon aria-hidden="true" className="shrink-0 text-tapit-accent" size={22} />
            <span>One destination is used for public support states and account help.</span>
          </div>
          <Field
            id="support-url"
            label="Support destination"
            onChange={(event) => setSupportUrl(event.target.value)}
            value={supportUrl}
          />
          <div>
            <Button type="submit">
              <CheckCircleIcon aria-hidden="true" className="mr-2" size={18} />
              Save settings
            </Button>
          </div>
        </form>
      </Panel>
      <Panel
        description="Local demo mode keeps customer data and invitation links in this browser only. Production deployment must connect Convex, email delivery, storage, monitoring, and an approved domain before launch."
        title="Launch gates"
      >
        <p className="mt-4 flex items-center gap-2 text-sm text-tapit-muted">
          <LifebuoyIcon aria-hidden="true" className="text-tapit-accent" size={20} />
          Operational readiness checklist
        </p>
        <ul className="mt-5 grid gap-3 text-sm leading-6 text-tapit-muted">
          <li>Convex deployment and generated bindings</li>
          <li>Password recovery, email verification, and login rate limiting</li>
          <li>Transactional email provider and retention policy</li>
          <li>Real-device NFC and QR verification</li>
        </ul>
      </Panel>
    </div>
  );
}

function LiveSettingsManager() {
  // Retained only as an inert compatibility helper for the merged worktree.
  const configured = useQuery(api.settings.support);
  const saveSupport = useMutation(api.settings.setSupport);
  const [supportUrl, setSupportUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const value = supportUrl ?? configured ?? "";
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    try {
      const result = await saveSupport({ value });
      setSupportUrl(result.value);
      setMessage({ tone: "success", text: "Support destination saved." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Settings could not be saved.",
      });
    }
  }
  if (configured === undefined)
    return <div className="p-8 text-sm text-tapit-muted">Loading settings…</div>;
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <Panel
        description="This destination is used for generic support states and account help."
        title="Support contact"
      >
        <form className="mt-6 grid max-w-xl gap-5" onSubmit={save}>
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          <Field
            id="support-url"
            label="Support destination"
            onChange={(event) => setSupportUrl(event.target.value)}
            value={value}
          />
          <div>
            <Button disabled={saveSupport === undefined} type="submit">
              Save settings
            </Button>
          </div>
        </form>
      </Panel>
      <Panel
        description="Live mode stores settings in Convex and records sensitive administrator changes in the audit log."
        title="Launch gates"
      >
        <p className="mt-4 flex items-center gap-2 text-sm text-tapit-muted">
          <LifebuoyIcon aria-hidden="true" className="text-tapit-accent" size={20} />
          Operational readiness checklist
        </p>
      </Panel>
    </div>
  );
}
export function SettingsManager() {
  return !isLocalDemoMode() ? <LiveSettingsManager /> : <DemoSettingsManager />;
}
