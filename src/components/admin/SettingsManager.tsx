"use client";

import { useState } from "react";

import { useDemoState, updateDemoState } from "@/lib/demo/store";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";

export function SettingsManager() {
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
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-5 pb-12 pt-6 sm:px-8">
      <Panel
        description="Use a generic support destination for inactive cards, unavailable profiles, and account help. Keep customer-specific data out of this setting."
        title="Support contact"
      >
        <form className="mt-6 grid max-w-xl gap-5" onSubmit={save}>
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          <Field
            id="support-url"
            label="Support destination"
            onChange={(event) => setSupportUrl(event.target.value)}
            value={supportUrl}
          />
          <div>
            <Button type="submit">Save settings</Button>
          </div>
        </form>
      </Panel>
      <Panel
        description="Local demo mode keeps customer data and invitation links in this browser only. Production deployment must connect Convex, email delivery, storage, monitoring, and an approved domain before launch."
        title="Launch gates"
      >
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
