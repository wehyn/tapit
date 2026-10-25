"use client";

import { useAuthToken, useConvexAuth } from "@convex-dev/auth/react";
import { ArrowLeftIcon, ArrowRightIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AuthLoadingState } from "@/components/auth/AuthLoadingState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Chip";
import { Field, SelectField, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { getCardPriceCentavos, manilaStartOfDayTimestamp } from "@/lib/card-ordering";
import { CARD_DESIGN_ACCEPT, validateCardOrderDesignFile } from "@/lib/card-design";
import { requirePairedConvexSiteUrl } from "@/lib/convex-site-url";
import {
  getDemoCardOrderCustomerSettings,
  getMyDemoCardOrders,
  placeDemoCardOrder,
  previewDemoCardOrderReferral,
} from "@/lib/demo/card-ordering";
import { replaceDemoCardOrderAsset, saveDemoCardOrderAsset } from "@/lib/demo/card-order-assets";
import type { DemoCardOrderDesignSource } from "@/lib/demo/fixtures";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { resolveDemoSessionAccess, useDemoSession, useDemoState } from "@/lib/demo/store";

const BUILD_CARD_PATH = "/build-card";

type PaymentMethod = {
  id: string;
  provider: string;
  label: string;
  accountDetails: string;
  instructions: string;
};

type OrderSettings = {
  launchEndDate: string | null;
  paymentMethods: PaymentMethod[];
};

type CustomerOrder = {
  id: string;
  createdAt: number;
  cardPriceCentavos: number;
  discountCentavos: number;
  shippingQuoteCentavos?: number;
  paymentSnapshot: {
    provider: string;
    label: string;
    accountDetails: string;
    instructions: string;
  };
  paymentStatus: "unpaid" | "received" | "refunded";
  fulfillmentStatus:
    "awaiting_shipping_quote" | "awaiting_payment" | "processing" | "delivered" | "cancelled";
};

type OrderDesign = { kind: "upload"; file: File } | { kind: "url"; url: string };
type DesignSide = "front" | "back";
type SideArtwork = {
  kind: "upload" | "url";
  file: File | null;
  url: string;
  previewUrl: string | null;
  error: string;
  validating: boolean;
};

type PlaceOrderInput = {
  paymentMethodId: string;
  referralCode?: string;
  design: OrderDesign;
  backDesign: OrderDesign;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
};

type PlaceOrder = (input: PlaceOrderInput) => Promise<string>;

export function OrderCardExperience() {
  return isLocalDemoMode() ? <LocalDemoOrderExperience /> : <LiveOrderExperience />;
}

function LocalDemoOrderExperience() {
  const state = useDemoState();
  const session = useDemoSession();
  const access = resolveDemoSessionAccess(state, session);

  if (access.kind !== "active") return <AuthLoadingState />;
  if (access.account.role !== "customer") {
    return <AccessMessage>Card ordering is available to customer accounts.</AccessMessage>;
  }

  let settings: OrderSettings;
  let orders: CustomerOrder[];
  try {
    settings = getDemoCardOrderCustomerSettings();
    orders = getMyDemoCardOrders();
  } catch (error) {
    return (
      <AccessMessage>
        {error instanceof Error ? error.message : "Card ordering could not be loaded."}
      </AccessMessage>
    );
  }

  return (
    <CustomerOrderForm
      mode="demo"
      onPlaceOrder={async (input) => {
        const savedAssets: Extract<DemoCardOrderDesignSource, { kind: "upload" }>[] = [];
        try {
          const saveSource = async (design: OrderDesign) => {
            if (design.kind === "url") return { kind: "url" as const, url: design.url };
            const asset = await saveDemoCardOrderAsset(design.file);
            savedAssets.push(asset);
            return asset;
          };
          const designSource = await saveSource(input.design);
          const backDesignSource = await saveSource(input.backDesign);
          return await placeDemoCardOrder({
            paymentMethodId: input.paymentMethodId,
            ...(input.referralCode ? { referralCode: input.referralCode } : {}),
            designSource,
            backDesignSource,
            deliveryName: input.deliveryName,
            deliveryPhone: input.deliveryPhone,
            deliveryAddress: input.deliveryAddress,
          });
        } catch (error) {
          await Promise.all(
            savedAssets.map((asset) =>
              replaceDemoCardOrderAsset(asset.assetKey, null).catch(() => undefined),
            ),
          );
          throw error;
        }
      }}
      orders={orders}
      settings={settings}
    />
  );
}

function LiveOrderExperience() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  const isCustomer =
    access?.authenticated === true &&
    access.accountStatus === "active" &&
    access.role === "customer";
  const settings = useQuery(api.cardOrderSettings.customerSettings, isCustomer ? {} : "skip");
  const liveOrders = useQuery(api.cardOrders.myOrders, isCustomer ? {} : "skip");
  const placeOrder = useMutation(api.cardOrders.placeOrder);
  const authToken = useAuthToken();

  if (isLoading || (isAuthenticated && access === undefined)) return <AuthLoadingState />;
  if (!isAuthenticated) return <AuthLoadingState />;
  if (!isCustomer)
    return <AccessMessage>Card ordering is available to customer accounts.</AccessMessage>;

  const normalizedSettings: OrderSettings | undefined = settings && {
    launchEndDate: settings.launchEndDate,
    paymentMethods: settings.paymentMethods.map(({ _id, ...method }) => ({
      id: _id,
      ...method,
    })),
  };
  const orders: CustomerOrder[] | undefined = liveOrders?.map(({ _id, ...order }) => ({
    id: _id,
    ...order,
  }));

  return (
    <CustomerOrderForm
      mode="live"
      onPlaceOrder={async (input) => {
        const uploadDesign = async (design: OrderDesign) => {
          if (design.kind === "url") return { kind: "url" as const, url: design.url };
          if (authToken === null) throw new Error("Authentication is required to upload artwork.");
          const siteUrl = requirePairedConvexSiteUrl(
            process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
            process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "",
          );
          const file = design.file;
          const response = await fetch(`${siteUrl}/card-order-design-upload`, {
            method: "POST",
            body: file,
            headers: {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": file.type,
              "X-File-Name": encodeURIComponent(file.name),
            },
          });
          if (!response.ok)
            throw new Error(
              (await response.text()) || "The design upload failed. Choose another file.",
            );
          const uploaded = parseUploadResponse(await response.json());
          return {
            kind: "upload" as const,
            uploadId: uploaded.uploadId as Id<"cardOrderDesignUploads">,
          };
        };
        const designSource = await uploadDesign(input.design);
        const backDesignSource = await uploadDesign(input.backDesign);
        return await placeOrder({
          paymentMethodId: input.paymentMethodId as Id<"cardOrderPaymentMethods">,
          ...(input.referralCode ? { referralCode: input.referralCode } : {}),
          designSource,
          backDesignSource,
          deliveryName: input.deliveryName,
          deliveryPhone: input.deliveryPhone,
          deliveryAddress: input.deliveryAddress,
        });
      }}
      orders={orders}
      settings={normalizedSettings}
    />
  );
}

function parseUploadResponse(value: unknown): { uploadId: string } {
  if (
    typeof value !== "object" ||
    value === null ||
    !("uploadId" in value) ||
    typeof value.uploadId !== "string" ||
    value.uploadId.length === 0
  ) {
    throw new Error("The design upload response was invalid. Try again.");
  }
  return { uploadId: value.uploadId };
}

function AccessMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[70dvh] bg-tapit-paper px-4 py-8 text-tapit-ink sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Notice tone="error">{children}</Notice>
      </div>
    </div>
  );
}

function CustomerOrderForm({
  mode,
  settings,
  orders,
  onPlaceOrder,
}: {
  mode: "demo" | "live";
  settings: OrderSettings | undefined;
  orders: CustomerOrder[] | undefined;
  onPlaceOrder: PlaceOrder;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [activeSide, setActiveSide] = useState<DesignSide>("front");
  const [artwork, setArtwork] = useState<Record<DesignSide, SideArtwork>>({
    front: { kind: "upload", file: null, url: "", previewUrl: null, error: "", validating: false },
    back: { kind: "upload", file: null, url: "", previewUrl: null, error: "", validating: false },
  });
  const [deliveryName, setDeliveryName] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [submittedOrderId, setSubmittedOrderId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Record<DesignSide, HTMLInputElement | null>>({
    front: null,
    back: null,
  });
  const previewUrlsRef = useRef<Record<DesignSide, string | null>>({ front: null, back: null });
  const validationIdsRef = useRef<Record<DesignSide, number>>({ front: 0, back: 0 });

  useEffect(() => {
    const updateTime = () => setNow(Date.now());
    const interval = window.setInterval(updateTime, 30_000);
    return () => {
      window.clearInterval(interval);
      validationIdsRef.current.front += 1;
      validationIdsRef.current.back += 1;
      for (const side of ["front", "back"] as const) {
        if (previewUrlsRef.current[side] !== null)
          URL.revokeObjectURL(previewUrlsRef.current[side]!);
      }
    };
  }, []);

  const paymentMethods = settings?.paymentMethods ?? [];
  const selectedPaymentMethodId = paymentMethods.some((method) => method.id === paymentMethodId)
    ? paymentMethodId
    : (paymentMethods[0]?.id ?? "");
  const selectedPaymentMethod = paymentMethods.find(
    (method) => method.id === selectedPaymentMethodId,
  );
  const currentCardPrice = settings ? getCardPriceCentavos(settings.launchEndDate, now) : null;
  const launchCutoff =
    settings?.launchEndDate === null || settings?.launchEndDate === undefined
      ? null
      : manilaStartOfDayTimestamp(settings.launchEndDate);
  const isConfigured = settings?.launchEndDate !== null && paymentMethods.length > 0;

  function clearSidePreview(side: DesignSide) {
    if (previewUrlsRef.current[side] !== null) URL.revokeObjectURL(previewUrlsRef.current[side]!);
    previewUrlsRef.current[side] = null;
    setArtwork((current) => ({ ...current, [side]: { ...current[side], previewUrl: null } }));
  }

  function changeDesignKind(side: DesignSide, kind: "upload" | "url") {
    validationIdsRef.current[side] += 1;
    clearSidePreview(side);
    setArtwork((current) => ({
      ...current,
      [side]: { kind, file: null, url: "", previewUrl: null, error: "", validating: false },
    }));
    setSubmitError("");
    setFieldErrors((current) => ({ ...current, [side]: "" }));
    if (inputRefs.current[side] !== null) inputRefs.current[side]!.value = "";
  }

  async function handleFileChange(side: DesignSide, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    const requestId = ++validationIdsRef.current[side];
    clearSidePreview(side);
    setArtwork((current) => ({
      ...current,
      [side]: { ...current[side], file: null, error: "", validating: true },
    }));
    setSubmitError("");
    setFieldErrors((current) => ({ ...current, [side]: "" }));
    try {
      await validateCardOrderDesignFile(file);
      if (requestId === validationIdsRef.current[side]) {
        const previewUrl = URL.createObjectURL(file);
        previewUrlsRef.current[side] = previewUrl;
        setArtwork((current) => ({
          ...current,
          [side]: { ...current[side], file, previewUrl, error: "", validating: false },
        }));
      }
    } catch (error) {
      if (requestId === validationIdsRef.current[side]) {
        setArtwork((current) => ({
          ...current,
          [side]: {
            ...current[side],
            error: error instanceof Error ? error.message : "Choose a supported PNG or JPG.",
            validating: false,
          },
        }));
        event.target.value = "";
      }
    } finally {
      if (requestId === validationIdsRef.current[side])
        setArtwork((current) => ({ ...current, [side]: { ...current[side], validating: false } }));
    }
  }

  function removeFile(side: DesignSide) {
    validationIdsRef.current[side] += 1;
    clearSidePreview(side);
    setArtwork((current) => ({
      ...current,
      [side]: { ...current[side], file: null, error: "", validating: false },
    }));
    if (inputRefs.current[side] !== null) inputRefs.current[side]!.value = "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || artwork.front.validating || artwork.back.validating) return;
    const nextErrors: Record<string, string> = {};
    const name = deliveryName.trim();
    const phone = deliveryPhone.trim();
    const address = deliveryAddress.trim();
    if (name.length < 1 || name.length > 120) nextErrors.deliveryName = "Enter 1–120 characters.";
    if (phone.length < 1 || phone.length > 40) nextErrors.deliveryPhone = "Enter 1–40 characters.";
    if (address.length < 1 || address.length > 1000)
      nextErrors.deliveryAddress = "Enter 1–1,000 characters.";
    if (!selectedPaymentMethodId) nextErrors.paymentMethod = "Choose an available payment method.";

    const resolveArtwork = (side: DesignSide): OrderDesign | null => {
      const source = artwork[side];
      if (source.kind === "upload") {
        if (!source.file) {
          nextErrors[side] = `Add ${side} artwork as an upload or HTTPS URL.`;
          return null;
        }
        return { kind: "upload", file: source.file };
      }
      const validation = validateDesignUrl(source.url);
      if ("error" in validation) {
        nextErrors[side] = validation.error;
        return null;
      }
      return { kind: "url", url: validation.url };
    };
    const design = resolveArtwork("front");
    const backDesign = resolveArtwork("back");
    setFieldErrors(nextErrors);
    setSubmitError("");
    if (nextErrors.front) setActiveSide("front");
    else if (nextErrors.back) setActiveSide("back");
    if (Object.keys(nextErrors).length > 0 || design === null || backDesign === null) return;
    if (!isConfigured) {
      setSubmitError("Card ordering is not configured yet. Please try again later.");
      return;
    }

    setSubmitting(true);
    setSubmittedOrderId("");
    try {
      const orderId = await onPlaceOrder({
        paymentMethodId: selectedPaymentMethodId,
        ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}),
        design,
        backDesign,
        deliveryName: name,
        deliveryPhone: phone,
        deliveryAddress: address,
      });
      setSubmittedOrderId(orderId);
      for (const side of ["front", "back"] as const) removeFile(side);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Your order could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  if (settings === undefined) {
    return (
      <div className="min-h-[70dvh] bg-tapit-paper px-4 py-8 text-tapit-ink sm:px-8 sm:py-12">
        <div className="mx-auto max-w-4xl">
          <Notice>Loading card order settings…</Notice>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70dvh] bg-tapit-paper px-4 py-7 text-tapit-ink sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-[1260px]">
        <Link
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-tapit-muted transition-colors hover:text-tapit-accent"
          href={BUILD_CARD_PATH}
        >
          <ArrowLeftIcon aria-hidden="true" size={17} />
          Back to card design
        </Link>

        <header className="mt-5 max-w-3xl">
          <h1 className="tapit-display text-4xl font-medium tracking-[-0.055em] sm:text-5xl">
            Order your card
          </h1>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <form className="grid min-w-0 gap-5 lg:col-start-1" onSubmit={handleSubmit}>
            <Card className="gap-0" title="01 · Card design">
              <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Card side">
                {(["front", "back"] as const).map((side) => (
                  <button
                    aria-pressed={activeSide === side}
                    className={`min-h-11 rounded-xl border px-4 text-sm font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus ${activeSide === side ? "border-tapit-accent bg-tapit-accent-soft text-tapit-ink" : "border-tapit-line text-tapit-muted"}`}
                    key={side}
                    onClick={() => setActiveSide(side)}
                    type="button"
                  >
                    {side}
                    {fieldErrors[side] ? (
                      <span className="ml-2 text-xs font-medium text-tapit-danger">Needs attention</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <figure className="mt-4 w-full max-w-lg">
                <div className="overflow-hidden rounded-card border border-tapit-line bg-tapit-surface shadow-card">
                  {artwork[activeSide].previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={`${activeSide} artwork CR80 preview`}
                      className="block aspect-[1.586] w-full object-cover"
                      src={artwork[activeSide].previewUrl!}
                    />
                  ) : (
                    <div className="flex aspect-[1.586] items-center justify-center bg-tapit-paper text-sm text-tapit-muted">
                      {activeSide === "front" ? "Front" : "Back"} preview
                    </div>
                  )}
                </div>
                <figcaption className="mt-2 text-xs font-medium text-tapit-muted">
                  CR80 card · {activeSide} side
                </figcaption>
              </figure>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <DesignChoice
                  checked={artwork[activeSide].kind === "upload"}
                  description="Select a PNG or JPG from this device."
                  label="Upload an image"
                  onChange={() => changeDesignKind(activeSide, "upload")}
                />
                <DesignChoice
                  checked={artwork[activeSide].kind === "url"}
                  description="Provide an HTTPS link to your image."
                  label="Use a design link"
                  onChange={() => changeDesignKind(activeSide, "url")}
                />
              </div>
              {artwork[activeSide].kind === "upload" ? (
                <div className="mt-4 rounded-[18px] border border-dashed border-tapit-line bg-tapit-paper/65 p-4 sm:p-5">
                  <input
                    accept={CARD_DESIGN_ACCEPT}
                    aria-label={`Upload ${activeSide} artwork`}
                    aria-describedby={`${activeSide}-file-guidance`}
                    aria-invalid={Boolean(artwork[activeSide].error || fieldErrors[activeSide])}
                    className="sr-only"
                    id={`order-card-${activeSide}-file`}
                    key={activeSide}
                    onChange={(event) => void handleFileChange(activeSide, event)}
                    ref={(element) => {
                      inputRefs.current[activeSide] = element;
                    }}
                    tabIndex={-1}
                    type="file"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-tapit-ink">
                        {artwork[activeSide].file?.name ?? `Select ${activeSide} artwork`}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-tapit-muted">
                        {artwork[activeSide].file
                          ? `${formatFileSize(artwork[activeSide].file!.size)} · ${artwork[activeSide].file!.type === "image/png" ? "PNG" : "JPG"}`
                          : "PNG or JPG, under 5 MiB"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        disabled={artwork[activeSide].validating || submitting}
                        onClick={() => inputRefs.current[activeSide]?.click()}
                        type="button"
                        variant="secondary"
                      >
                        <UploadSimpleIcon aria-hidden="true" className="mr-2" size={17} />
                        {artwork[activeSide].file ? "Replace" : "Choose file"}
                      </Button>
                      {artwork[activeSide].file ? (
                        <Button
                          disabled={submitting}
                          onClick={() => removeFile(activeSide)}
                          type="button"
                          variant="quiet"
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p
                    className="mt-4 text-xs leading-5 text-tapit-muted"
                    id={`${activeSide}-file-guidance`}
                  >
                    The image must be no larger than 12,000 pixels per side or 6 million pixels in
                    total.
                  </p>
                  {artwork[activeSide].validating ? (
                    <p className="mt-3 text-sm text-tapit-muted" role="status">
                      Checking file size and image dimensions…
                    </p>
                  ) : null}
                  {artwork[activeSide].error || fieldErrors[activeSide] ? (
                    <p className="mt-3 text-sm text-tapit-danger" role="alert">
                      {artwork[activeSide].error || fieldErrors[activeSide]}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4">
                  <Field
                    autoComplete="url"
                    error={artwork[activeSide].error || fieldErrors[activeSide]}
                    help="Use an HTTPS URL without username or password. The image is not fetched during order submission."
                    id={`order-card-${activeSide}-url`}
                    label={`${activeSide === "front" ? "Front" : "Back"} design URL`}
                    maxLength={2048}
                    onChange={(event) => {
                      const url = event.target.value;
                      setArtwork((current) => ({
                        ...current,
                        [activeSide]: { ...current[activeSide], url },
                      }));
                      setFieldErrors((current) => ({ ...current, [activeSide]: "" }));
                    }}
                    placeholder="https://example.com/my-card.png"
                    type="url"
                    value={artwork[activeSide].url}
                  />
                </div>
              )}
            </Card>

            <Card className="gap-0" title="02 · Delivery details">
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <Field
                  autoComplete="name"
                  error={fieldErrors.deliveryName}
                  id="delivery-name"
                  label="Delivery name"
                  maxLength={120}
                  minLength={1}
                  onChange={(event) => {
                    setDeliveryName(event.target.value);
                    setFieldErrors((current) => ({ ...current, deliveryName: "" }));
                  }}
                  required
                  value={deliveryName}
                />
                <Field
                  autoComplete="tel"
                  error={fieldErrors.deliveryPhone}
                  id="delivery-phone"
                  label="Phone number"
                  maxLength={40}
                  minLength={1}
                  onChange={(event) => {
                    setDeliveryPhone(event.target.value);
                    setFieldErrors((current) => ({ ...current, deliveryPhone: "" }));
                  }}
                  required
                  type="tel"
                  value={deliveryPhone}
                />
                <div className="sm:col-span-2">
                  <TextareaField
                    autoComplete="street-address"
                    error={fieldErrors.deliveryAddress}
                    id="delivery-address"
                    label="Delivery address"
                    maxLength={1000}
                    minLength={1}
                    onChange={(event) => {
                      setDeliveryAddress(event.target.value);
                      setFieldErrors((current) => ({ ...current, deliveryAddress: "" }));
                    }}
                    required
                    value={deliveryAddress}
                  />
                </div>
              </div>
            </Card>

            <Card className="gap-0" title="03 · Payment">
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <SelectField
                  disabled={paymentMethods.length === 0}
                  id="payment-method"
                  label="Payment method"
                  onChange={(event) => {
                    setPaymentMethodId(event.target.value);
                    setFieldErrors((current) => ({ ...current, paymentMethod: "" }));
                  }}
                  required
                  value={selectedPaymentMethodId}
                >
                  <option value="" disabled>
                    Select a payment method
                  </option>
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.label} · {method.provider}
                    </option>
                  ))}
                </SelectField>
                {selectedPaymentMethod ? (
                  <div className="sm:col-span-2 rounded-[14px] bg-tapit-paper p-4">
                    <p className="text-xs font-semibold tracking-[0.12em] text-tapit-muted uppercase">
                      {selectedPaymentMethod.label} · {selectedPaymentMethod.provider}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-tapit-ink">
                      {selectedPaymentMethod.accountDetails}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-tapit-muted">
                      {selectedPaymentMethod.instructions}
                    </p>
                  </div>
                ) : null}
                {fieldErrors.paymentMethod ? (
                  <p className="self-end pb-3 text-sm text-tapit-danger" role="alert">
                    {fieldErrors.paymentMethod}
                  </p>
                ) : null}
                <div className="sm:col-span-2">
                  <Field
                    autoCapitalize="characters"
                    id="referral-code"
                    label="Referral code"
                    maxLength={40}
                    onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                    value={referralCode}
                  />
                </div>
              </div>
              {!isConfigured ? (
                <p className="mt-4 text-sm leading-6 text-tapit-muted" role="status">
                  {settings.launchEndDate === null && paymentMethods.length === 0
                    ? "Ordering is unavailable until launch pricing and a payment method are set."
                    : settings.launchEndDate === null
                      ? "Ordering is unavailable until launch pricing is set."
                      : "Ordering is unavailable until a payment method is available."}
                </p>
              ) : null}
            </Card>

            {submitError ? <Notice tone="error">{submitError}</Notice> : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Link
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] px-4 py-2.5 text-sm font-semibold text-tapit-muted transition-colors hover:bg-tapit-soft-surface hover:text-tapit-ink"
                href={BUILD_CARD_PATH}
              >
                Cancel
              </Link>
              <Button
                className="sm:min-w-48"
                disabled={!isConfigured || artwork.front.validating || artwork.back.validating}
                loading={submitting}
                type="submit"
              >
                Place order
                <ArrowRightIcon aria-hidden="true" className="ml-2" size={17} />
              </Button>
            </div>
          </form>

          <aside className="order-first grid gap-5 lg:sticky lg:top-8 lg:order-none lg:col-start-2 lg:row-start-1">
            <Card className="gap-0 overflow-hidden border-tapit-accent/25 bg-tapit-surface p-0">
              <div className="rounded-t-card border-b border-tapit-accent-strong bg-tapit-accent px-5 py-4 text-tapit-accent-foreground sm:px-6">
                <p className="text-[11px] font-semibold tracking-[0.18em] text-tapit-accent-foreground uppercase">
                  Price preview
                </p>
                <h2 className="tapit-display mt-1.5 text-2xl font-medium tracking-tight">
                  {currentCardPrice === null ? "—" : formatPHP(currentCardPrice)}
                </h2>
              </div>
              <div className="grid gap-3 p-5 sm:p-6">
                <dl className="grid gap-3">
                  <PriceLine
                    label="Card"
                    value={currentCardPrice === null ? "—" : formatPHP(currentCardPrice)}
                  />
                  <ReferralPriceSummary
                    code={referralCode}
                    currentTime={now}
                    currentPrice={currentCardPrice ?? 0}
                    mode={mode}
                  />
                  <PriceLine label="Shipping" value="Pending quote" />
                </dl>
                <div className="my-1 border-t border-dashed border-tapit-line" />
                {launchCutoff !== null ? (
                  <p className="mt-1 border-t border-tapit-line pt-3 text-xs leading-5 text-tapit-muted">
                    ₱599 launch price applies before {formatManilaCutoff(launchCutoff)} Manila time.
                    The card price is ₱799 on or after that cutoff.
                  </p>
                ) : null}
              </div>
            </Card>

            {submittedOrderId ? (
              <SubmittedOrder
                order={orders?.find((order) => order.id === submittedOrderId)}
                loading={orders === undefined}
              />
            ) : null}
            {orders && orders.length > 0 ? (
              <section aria-label="Your recent card orders" className="grid gap-3">
                <h2 className="px-1 text-xs font-semibold tracking-[0.16em] text-tapit-muted uppercase">
                  Your recent orders
                </h2>
                {orders.map((order) => (
                  <OrderSummaryCard key={order.id} order={order} />
                ))}
              </section>
            ) : null}
          </aside>
        </div>
        <footer className="mt-10 flex items-center justify-between gap-4 border-t border-tapit-line pt-5 text-xs text-tapit-muted">
          <span>Front and back artwork use the CR80 card ratio.</span>
          <Link
            className="inline-flex min-h-10 items-center gap-1 font-semibold hover:text-tapit-accent"
            href={BUILD_CARD_PATH}
          >
            Back to design <ArrowLeftIcon aria-hidden="true" size={14} />
          </Link>
        </footer>
      </div>
    </div>
  );
}

function DesignChoice({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex min-h-[86px] cursor-pointer items-start gap-3 rounded-[16px] border p-4 transition-colors focus-within:ring-2 focus-within:ring-tapit-focus focus-within:ring-offset-2 focus-within:ring-offset-tapit-surface ${checked ? "border-tapit-accent bg-tapit-accent-soft/35" : "border-tapit-line bg-tapit-surface hover:border-tapit-accent/50"}`}
    >
      <input
        checked={checked}
        className="mt-1 size-4 accent-[var(--color-tapit-accent)]"
        name="design-kind"
        onChange={onChange}
        type="radio"
      />
      <span>
        <span className="block text-sm font-semibold text-tapit-ink">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-tapit-muted">{description}</span>
      </span>
    </label>
  );
}

function ReferralPriceSummary({
  mode,
  code,
  currentTime,
  currentPrice,
}: {
  mode: "demo" | "live";
  code: string;
  currentTime: number;
  currentPrice: number;
}) {
  if (!code.trim()) return <ReferralPriceLines currentPrice={currentPrice} />;
  return mode === "demo" ? (
    <DemoReferralPriceLines code={code} currentTime={currentTime} currentPrice={currentPrice} />
  ) : (
    <LiveReferralPriceLines code={code} currentTime={currentTime} currentPrice={currentPrice} />
  );
}

function DemoReferralPriceLines({
  code,
  currentTime,
  currentPrice,
}: {
  code: string;
  currentTime: number;
  currentPrice: number;
}) {
  let valid = false;
  let discountCentavos = 0;
  let error: string | undefined;
  try {
    const preview = previewDemoCardOrderReferral(code, currentTime);
    valid = preview.valid;
    discountCentavos = preview.discountCentavos;
  } catch {
    error = "Referral status could not be checked.";
  }
  return (
    <ReferralPriceLines
      currentPrice={currentPrice}
      discountCentavos={discountCentavos}
      error={error}
      hasCode
      valid={valid}
    />
  );
}

function LiveReferralPriceLines({
  code,
  currentTime,
  currentPrice,
}: {
  code: string;
  currentTime: number;
  currentPrice: number;
}) {
  const preview = useQuery(api.cardOrderSettings.previewReferral, {
    code: code.trim(),
    currentTime,
  });
  if (preview === undefined) {
    return <ReferralPriceLines currentPrice={currentPrice} checking hasCode />;
  }
  return (
    <ReferralPriceLines
      currentPrice={currentPrice}
      discountCentavos={preview.discountCentavos}
      hasCode
      valid={preview.valid}
    />
  );
}

function ReferralPriceLines({
  valid,
  discountCentavos,
  currentPrice,
  checking = false,
  error,
  hasCode = false,
}: {
  valid?: boolean;
  discountCentavos?: number;
  currentPrice: number;
  checking?: boolean;
  error?: string;
  hasCode?: boolean;
}) {
  const appliedDiscount = valid ? (discountCentavos ?? 0) : 0;
  return valid ? (
    <>
      <PriceLine label="Referral discount" value={`−${formatPHP(appliedDiscount)}`} />
      <PriceLine
        label="Estimated amount"
        value={`${formatPHP(currentPrice - appliedDiscount)} + shipping`}
        strong
      />
    </>
  ) : (
    <>
      <PriceLine
        label="Referral discount"
        value={checking ? "Checking…" : error ? "Unavailable" : hasCode ? "Not available" : "—"}
      />
      <PriceLine label="Estimated amount" value={`${formatPHP(currentPrice)} + shipping`} strong />
      {error ? (
        <div>
          <dt className="sr-only">Referral status</dt>
          <dd className="text-xs text-tapit-danger">{error}</dd>
        </div>
      ) : null}
    </>
  );
}

function SubmittedOrder({
  order,
  loading,
}: {
  order: CustomerOrder | undefined;
  loading: boolean;
}) {
  return (
    <div className="grid gap-3">
      <Notice tone="success">
        Your card order has been saved. Please wait for the shipping quote before paying.
      </Notice>
      {order ? (
        <OrderSummaryCard order={order} prominent />
      ) : (
        <Notice>
          {loading ? "Loading your saved total and order status…" : "Your order is saved."}
        </Notice>
      )}
    </div>
  );
}

function OrderSummaryCard({
  order,
  prominent = false,
}: {
  order: CustomerOrder;
  prominent?: boolean;
}) {
  const cardTotal = order.cardPriceCentavos - order.discountCentavos;
  const totalDue =
    order.shippingQuoteCentavos === undefined ? null : cardTotal + order.shippingQuoteCentavos;
  const amountLabel =
    order.paymentStatus === "unpaid" && order.fulfillmentStatus === "awaiting_payment"
      ? "Amount due"
      : "Order total";
  return (
    <Card className={`gap-0 ${prominent ? "border-tapit-success/40" : "p-4 sm:p-5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-tapit-muted">
            Order · {formatManilaDate(order.createdAt)}
          </p>
          <h3 className="mt-1 text-base font-semibold text-tapit-ink">Order summary</h3>
        </div>
        <StatusChip status={formatStatus(order.fulfillmentStatus)} />
      </div>
      <div className="mt-4 grid gap-0 text-sm">
        <dl className="grid gap-2.5">
          <PriceLine label="Card price" value={formatPHP(order.cardPriceCentavos)} />
          {order.discountCentavos > 0 ? (
            <PriceLine label="Referral discount" value={`−${formatPHP(order.discountCentavos)}`} />
          ) : null}
          <PriceLine
            label="Shipping"
            value={
              order.shippingQuoteCentavos === undefined
                ? "Quote pending"
                : formatPHP(order.shippingQuoteCentavos)
            }
          />
        </dl>
        <div className="my-1 border-t border-dashed border-tapit-line" />
        <dl className="grid gap-2.5">
          <PriceLine
            label={amountLabel}
            value={totalDue === null ? `${formatPHP(cardTotal)} + shipping` : formatPHP(totalDue)}
            strong
          />
        </dl>
      </div>
      <div className="mt-4 rounded-[14px] bg-tapit-paper p-4">
        <p className="text-xs font-semibold tracking-[0.12em] text-tapit-muted uppercase">
          {order.paymentSnapshot.label} · {formatStatus(order.paymentStatus)}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-tapit-ink">
          {order.paymentSnapshot.accountDetails}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-tapit-muted">
          {order.paymentSnapshot.instructions}
        </p>
      </div>
    </Card>
  );
}

function PriceLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "text-sm font-semibold text-tapit-ink" : "text-sm text-tapit-muted"}>
        {label}
      </dt>
      <dd
        className={
          strong
            ? "text-right text-sm font-semibold text-tapit-ink"
            : "text-right text-sm text-tapit-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function validateDesignUrl(value: string): { url: string } | { error: string } {
  const url = value.trim();
  if (url.length < 1 || url.length > 2048)
    return { error: "Enter a design URL up to 2,048 characters." };
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      return { error: "Design URL must use HTTPS and contain no username or password." };
    }
  } catch {
    return { error: "Enter a valid HTTPS design URL." };
  }
  return { url };
}

function formatPHP(amountCentavos: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCentavos / 100);
}

function formatFileSize(size: number): string {
  return size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KB`
    : `${(size / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatStatus(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatManilaDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(timestamp);
}

function formatManilaCutoff(timestamp: number): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(timestamp);
}
