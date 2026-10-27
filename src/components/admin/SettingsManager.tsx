"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useEffect, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import {
  deactivateDemoCardOrderPaymentMethod,
  getDemoCardOrderAdminSettings,
  saveDemoCardOrderPaymentMethod,
  setDemoCardOrderLaunchEndDate,
} from "@/lib/demo/card-ordering";
import { useDemoState, updateDemoState } from "@/lib/demo/store";
import {
  readDemoPaymentMethodQr,
  saveDemoCardOrderPaymentQr,
} from "@/lib/demo/card-order-payment-assets";
import { requirePairedConvexSiteUrl } from "@/lib/convex-site-url";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Field, TextareaField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Tile } from "@/components/ui/Tile";
import { savePaymentMethodWithQr } from "@/components/admin/savePaymentMethodWithQr";

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
  qrAssetKey?: string;
  qrUrl?: string | null;
};

type CardOrderSettings = {
  launchEndDate: string | null;
  paymentMethods: PaymentMethod[];
};

type PaymentMethodInput = Omit<PaymentMethod, "id" | "active" | "qrUrl"> & { id?: string };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function CardOrderSettings({
  settings,
  onSetLaunchEndDate,
  onSavePaymentMethod,
  onDeactivatePaymentMethod,
  onSetPaymentMethodQr,
}: {
  settings: CardOrderSettings;
  onSetLaunchEndDate: (date: string | null) => Promise<void>;
  onSavePaymentMethod: (input: PaymentMethodInput) => Promise<string | void>;
  onDeactivatePaymentMethod: (id: string) => Promise<void>;
  onSetPaymentMethodQr?: (id: string, file: File | null) => Promise<void>;
}) {
  const [launchEndDate, setLaunchEndDate] = useState(settings.launchEndDate ?? "");
  const [launchEndDateEdited, setLaunchEndDateEdited] = useState(false);
  const launchEndDateValue = launchEndDateEdited ? launchEndDate : (settings.launchEndDate ?? "");
  const [paymentEditId, setPaymentEditId] = useState<string | undefined>();
  const [paymentProvider, setPaymentProvider] = useState("");
  const [paymentLabel, setPaymentLabel] = useState("");
  const [paymentAccountDetails, setPaymentAccountDetails] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    return () => {
      if (qrPreviewUrl !== null) URL.revokeObjectURL(qrPreviewUrl);
    };
  }, [qrPreviewUrl]);

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
      async () => {
        await savePaymentMethodWithQr({
          fields: {
            id: paymentEditId,
            provider: paymentProvider,
            label: paymentLabel,
            accountDetails: paymentAccountDetails,
            instructions: paymentInstructions,
          },
          file: qrFile,
          save: onSavePaymentMethod,
          attachQr: onSetPaymentMethodQr,
          onSavedId: setPaymentEditId,
          onQrAttached: () => {
            setQrFile(null);
            setQrPreviewUrl(null);
          },
        });
      },
      paymentEditId ? "Payment method updated." : "Payment method added.",
    );
    if (saved) resetPaymentForm();
  }

  function resetPaymentForm() {
    setPaymentEditId(undefined);
    setPaymentProvider("");
    setPaymentLabel("");
    setPaymentAccountDetails("");
    setPaymentInstructions("");
    setQrFile(null);
    setQrPreviewUrl(null);
  }

  return (
    <>
      <AdminPageHeader
        description="Manage launch pricing, payment methods, and support."
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
          {onSetPaymentMethodQr
            ? (() => {
                const method = settings.paymentMethods.find((item) => item.id === paymentEditId);
                return (
                  <div className="sm:col-span-2 grid gap-3 rounded-control bg-tapit-paper p-4">
                    <label className="text-sm font-medium text-tapit-ink" htmlFor="payment-qr-file">
                      Payment QR image
                    </label>
                    <input
                      accept="image/png,image/jpeg"
                      disabled={busy}
                      id="payment-qr-file"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        event.target.value = "";
                        if (qrPreviewUrl !== null) URL.revokeObjectURL(qrPreviewUrl);
                        setQrFile(file);
                        setQrPreviewUrl(file ? URL.createObjectURL(file) : null);
                      }}
                      type="file"
                    />
                    {method?.qrUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={`Payment QR code for ${paymentLabel || method?.label || "payment method"}`}
                        className="max-h-64 w-auto max-w-full rounded-control object-contain"
                        src={method.qrUrl}
                      />
                    ) : null}
                    {qrPreviewUrl ? (
                      <div>
                        <p className="text-sm text-tapit-muted">Selected image preview</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt="Selected payment QR image preview"
                          className="max-h-64 w-auto max-w-full rounded-control object-contain"
                          src={qrPreviewUrl}
                        />
                      </div>
                    ) : null}
                    {qrFile ? (
                      <Button
                        disabled={busy || !paymentEditId}
                        onClick={() =>
                          void perform(async () => {
                            if (!paymentEditId) return;
                            await onSetPaymentMethodQr(paymentEditId, qrFile);
                            setQrFile(null);
                            setQrPreviewUrl(null);
                          }, "Payment QR image saved.")
                        }
                        type="button"
                      >
                        Upload and replace QR
                      </Button>
                    ) : null}
                    {method?.qrUrl ? (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            if (paymentEditId) await onSetPaymentMethodQr(paymentEditId, null);
                          }, "Payment QR image removed.")
                        }
                        type="button"
                        variant="secondary"
                      >
                        Remove payment QR
                      </Button>
                    ) : null}
                  </div>
                );
              })()
            : null}
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
                      setQrFile(null);
                      setQrPreviewUrl(null);
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

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </>
  );
}

function DemoSettingsManager() {
  const state = useDemoState();
  const cardOrderSettings = getDemoCardOrderAdminSettings();
  const [paymentMethods, setPaymentMethods] = useState(cardOrderSettings.paymentMethods);
  const [supportUrl, setSupportUrl] = useState(state.supportUrl);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    void Promise.all(
      cardOrderSettings.paymentMethods.map(async (method) => {
        if (!method.qrAssetKey) return { ...method, qrUrl: null };
        try {
          const blob = await readDemoPaymentMethodQr(method.id);
          const qrUrl = blob && active ? URL.createObjectURL(blob) : null;
          if (qrUrl) urls.push(qrUrl);
          return { ...method, qrUrl };
        } catch {
          return { ...method, qrUrl: null };
        }
      }),
    ).then((methods) => {
      if (active) setPaymentMethods(methods);
    });
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [cardOrderSettings.paymentMethods]);

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
        onSavePaymentMethod={saveDemoCardOrderPaymentMethod}
        onSetPaymentMethodQr={saveDemoCardOrderPaymentQr}
        onSetLaunchEndDate={setDemoCardOrderLaunchEndDate}
        settings={{ ...cardOrderSettings, paymentMethods }}
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
  const authToken = useAuthToken();
  const configured = useQuery(api.settings.support);
  const cardOrderSettings = useQuery(api.cardOrderSettings.adminSettings);
  const saveSupport = useMutation(api.settings.setSupport);
  const saveLaunchEndDate = useMutation(api.cardOrderSettings.setLaunchEndDate);
  const savePaymentMethod = useMutation(api.cardOrderSettings.savePaymentMethod);
  const deactivatePaymentMethod = useMutation(api.cardOrderSettings.deactivatePaymentMethod);
  const setPaymentMethodQr = useMutation(api.cardOrderPaymentQr.setPaymentMethodQr);
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
  };

  return (
    <div className="flex min-w-0 flex-col gap-8 pt-2">
      {settings ? (
        <CardOrderSettings
          onDeactivatePaymentMethod={async (id) => {
            await deactivatePaymentMethod({ id: id as Id<"cardOrderPaymentMethods"> });
          }}
          onSavePaymentMethod={async ({ id, ...fields }) => {
            return await savePaymentMethod({
              ...(id ? { id: id as Id<"cardOrderPaymentMethods"> } : {}),
              ...fields,
            });
          }}
          onSetLaunchEndDate={async (date) => {
            await saveLaunchEndDate({ date });
          }}
          onSetPaymentMethodQr={async (id, file) => {
            const methodId = id as Id<"cardOrderPaymentMethods">;
            if (file === null) {
              await setPaymentMethodQr({ methodId, uploadId: null });
              return;
            }
            if (authToken === null)
              throw new Error("Authentication is required to upload a QR image.");
            const siteUrl = requirePairedConvexSiteUrl(
              process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
              process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "",
            );
            const response = await fetch(`${siteUrl}/card-order-payment-qr-upload`, {
              method: "POST",
              body: file,
              headers: {
                Authorization: `Bearer ${authToken}`,
                "Content-Type": file.type,
                "X-File-Name": encodeURIComponent(file.name),
              },
            });
            if (!response.ok) throw new Error((await response.text()) || "QR upload failed.");
            const body: unknown = await response.json();
            if (
              typeof body !== "object" ||
              body === null ||
              !("uploadId" in body) ||
              typeof body.uploadId !== "string"
            )
              throw new Error("QR upload response was invalid.");
            await setPaymentMethodQr({
              methodId,
              uploadId: body.uploadId as Id<"cardOrderQrUploads">,
            });
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
