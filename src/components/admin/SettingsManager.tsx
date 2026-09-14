"use client";

import { useState } from "react";
import { CheckCircleIcon, GearSixIcon, LifebuoyIcon } from "@phosphor-icons/react";

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
