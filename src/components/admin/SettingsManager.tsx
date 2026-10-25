"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import {
  deactivateDemoCardOrderPaymentMethod,
  deactivateDemoCardOrderReferralCode,
  getDemoCardOrderAdminSettings,
  saveDemoCardOrderPaymentMethod,
  saveDemoCardOrderReferralCode,
  setDemoCardOrderLaunchEndDate,
} from "@/lib/demo/card-ordering";
import { useDemoState, updateDemoState } from "@/lib/demo/store";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Field, TextareaField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Tile } from "@/components/ui/Tile";

const launchGates = [
  "Convex deployment and generated bindings",
  "Password recovery, email verification, and login rate limiting",
  "Transactional email provider and retention policy",
  "Real-device NFC and QR verification",
];

type PaymentMethod = {
  id: string;
  provider: string;
  label: string;
  accountDetails: string;
  instructions: string;
  active: boolean;
};

type ReferralCode = {
  id: string;
  code: string;
  referrerLabel: string;
  fixedPriceCentavos?: number;
  active: boolean;
};

type CardOrderSettings = {
  launchEndDate: string | null;
  paymentMethods: PaymentMethod[];
  referralCodes: ReferralCode[];
};

type PaymentMethodInput = Omit<PaymentMethod, "id" | "active"> & { id?: string };
type ReferralCodeInput = Omit<ReferralCode, "id" | "active"> & { id?: string };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function CardOrderSettings({
  settings,
  onSetLaunchEndDate,
  onSavePaymentMethod,
  onDeactivatePaymentMethod,
  onSaveReferralCode,
  onDeactivateReferralCode,
}: {
  settings: CardOrderSettings;
  onSetLaunchEndDate: (date: string | null) => Promise<void>;
  onSavePaymentMethod: (input: PaymentMethodInput) => Promise<void>;
  onDeactivatePaymentMethod: (id: string) => Promise<void>;
  onSaveReferralCode: (input: ReferralCodeInput) => Promise<void>;
  onDeactivateReferralCode: (id: string) => Promise<void>;
}) {
  const [launchEndDate, setLaunchEndDate] = useState(settings.launchEndDate ?? "");
  const [launchEndDateEdited, setLaunchEndDateEdited] = useState(false);
  const launchEndDateValue = launchEndDateEdited ? launchEndDate : (settings.launchEndDate ?? "");
  const [paymentEditId, setPaymentEditId] = useState<string | undefined>();
  const [paymentProvider, setPaymentProvider] = useState("");
  const [paymentLabel, setPaymentLabel] = useState("");
  const [paymentAccountDetails, setPaymentAccountDetails] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [referralEditId, setReferralEditId] = useState<string | undefined>();
  const [referralCode, setReferralCode] = useState("");
  const [referrerLabel, setReferrerLabel] = useState("");
  const [fixedPricePesos, setFixedPricePesos] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function perform(action: () => Promise<void>, successText: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "success", text: successText });
      return true;
    } catch (error) {
      setMessage({ tone: "error", text: getErrorMessage(error, "Settings could not be saved.") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveLaunchEndDate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await perform(
      () => onSetLaunchEndDate(launchEndDateValue || null),
      "Launch end date saved.",
    );
    if (saved) setLaunchEndDateEdited(false);
  }

  async function savePaymentMethod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await perform(
      () =>
        onSavePaymentMethod({
          id: paymentEditId,
          provider: paymentProvider,
          label: paymentLabel,
          accountDetails: paymentAccountDetails,
          instructions: paymentInstructions,
        }),
      paymentEditId ? "Payment method updated." : "Payment method added.",
    );
    if (saved) resetPaymentForm();
  }

  async function saveReferralCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await perform(
      () =>
        onSaveReferralCode({
          id: referralEditId,
          code: referralCode,
          referrerLabel,
          fixedPriceCentavos: fixedPricePesos === "" ? undefined : Number(fixedPricePesos) * 100,
        }),
      referralEditId ? "Referral code updated." : "Referral code added.",
    );
    if (saved) resetReferralForm();
  }

  function resetPaymentForm() {
    setPaymentEditId(undefined);
    setPaymentProvider("");
    setPaymentLabel("");
    setPaymentAccountDetails("");
    setPaymentInstructions("");
  }

  function resetReferralForm() {
    setReferralEditId(undefined);
    setReferralCode("");
    setReferrerLabel("");
    setFixedPricePesos("");
  }

  return (
    <>
      <AdminPageHeader
        description="Manage launch pricing, payment methods, referrals, and support."
        title="Settings"
      />
      <Card
        description="The Manila pricing cutoff is this date: cards cost ₱599 before it and ₱799 on or after it. Leave blank to close ordering."
        title="Card ordering launch"
      >
        <form
          className="mt-4 flex max-w-xl flex-col items-start gap-4 sm:flex-row sm:items-end"
          onSubmit={saveLaunchEndDate}
        >
          <div className="w-full sm:max-w-xs">
            <Field
              id="card-order-launch-end-date"
              label="Launch end date"
              onChange={(event) => {
                setLaunchEndDate(event.target.value);
                setLaunchEndDateEdited(true);
              }}
              type="date"
              value={launchEndDateValue}
            />
          </div>
          <Button disabled={busy} type="submit">
            Save date
          </Button>
        </form>
      </Card>

      <Card
        description="Add multiple payment destinations for each provider. Customers see active payment methods and their instructions."
        title="Payment methods"
      >
        <form className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={savePaymentMethod}>
          <Field
            id="payment-provider"
            label="Provider"
            onChange={(event) => setPaymentProvider(event.target.value)}
            placeholder="GCash"
            required
            value={paymentProvider}
          />
          <Field
            id="payment-label"
            label="Method label"
            onChange={(event) => setPaymentLabel(event.target.value)}
            placeholder="GCash · Main account"
            required
            value={paymentLabel}
          />
          <Field
            id="payment-account-details"
            label="Account details"
            onChange={(event) => setPaymentAccountDetails(event.target.value)}
            required
            value={paymentAccountDetails}
          />
          <TextareaField
            id="payment-instructions"
            label="Payment instructions"
            onChange={(event) => setPaymentInstructions(event.target.value)}
            required
            value={paymentInstructions}
          />
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button disabled={busy} type="submit">
              {paymentEditId ? "Save payment method" : "Add payment method"}
            </Button>
            {paymentEditId ? (
              <Button disabled={busy} onClick={resetPaymentForm} type="button" variant="secondary">
                Stop editing
              </Button>
            ) : null}
          </div>
        </form>
        <div className="mt-6 grid gap-3">
          {settings.paymentMethods.length === 0 ? (
            <p className="text-sm text-tapit-muted">No payment methods configured.</p>
          ) : (
            settings.paymentMethods.map((method) => (
              <div
                className="flex flex-col gap-4 rounded-card bg-tapit-paper/60 p-4 sm:flex-row sm:items-start sm:justify-between"
                key={method.id}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-tapit-ink">{method.label}</p>
                  <p className="mt-1 text-sm text-tapit-muted">
                    {method.provider} · {method.active ? "Active" : "Inactive"}
                  </p>
                  <p className="mt-2 break-words text-sm leading-6 text-tapit-muted">
                    {method.accountDetails}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setPaymentEditId(method.id);
                      setPaymentProvider(method.provider);
                      setPaymentLabel(method.label);
                      setPaymentAccountDetails(method.accountDetails);
                      setPaymentInstructions(method.instructions);
                    }}
                    type="button"
                    variant="secondary"
                  >
                    Edit
                  </Button>
                  {method.active ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void perform(
                          () => onDeactivatePaymentMethod(method.id),
                          "Payment method deactivated.",
                        )
                      }
                      type="button"
                      variant="quiet"
                    >
                      Deactivate
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card
        description="Referral codes are unique across active and inactive codes. Keep the referrer label recognizable to your team."
        title="Referral codes"
      >
        <form className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={saveReferralCode}>
          <Field
            autoCapitalize="characters"
            id="referral-code"
            label="Referral code"
            onChange={(event) => setReferralCode(event.target.value)}
            placeholder="PARTNER10"
            required
            value={referralCode}
          />
          <Field
            id="referrer-label"
            label="Referrer label"
            onChange={(event) => setReferrerLabel(event.target.value)}
            placeholder="Studio Santos"
            required
            value={referrerLabel}
          />
          <Field
            id="referral-fixed-price"
            label="Fixed card price (₱, optional)"
            min="1"
            onChange={(event) => setFixedPricePesos(event.target.value)}
            placeholder="Leave blank for 10% off"
            step="1"
            type="number"
            value={fixedPricePesos}
          />
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button disabled={busy} type="submit">
              {referralEditId ? "Save referral code" : "Add referral code"}
            </Button>
            {referralEditId ? (
              <Button disabled={busy} onClick={resetReferralForm} type="button" variant="secondary">
                Stop editing
              </Button>
            ) : null}
          </div>
        </form>
        <div className="mt-6 grid gap-3">
          {settings.referralCodes.length === 0 ? (
            <p className="text-sm text-tapit-muted">No referral codes configured.</p>
          ) : (
            settings.referralCodes.map((referral) => (
              <div
                className="flex flex-col gap-4 rounded-card bg-tapit-paper/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                key={referral.id}
              >
                <div>
                  <p className="font-semibold text-tapit-ink">{referral.code}</p>
                  <p className="mt-1 text-sm text-tapit-muted">
                    {referral.referrerLabel} · {referral.active ? "Active" : "Inactive"} ·{" "}
                    {referral.fixedPriceCentavos === undefined
                      ? "10% off"
                      : `Fixed price · ${formatPHP(referral.fixedPriceCentavos)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setReferralEditId(referral.id);
                      setReferralCode(referral.code);
                      setReferrerLabel(referral.referrerLabel);
                      setFixedPricePesos(
                        referral.fixedPriceCentavos === undefined
                          ? ""
                          : String(referral.fixedPriceCentavos / 100),
                      );
                    }}
                    type="button"
                    variant="secondary"
                  >
                    Edit
                  </Button>
                  {referral.active ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void perform(
                          () => onDeactivateReferralCode(referral.id),
                          "Referral code deactivated.",
                        )
                      }
                      type="button"
                      variant="quiet"
                    >
                      Deactivate
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </>
  );
}

function DemoSettingsManager() {
  const state = useDemoState();
  const [supportUrl, setSupportUrl] = useState(state.supportUrl);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const cardOrderSettings = getDemoCardOrderAdminSettings();

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
      <CardOrderSettings
        onDeactivatePaymentMethod={deactivateDemoCardOrderPaymentMethod}
        onDeactivateReferralCode={deactivateDemoCardOrderReferralCode}
        onSavePaymentMethod={async (input) => {
          await saveDemoCardOrderPaymentMethod(input);
        }}
        onSaveReferralCode={async (input) => {
          await saveDemoCardOrderReferralCode(input);
        }}
        onSetLaunchEndDate={setDemoCardOrderLaunchEndDate}
        settings={cardOrderSettings}
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card
          description="Use a generic support destination for inactive cards, unavailable profiles, and account help. Keep customer-specific data out of this setting."
          title="Support contact"
        >
          <form className="mt-6 grid max-w-xl gap-4" onSubmit={save}>
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            <div className="flex items-start gap-3 rounded-card bg-tapit-paper/70 p-4 text-sm leading-6 text-tapit-muted">
              <Icon
                aria-hidden="true"
                className="mt-1 shrink-0 text-tapit-accent"
                name="settings"
                size={22}
              />
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
                <Icon aria-hidden="true" className="mr-2" name="check" size={18} />
                Save settings
              </Button>
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
  const configured = useQuery(api.settings.support);
  const cardOrderSettings = useQuery(api.cardOrderSettings.adminSettings);
  const saveSupport = useMutation(api.settings.setSupport);
  const saveLaunchEndDate = useMutation(api.cardOrderSettings.setLaunchEndDate);
  const savePaymentMethod = useMutation(api.cardOrderSettings.savePaymentMethod);
  const deactivatePaymentMethod = useMutation(api.cardOrderSettings.deactivatePaymentMethod);
  const saveReferralCode = useMutation(api.cardOrderSettings.saveReferralCode);
  const deactivateReferralCode = useMutation(api.cardOrderSettings.deactivateReferralCode);
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
        text: getErrorMessage(error, "Settings could not be saved."),
      });
    }
  }

  if (configured === undefined)
    return (
      <div className="flex min-w-0 flex-col gap-8 pt-2">
        <AdminPageHeader
          description="Manage support destinations and review current launch readiness notes."
          title="Settings"
        />
        <Notice>Loading settings…</Notice>
      </div>
    );

  const settings: CardOrderSettings | undefined = cardOrderSettings && {
    launchEndDate: cardOrderSettings.launchEndDate,
    paymentMethods: cardOrderSettings.paymentMethods.map(({ _id, ...method }) => ({
      id: _id,
      ...method,
    })),
    referralCodes: cardOrderSettings.referralCodes.map(({ _id, ...referral }) => ({
      id: _id,
      ...referral,
    })),
  };

  return (
    <div className="flex min-w-0 flex-col gap-8 pt-2">
      {settings ? (
        <CardOrderSettings
          onDeactivatePaymentMethod={async (id) => {
            await deactivatePaymentMethod({ id: id as Id<"cardOrderPaymentMethods"> });
          }}
          onDeactivateReferralCode={async (id) => {
            await deactivateReferralCode({ id: id as Id<"cardOrderReferralCodes"> });
          }}
          onSavePaymentMethod={async ({ id, ...fields }) => {
            await savePaymentMethod({
              ...(id ? { id: id as Id<"cardOrderPaymentMethods"> } : {}),
              ...fields,
            });
          }}
          onSaveReferralCode={async ({ id, ...fields }) => {
            await saveReferralCode({
              ...(id ? { id: id as Id<"cardOrderReferralCodes"> } : {}),
              ...fields,
            });
          }}
          onSetLaunchEndDate={async (date) => {
            await saveLaunchEndDate({ date });
          }}
          settings={settings}
        />
      ) : (
        <>
          <AdminPageHeader
            description="Manage card ordering, support destinations, and launch readiness."
            title="Settings"
          />
          <Notice>Loading card ordering settings…</Notice>
        </>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card
          description="This destination is used for generic support states and account help."
          title="Support contact"
        >
          <form className="mt-6 grid max-w-xl gap-4" onSubmit={save}>
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
        </Card>
        <Card
          description="Live mode stores settings in Convex and records sensitive administrator changes in the audit log."
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

function formatPHP(amountCentavos: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountCentavos / 100);
}
