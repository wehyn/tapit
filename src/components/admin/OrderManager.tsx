"use client";

import { useEffect, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";

import {
  cancelDemoCardOrder,
  getAdminDemoCardOrders,
  markDemoCardOrderCommissionEligible,
  markDemoCardOrderDelivered,
  markDemoCardOrderPaymentReceived,
  quoteDemoCardOrderShipping,
  recordDemoCardOrderCommissionPayout,
  refundDemoCardOrder,
} from "@/lib/demo/card-ordering";
import { readDemoCardOrderAsset } from "@/lib/demo/card-order-assets";
import { isLocalDemoMode } from "@/lib/demo/mode";
import type { DemoCardOrder } from "@/lib/demo/fixtures";
import { useDemoState } from "@/lib/demo/store";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";

type OrderDesign =
  { kind: "url"; url: string } | { kind: "upload"; sourceId: string; fileName?: string };

type AdminOrder = {
  id: string;
  createdAt: number;
  customerId: string;
  quantity: 1;
  design: OrderDesign;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  cardPriceCentavos: number;
  discountCentavos: number;
  shippingQuoteCentavos?: number;
  paymentSnapshot: {
    provider: string;
    label: string;
    accountDetails: string;
    instructions: string;
  };
  referralSnapshot?: { code: string; referrerLabel: string };
  paymentStatus: Doc<"cardOrders">["paymentStatus"];
  fulfillmentStatus: Doc<"cardOrders">["fulfillmentStatus"];
  commissionStatus: Doc<"cardOrders">["commissionStatus"];
  commissionCentavos: number;
  payoutReference?: string;
};

type OrderAction =
  | { kind: "quoteShipping"; shippingQuoteCentavos: number }
  | { kind: "markPaid" }
  | { kind: "markDelivered" }
  | { kind: "cancel" }
  | { kind: "refund" }
  | { kind: "commissionEligible" }
  | { kind: "recordPayout"; payoutReference: string };

type Confirmation = { orderId: string; action: "cancel" | "refund" } | null;

function demoOrder(order: DemoCardOrder): AdminOrder {
  return {
    id: order.id,
    createdAt: order.createdAt,
    customerId: order.customerId,
    quantity: order.quantity,
    design:
      order.designSource.kind === "url"
        ? order.designSource
        : {
            kind: "upload",
            sourceId: order.designSource.assetKey,
            fileName: order.designSource.fileName,
          },
    deliveryName: order.deliveryName,
    deliveryPhone: order.deliveryPhone,
    deliveryAddress: order.deliveryAddress,
    cardPriceCentavos: order.cardPriceCentavos,
    discountCentavos: order.discountCentavos,
    shippingQuoteCentavos: order.shippingQuoteCentavos,
    paymentSnapshot: order.paymentSnapshot,
    referralSnapshot: order.referralSnapshot,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    commissionStatus: order.commissionStatus,
    commissionCentavos: order.commissionCentavos,
    payoutReference: order.payoutReference,
  };
}

function liveOrder(order: Doc<"cardOrders">): AdminOrder {
  return {
    id: order._id,
    createdAt: order.createdAt,
    customerId: order.customerId,
    quantity: order.quantity,
    design:
      order.designSource.kind === "url"
        ? order.designSource
        : { kind: "upload", sourceId: order.designSource.uploadId },
    deliveryName: order.deliveryName,
    deliveryPhone: order.deliveryPhone,
    deliveryAddress: order.deliveryAddress,
    cardPriceCentavos: order.cardPriceCentavos,
    discountCentavos: order.discountCentavos,
    shippingQuoteCentavos: order.shippingQuoteCentavos,
    paymentSnapshot: order.paymentSnapshot,
    referralSnapshot: order.referralSnapshot,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    commissionStatus: order.commissionStatus,
    commissionCentavos: order.commissionCentavos,
    payoutReference: order.payoutReference,
  };
}

function parsePesosToCentavos(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error("Enter pesos with up to two decimal places, such as 125 or 125.50.");
  const wholePesos = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const centavos = wholePesos * 100 + cents;
  if (!Number.isSafeInteger(wholePesos) || !Number.isSafeInteger(centavos)) {
    throw new Error("Shipping quote is too large.");
  }
  return centavos;
}

function formatMoney(centavos: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    centavos / 100,
  );
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

function safeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function OrderDesign({
  demo,
  orderId,
  design,
}: {
  demo: boolean;
  orderId: string;
  design: OrderDesign;
}) {
  if (design.kind === "url") {
    const url = safeHttpsUrl(design.url);
    return url ? (
      <a
        className="font-semibold text-tapit-accent underline"
        href={url}
        rel="noreferrer"
        target="_blank"
      >
        Open HTTPS design URL
      </a>
    ) : (
      <p className="text-sm text-tapit-danger">Design URL is unavailable.</p>
    );
  }

  return demo ? (
    <DemoOrderArtwork design={design} />
  ) : (
    <LiveOrderArtwork orderId={orderId} fileName={design.fileName} />
  );
}

function UploadedArtwork({ url, fileName }: { url: string; fileName?: string }) {
  return (
    <a className="inline-block max-w-full" href={url} rel="noreferrer" target="_blank">
      {/* Preview is sourced from a private object URL or the admin-only Convex design query. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={fileName ? `Uploaded design: ${fileName}` : "Uploaded card design"}
        className="max-h-72 max-w-full rounded-tapit border border-tapit-line object-contain"
        src={url}
      />
      {fileName ? <span className="mt-2 block text-xs text-tapit-muted">{fileName}</span> : null}
    </a>
  );
}

function DemoOrderArtwork({ design }: { design: Extract<OrderDesign, { kind: "upload" }> }) {
  const [asset, setAsset] = useState<{ sourceId: string; url: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void readDemoCardOrderAsset(design.sourceId)
      .then((stored) => {
        if (!active) return;
        if (stored === null) {
          setAsset({ sourceId: design.sourceId, url: null });
          return;
        }
        objectUrl = URL.createObjectURL(stored.blob);
        setAsset({ sourceId: design.sourceId, url: objectUrl });
      })
      .catch(() => {
        if (active) setAsset({ sourceId: design.sourceId, url: null });
      });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [design.sourceId]);

  if (asset?.sourceId === design.sourceId && asset.url === null) {
    return <p className="text-sm text-tapit-muted">Uploaded artwork is unavailable.</p>;
  }
  if (!asset || asset.sourceId !== design.sourceId || !asset.url) {
    return <p className="text-sm text-tapit-muted">Loading private artwork…</p>;
  }
  return <UploadedArtwork fileName={design.fileName} url={asset.url} />;
}

function LiveOrderArtwork({ orderId, fileName }: { orderId: string; fileName?: string }) {
  const url = useQuery(api.cardOrderDesigns.adminDesignUrl, {
    orderId: orderId as Id<"cardOrders">,
  });

  if (url === null)
    return <p className="text-sm text-tapit-muted">Uploaded artwork is unavailable.</p>;
  if (url === undefined)
    return <p className="text-sm text-tapit-muted">Loading private artwork…</p>;

  return <UploadedArtwork fileName={fileName} url={url} />;
}

function OrderCard({
  order,
  demo,
  busy,
  onAction,
  onConfirmAction,
}: {
  order: AdminOrder;
  demo: boolean;
  busy: boolean;
  onAction: (orderId: string, action: OrderAction) => void;
  onConfirmAction: (orderId: string, action: "cancel" | "refund") => void;
}) {
  const [shippingPesos, setShippingPesos] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [inputError, setInputError] = useState("");
  const awaitingQuote =
    order.fulfillmentStatus === "awaiting_shipping_quote" && order.paymentStatus === "unpaid";
  const awaitingPayment =
    order.fulfillmentStatus === "awaiting_payment" && order.paymentStatus === "unpaid";
  const processingPaid =
    order.fulfillmentStatus === "processing" && order.paymentStatus === "received";
  const canCancel =
    order.paymentStatus === "unpaid" &&
    ["awaiting_shipping_quote", "awaiting_payment"].includes(order.fulfillmentStatus);
  const canRefund =
    order.paymentStatus === "received" &&
    ["processing", "delivered"].includes(order.fulfillmentStatus);
  const canMarkCommissionEligible =
    order.fulfillmentStatus === "delivered" &&
    order.paymentStatus === "received" &&
    order.commissionStatus === "pending";
  const canRecordPayout =
    order.fulfillmentStatus === "delivered" &&
    order.paymentStatus === "received" &&
    order.commissionStatus === "eligible";

  function submitShippingQuote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInputError("");
    try {
      onAction(order.id, {
        kind: "quoteShipping",
        shippingQuoteCentavos: parsePesosToCentavos(shippingPesos),
      });
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Enter a valid shipping quote.");
    }
  }

  function submitPayoutReference(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInputError("");
    if (!payoutReference.trim()) {
      setInputError("Enter the payout reference.");
      return;
    }
    onAction(order.id, { kind: "recordPayout", payoutReference: payoutReference.trim() });
  }

  return (
    <article className="rounded-tapit border border-tapit-line bg-tapit-surface p-5 shadow-[0_8px_24px_rgba(27,36,51,0.05)] sm:p-7">
      <header className="flex flex-col gap-3 border-b border-tapit-line pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="break-all text-lg font-semibold text-tapit-ink">Order {order.id}</h2>
          <p className="mt-1 text-sm text-tapit-muted">
            Placed{" "}
            {new Date(order.createdAt).toLocaleString("en-PH", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold capitalize">
          <span className="rounded-full bg-tapit-soft-surface px-3 py-1.5 text-tapit-ink">
            Payment: {formatStatus(order.paymentStatus)}
          </span>
          <span className="rounded-full bg-tapit-soft-surface px-3 py-1.5 text-tapit-ink">
            Fulfillment: {formatStatus(order.fulfillmentStatus)}
          </span>
          <span className="rounded-full bg-tapit-soft-surface px-3 py-1.5 text-tapit-ink">
            Commission: {formatStatus(order.commissionStatus)}
          </span>
        </div>
      </header>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <section aria-label="Customer and delivery details" className="min-w-0">
          <h3 className="font-semibold text-tapit-ink">Customer and delivery</h3>
          <dl className="mt-3 grid gap-3 text-sm leading-6">
            <div>
              <dt className="text-tapit-muted">Customer ID</dt>
              <dd className="break-all font-medium text-tapit-ink">{order.customerId}</dd>
            </div>
            <div>
              <dt className="text-tapit-muted">Recipient</dt>
              <dd className="font-medium text-tapit-ink">{order.deliveryName}</dd>
            </div>
            <div>
              <dt className="text-tapit-muted">Phone</dt>
              <dd className="font-medium text-tapit-ink">{order.deliveryPhone}</dd>
            </div>
            <div>
              <dt className="text-tapit-muted">Delivery address</dt>
              <dd className="whitespace-pre-wrap break-words font-medium text-tapit-ink">
                {order.deliveryAddress}
              </dd>
            </div>
          </dl>
        </section>

        <section className="min-w-0">
          <h3 className="font-semibold text-tapit-ink">Private design</h3>
          <div className="mt-3">
            <OrderDesign demo={demo} design={order.design} orderId={order.id} />
          </div>
        </section>

        <section className="min-w-0">
          <h3 className="font-semibold text-tapit-ink">Payment snapshot</h3>
          <dl className="mt-3 grid gap-3 text-sm leading-6">
            <div>
              <dt className="text-tapit-muted">Provider and method</dt>
              <dd className="font-medium text-tapit-ink">
                {order.paymentSnapshot.provider} · {order.paymentSnapshot.label}
              </dd>
            </div>
            <div>
              <dt className="text-tapit-muted">Account details</dt>
              <dd className="whitespace-pre-wrap break-words font-medium text-tapit-ink">
                {order.paymentSnapshot.accountDetails}
              </dd>
            </div>
            <div>
              <dt className="text-tapit-muted">Instructions</dt>
              <dd className="whitespace-pre-wrap break-words font-medium text-tapit-ink">
                {order.paymentSnapshot.instructions}
              </dd>
            </div>
          </dl>
        </section>

        <section className="min-w-0">
          <h3 className="font-semibold text-tapit-ink">Price breakdown</h3>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm leading-6">
            <dt className="text-tapit-muted">Card × {order.quantity}</dt>
            <dd className="text-right font-medium text-tapit-ink">
              {formatMoney(order.cardPriceCentavos)}
            </dd>
            <dt className="text-tapit-muted">Referral discount</dt>
            <dd className="text-right font-medium text-tapit-ink">
              −{formatMoney(order.discountCentavos)}
            </dd>
            <dt className="text-tapit-muted">Shipping</dt>
            <dd className="text-right font-medium text-tapit-ink">
              {order.shippingQuoteCentavos === undefined
                ? "Not quoted"
                : formatMoney(order.shippingQuoteCentavos)}
            </dd>
            <dt className="border-t border-tapit-line pt-2 font-semibold text-tapit-ink">Total</dt>
            <dd className="border-t border-tapit-line pt-2 text-right font-semibold text-tapit-ink">
              {order.shippingQuoteCentavos === undefined
                ? "Pending shipping quote"
                : formatMoney(
                    order.cardPriceCentavos - order.discountCentavos + order.shippingQuoteCentavos,
                  )}
            </dd>
          </dl>
        </section>

        <section className="min-w-0">
          <h3 className="font-semibold text-tapit-ink">Referral and commission</h3>
          <dl className="mt-3 grid gap-3 text-sm leading-6">
            <div>
              <dt className="text-tapit-muted">Referral</dt>
              <dd className="font-medium text-tapit-ink">
                {order.referralSnapshot
                  ? `${order.referralSnapshot.referrerLabel} · ${order.referralSnapshot.code}`
                  : "No referral"}
              </dd>
            </div>
            <div>
              <dt className="text-tapit-muted">Commission amount</dt>
              <dd className="font-medium text-tapit-ink">
                {formatMoney(order.commissionCentavos)}
              </dd>
            </div>
            {order.payoutReference ? (
              <div>
                <dt className="text-tapit-muted">Payout reference</dt>
                <dd className="break-words font-medium text-tapit-ink">{order.payoutReference}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="min-w-0 lg:col-span-2">
          <h3 className="font-semibold text-tapit-ink">Admin actions</h3>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {awaitingQuote ? (
              <form className="flex flex-wrap items-end gap-3" onSubmit={submitShippingQuote}>
                <div className="w-48">
                  <Field
                    id={`shipping-quote-${order.id}`}
                    inputMode="decimal"
                    label="Shipping quote (pesos)"
                    onChange={(event) => setShippingPesos(event.target.value)}
                    placeholder="125.00"
                    value={shippingPesos}
                  />
                </div>
                <Button disabled={busy} type="submit" variant="secondary">
                  Quote shipping
                </Button>
              </form>
            ) : null}
            {awaitingPayment ? (
              <Button
                disabled={busy}
                onClick={() => onAction(order.id, { kind: "markPaid" })}
                type="button"
                variant="secondary"
              >
                Mark paid
              </Button>
            ) : null}
            {processingPaid ? (
              <Button
                disabled={busy}
                onClick={() => onAction(order.id, { kind: "markDelivered" })}
                type="button"
                variant="secondary"
              >
                Mark delivered
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                disabled={busy}
                onClick={() => onConfirmAction(order.id, "cancel")}
                type="button"
                variant="danger"
              >
                Cancel order
              </Button>
            ) : null}
            {canRefund ? (
              <Button
                disabled={busy}
                onClick={() => onConfirmAction(order.id, "refund")}
                type="button"
                variant="danger"
              >
                Refund order
              </Button>
            ) : null}
            {canMarkCommissionEligible ? (
              <Button
                disabled={busy}
                onClick={() => onAction(order.id, { kind: "commissionEligible" })}
                type="button"
                variant="secondary"
              >
                Mark commission eligible
              </Button>
            ) : null}
            {canRecordPayout ? (
              <form className="flex flex-wrap items-end gap-3" onSubmit={submitPayoutReference}>
                <div className="w-64">
                  <Field
                    id={`payout-reference-${order.id}`}
                    label="Payout reference"
                    onChange={(event) => setPayoutReference(event.target.value)}
                    required
                    value={payoutReference}
                  />
                </div>
                <Button disabled={busy} type="submit" variant="secondary">
                  Record payout
                </Button>
              </form>
            ) : null}
            {!awaitingQuote &&
            !awaitingPayment &&
            !processingPaid &&
            !canCancel &&
            !canRefund &&
            !canMarkCommissionEligible &&
            !canRecordPayout ? (
              <p className="text-sm text-tapit-muted">
                No manual action is available in the current order state.
              </p>
            ) : null}
          </div>
          {inputError ? (
            <p className="mt-3 text-sm text-tapit-danger" role="alert">
              {inputError}
            </p>
          ) : null}
        </section>
      </div>
    </article>
  );
}

function OrdersView({
  orders,
  demo,
  loading,
  canLoadMore,
  loadingMore,
  loadMore,
  onAction,
}: {
  orders: AdminOrder[];
  demo: boolean;
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  loadMore?: () => void;
  onAction: (orderId: string, action: OrderAction) => Promise<void>;
}) {
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);

  async function performAction(orderId: string, action: OrderAction) {
    setBusyOrderId(orderId);
    setMessage(null);
    try {
      await onAction(orderId, action);
      setMessage({ tone: "success", text: "Order updated." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Order could not be updated.",
      });
    } finally {
      setBusyOrderId(null);
    }
  }

  const confirmedAction = confirmation;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <AdminPageHeader
        description="Review private order snapshots, shipping quotes, payment, fulfillment, and referral commissions."
        title="Orders"
      />
      <Panel
        description="Customer delivery details and design artwork are visible only in this administrator workspace. Each manual order change is recorded in the audit log."
        title="Card orders"
      >
        {message ? (
          <div className="mt-5">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        ) : null}
        {loading && orders.length === 0 ? (
          <div className="mt-5">
            <Notice>Loading orders…</Notice>
          </div>
        ) : orders.length === 0 ? (
          <p className="mt-5 text-sm text-tapit-muted">No card orders yet.</p>
        ) : (
          <div className="mt-5 grid gap-5">
            {orders.map((order) => (
              <OrderCard
                busy={busyOrderId !== null}
                demo={demo}
                key={order.id}
                onAction={(orderId, action) => void performAction(orderId, action)}
                onConfirmAction={(orderId, action) => setConfirmation({ orderId, action })}
                order={order}
              />
            ))}
          </div>
        )}
        {canLoadMore && loadMore ? (
          <div className="mt-6">
            <Button
              disabled={loadingMore}
              loading={loadingMore}
              onClick={loadMore}
              type="button"
              variant="secondary"
            >
              Load older orders
            </Button>
          </div>
        ) : null}
      </Panel>
      <ConfirmDialog
        confirmLabel={confirmedAction?.action === "refund" ? "Refund order" : "Cancel order"}
        description={
          confirmedAction?.action === "refund"
            ? "Mark this order as refunded and void any unpaid referral commission?"
            : "Cancel this unpaid order? This cannot be undone."
        }
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmedAction !== null) {
            const action = confirmedAction.action;
            void performAction(confirmedAction.orderId, { kind: action });
          }
          setConfirmation(null);
        }}
        open={confirmation !== null}
        title={confirmedAction?.action === "refund" ? "Refund order" : "Cancel order"}
      />
    </div>
  );
}

function DemoOrderManager() {
  useDemoState();
  const orders = getAdminDemoCardOrders().map(demoOrder);

  async function onAction(orderId: string, action: OrderAction) {
    switch (action.kind) {
      case "quoteShipping":
        await quoteDemoCardOrderShipping(orderId, action.shippingQuoteCentavos);
        break;
      case "markPaid":
        await markDemoCardOrderPaymentReceived(orderId);
        break;
      case "markDelivered":
        await markDemoCardOrderDelivered(orderId);
        break;
      case "cancel":
        await cancelDemoCardOrder(orderId);
        break;
      case "refund":
        await refundDemoCardOrder(orderId);
        break;
      case "commissionEligible":
        await markDemoCardOrderCommissionEligible(orderId);
        break;
      case "recordPayout":
        await recordDemoCardOrderCommissionPayout(orderId, action.payoutReference);
        break;
    }
  }

  return (
    <OrdersView
      canLoadMore={false}
      demo
      loading={false}
      loadingMore={false}
      onAction={onAction}
      orders={orders}
    />
  );
}

function LiveOrderManager() {
  const pages = usePaginatedQuery(api.cardOrders.adminOrders, {}, { initialNumItems: 25 });
  const quoteShipping = useMutation(api.cardOrders.quoteShipping);
  const markPaymentReceived = useMutation(api.cardOrders.markPaymentReceived);
  const markDelivered = useMutation(api.cardOrders.markDelivered);
  const cancelOrder = useMutation(api.cardOrders.cancelOrder);
  const refundOrder = useMutation(api.cardOrders.refundOrder);
  const markCommissionEligible = useMutation(api.cardOrders.markCommissionEligible);
  const recordCommissionPayout = useMutation(api.cardOrders.recordCommissionPayout);

  async function onAction(orderId: string, action: OrderAction) {
    const id = orderId as Id<"cardOrders">;
    switch (action.kind) {
      case "quoteShipping":
        await quoteShipping({ orderId: id, shippingQuoteCentavos: action.shippingQuoteCentavos });
        break;
      case "markPaid":
        await markPaymentReceived({ orderId: id });
        break;
      case "markDelivered":
        await markDelivered({ orderId: id });
        break;
      case "cancel":
        await cancelOrder({ orderId: id });
        break;
      case "refund":
        await refundOrder({ orderId: id });
        break;
      case "commissionEligible":
        await markCommissionEligible({ orderId: id });
        break;
      case "recordPayout":
        await recordCommissionPayout({ orderId: id, payoutReference: action.payoutReference });
        break;
    }
  }

  return (
    <OrdersView
      canLoadMore={pages.status === "CanLoadMore"}
      demo={false}
      loadMore={() => pages.loadMore(25)}
      loading={pages.status === "LoadingFirstPage"}
      loadingMore={pages.status === "LoadingMore"}
      onAction={onAction}
      orders={pages.results.map(liveOrder)}
    />
  );
}

export function OrderManager() {
  return isLocalDemoMode() ? <DemoOrderManager /> : <LiveOrderManager />;
}
