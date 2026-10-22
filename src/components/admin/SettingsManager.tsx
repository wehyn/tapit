"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

import { useDemoState, updateDemoState } from "@/lib/demo/store";

import { Button } from "@/components/ui/Button";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Card } from "@/components/ui/Card";
import { Tile } from "@/components/ui/Tile";

const launchGates = [
  "Convex deployment and generated bindings",
  "Password recovery, email verification, and login rate limiting",
  "Transactional email provider and retention policy",
  "Real-device NFC and QR verification",
];

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
    <div className="flex min-w-0 flex-col gap-8 pt-2">
      <AdminPageHeader description="Support destination and launch readiness." title="Settings" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card
          description="Use a generic support destination for inactive cards, unavailable profiles, and account help. Keep customer-specific data out of this setting."
          title="Support contact"
        >
          <form className="flex flex-col gap-4" onSubmit={save}>
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            <Field
              help="Email address or https link."
              id="support-url"
              label="Support destination"
              onChange={(event) => setSupportUrl(event.target.value)}
              value={supportUrl}
            />
            <div className="flex flex-wrap items-center justify-end gap-4">
              <Button type="submit">Save settings</Button>
            </div>
          </form>
        </Card>
        <Card
          description="Local demo mode keeps customer data and invitation links in this browser only. Production deployment must connect Convex, email delivery, storage, monitoring, and an approved domain before launch."
          title="Launch gates"
        >
          <p className="text-sm font-semibold text-tapit-ink">Operational readiness checklist</p>
          <ul className="flex flex-col gap-2">
            {launchGates.map((gate) => (
              <li key={gate}>
                <Tile className="text-sm text-tapit-ink">{gate}</Tile>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Environment">
          <div className="flex flex-col gap-2">
            <Tile tone="white">
              <span className="grow text-sm text-tapit-muted">Mode</span>
              <Chip tone="accent">Demo</Chip>
            </Tile>
            <Tile tone="white">
              <span className="grow text-sm text-tapit-muted">Data</span>
              <span className="text-sm text-tapit-ink">Browser-local fixtures</span>
            </Tile>
          </div>
        </Card>
      </div>
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
    return (
      <div className="flex min-w-0 flex-col gap-8 pt-2">
        <AdminPageHeader description="Support destination and launch readiness." title="Settings" />
        <Notice>Loading settings…</Notice>
      </div>
    );
  return (
    <div className="flex min-w-0 flex-col gap-8 pt-2">
      <AdminPageHeader description="Support destination and launch readiness." title="Settings" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card
          description="This destination is used for generic support states and account help."
          title="Support contact"
        >
          <form className="flex flex-col gap-4" onSubmit={save}>
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            <Field
              help="Email address or https link."
              id="support-url"
              label="Support destination"
              onChange={(event) => setSupportUrl(event.target.value)}
              value={value}
            />
            <div className="flex flex-wrap items-center justify-end gap-4">
              <Button disabled={saveSupport === undefined} type="submit">
                Save settings
              </Button>
            </div>
          </form>
        </Card>
        <Card
          description="Live mode stores settings in Convex and records sensitive administrator changes in the audit log."
          title="Launch gates"
        >
          <p className="text-sm font-semibold text-tapit-ink">Operational readiness checklist</p>
        </Card>
        <Card title="Environment">
          <div className="flex flex-col gap-2">
            <Tile tone="white">
              <span className="grow text-sm text-tapit-muted">Mode</span>
              <Chip tone="accent">Live</Chip>
            </Tile>
            <Tile tone="white">
              <span className="grow text-sm text-tapit-muted">Data</span>
              <span className="text-sm text-tapit-ink">Convex</span>
            </Tile>
          </div>
        </Card>
      </div>
    </div>
  );
}
export function SettingsManager() {
  return !isLocalDemoMode() ? <LiveSettingsManager /> : <DemoSettingsManager />;
}
