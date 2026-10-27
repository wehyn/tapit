"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { isLocalDemoMode } from "@/lib/demo/mode";
import {
  getDemoCardOrderAdminSettings,
  getDemoCardOrderReferralCodeUsage,
  saveDemoCardOrderReferralCode,
  setDemoCardOrderReferralCodeActive,
} from "@/lib/demo/card-ordering";
import { useDemoState } from "@/lib/demo/store";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";

type Code = {
  id: string;
  code: string;
  referrerLabel: string;
  fixedPriceCentavos?: number;
  active: boolean;
  usageCount: number;
};
type Usage = {
  date: number;
  orderId: string;
  customerName?: string;
  customerEmail?: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  commissionStatus: string;
};
const pageSize = 20;
const money = (centavos: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(centavos / 100);

export function CodesManager() {
  return isLocalDemoMode() ? <DemoCodesManager /> : <LiveCodesManager />;
}

function CodesWorkspace({
  codes,
  selectedId,
  onSelect,
  usage,
  usageCodeId,
  hasMore,
  loadMore,
  loading,
  onSave,
  onSetActive,
}: {
  codes: Code[];
  selectedId: string;
  onSelect: (id: string) => void;
  usage: Usage[];
  usageCodeId: string;
  hasMore: boolean;
  loadMore: () => void;
  loading: boolean;
  onSave: (input: {
    id?: string;
    code: string;
    referrerLabel: string;
    fixedPriceCentavos?: number;
    active: boolean;
  }) => Promise<void>;
  onSetActive: (id: string, active: boolean) => Promise<void>;
}) {
  const [editId, setEditId] = useState("");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const selected = codes.find((item) => item.id === selectedId);

  function reset() {
    setEditId("");
    setCode("");
    setLabel("");
    setPrice("");
    setActive(true);
  }
  function cancelEdit() {
    reset();
    setMessage({ tone: "success", text: "Editing cancelled." });
  }
  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: "success", text: success });
      return true;
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Referral code could not be saved.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(normalized)) {
      setMessage({
        tone: "error",
        text: "Use letters, numbers, hyphens, or underscores in the code.",
      });
      return;
    }
    if (codes.some((item) => item.code.toUpperCase() === normalized && item.id !== editId)) {
      setMessage({ tone: "error", text: "Referral code already exists." });
      return;
    }
    const priceMatch = /^(\d+)(?:\.(\d{1,2}))?$/.exec(price);
    const centavos =
      price === ""
        ? undefined
        : priceMatch
          ? Number(priceMatch[1]) * 100 + Number((priceMatch[2] ?? "").padEnd(2, "0"))
          : NaN;
    if (
      centavos !== undefined &&
      (!Number.isSafeInteger(centavos) || centavos <= 0 || centavos > 59900)
    ) {
      setMessage({
        tone: "error",
        text: "Fixed price must be a positive whole-centavo amount no greater than ₱599.",
      });
      return;
    }
    const saved = await run(
      () =>
        onSave({
          ...(editId ? { id: editId } : {}),
          code: normalized,
          referrerLabel: label.trim(),
          fixedPriceCentavos: centavos,
          active,
        }),
      editId ? "Referral code updated." : "Referral code created.",
    );
    if (saved) reset();
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 pt-2">
      <AdminPageHeader
        title="Codes"
        description="Manage referral codes and review their order usage."
      />
      <Card
        title="Referral codes"
        description="Codes are unique across active and inactive records. Fixed prices must be no more than ₱599."
      >
        <form className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Field
            autoCapitalize="characters"
            disabled={busy}
            id="referral-code"
            label="Referral code"
            onChange={(event) => setCode(event.target.value)}
            placeholder="PARTNER10"
            required
            value={code}
          />
          <Field
            id="referrer-label"
            label="Referrer label"
            disabled={busy}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Studio Santos"
            required
            value={label}
          />
          <Field
            id="referral-fixed-price"
            label="Fixed card price (₱, optional)"
            disabled={busy}
            min="0.01"
            max="599"
            onChange={(event) => setPrice(event.target.value)}
            placeholder="Blank for 10% off"
            step="0.01"
            type="number"
            value={price}
          />
          <label className="flex items-center gap-2 text-sm font-medium text-tapit-ink">
            <input
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              disabled={busy}
              type="checkbox"
            />{" "}
            Active
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <Button disabled={busy} type="submit">
              {editId ? "Save code" : "Create code"}
            </Button>
            {editId ? (
              <Button disabled={busy} onClick={cancelEdit} type="button" variant="secondary">
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
        <div className="mt-4 grid gap-2">
          {codes.length ? (
            codes.map((item) => (
              <div
                className={`flex flex-wrap items-center gap-3 rounded-card p-3 ${item.id === selectedId ? "bg-tapit-accent-soft" : "bg-tapit-paper/60"}`}
                key={item.id}
              >
                <button
                  className="min-w-40 grow text-left"
                  onClick={() => onSelect(item.id)}
                  type="button"
                >
                  <span className="font-semibold text-tapit-ink">{item.code}</span>
                  <span className="ml-2 text-sm text-tapit-muted">
                    {item.referrerLabel} · {item.active ? "Active" : "Inactive"} ·{" "}
                    {item.fixedPriceCentavos === undefined
                      ? "10% off"
                      : money(item.fixedPriceCentavos)}{" "}
                    · {item.usageCount} uses
                  </span>
                </button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    onSelect(item.id);
                    setEditId(item.id);
                    setCode(item.code);
                    setLabel(item.referrerLabel);
                    setPrice(
                      item.fixedPriceCentavos === undefined
                        ? ""
                        : String(item.fixedPriceCentavos / 100),
                    );
                    setActive(item.active);
                  }}
                  type="button"
                  variant="secondary"
                >
                  Edit
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => onSetActive(item.id, !item.active),
                      item.active ? "Referral code deactivated." : "Referral code activated.",
                    )
                  }
                  type="button"
                  variant="quiet"
                >
                  {item.active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-tapit-muted">No referral codes configured.</p>
          )}
        </div>
      </Card>
      {selected ? (
        <Card
          title={`Usage history · ${selected.code}`}
          description="Order identifiers and status only; delivery details are not shown."
        >
          {loading || usageCodeId !== selectedId ? (
            <p className="text-sm text-tapit-muted">Loading usage…</p>
          ) : usage.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {["Date", "Order", "Customer", "Payment", "Fulfillment", "Commission"].map(
                      (heading) => (
                        <th className="p-2" key={heading}>
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {usage.map((row) => (
                    <tr key={row.orderId}>
                      <td className="p-2">{new Date(row.date).toLocaleDateString("en-PH")}</td>
                      <td className="p-2">
                        <Link
                          className="font-semibold text-tapit-accent underline"
                          href={`/admin/orders?orderId=${encodeURIComponent(row.orderId)}`}
                        >
                          {row.orderId}
                        </Link>
                      </td>
                      <td className="p-2">
                        {row.customerName ?? row.customerEmail ?? "Customer unavailable"}
                        {row.customerName && row.customerEmail ? (
                          <span className="block text-xs text-tapit-muted">
                            {row.customerEmail}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2">{row.paymentStatus.replaceAll("_", " ")}</td>
                      <td className="p-2">{row.fulfillmentStatus.replaceAll("_", " ")}</td>
                      <td className="p-2">{row.commissionStatus.replaceAll("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-tapit-muted">No orders used this code.</p>
          )}
          {usageCodeId === selectedId && hasMore ? (
            <div className="mt-4">
              <Button disabled={loading} onClick={loadMore} type="button" variant="secondary">
                Load more usage
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </div>
  );
}

function DemoCodesManager() {
  useDemoState();
  const settings = getDemoCardOrderAdminSettings();
  const [selectedId, setSelectedId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [loadedMore, setLoadedMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const firstPage = selectedId
    ? getDemoCardOrderReferralCodeUsage(selectedId, { numItems: pageSize, cursor: null })
    : null;
  function selectCode(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setCursor(null);
    setUsage([]);
    setLoadedMore(false);
    setHasMore(false);
  }
  const codes: Code[] = settings.referralCodes.map(
    ({ id, code, referrerLabel, fixedPriceCentavos, active, usageCount }) => ({
      id,
      code,
      referrerLabel,
      fixedPriceCentavos,
      active,
      usageCount,
    }),
  );
  return (
    <CodesWorkspace
      codes={codes}
      selectedId={selectedId}
      onSelect={selectCode}
      usage={[...(firstPage?.page ?? []), ...usage]}
      usageCodeId={selectedId}
      hasMore={loadedMore ? hasMore : Boolean(firstPage && !firstPage.isDone)}
      loading={false}
      loadMore={() => {
        const result = getDemoCardOrderReferralCodeUsage(selectedId, {
          numItems: pageSize,
          cursor: cursor ?? firstPage?.continueCursor ?? null,
        });
        setUsage((previous) => [...previous, ...result.page]);
        setLoadedMore(true);
        setHasMore(!result.isDone);
        setCursor(result.continueCursor || null);
      }}
      onSave={async (input) => {
        const id = await saveDemoCardOrderReferralCode({ ...input });
        selectCode(id);
      }}
      onSetActive={setDemoCardOrderReferralCodeActive}
    />
  );
}

function LiveCodesManager() {
  const codesResult = useQuery(api.cardOrderSettings.adminReferralCodes, {});
  const backfill = useMutation(api.cardOrderSettings.startReferralUsageBackfill);
  const save = useMutation(api.cardOrderSettings.saveReferralCode);
  const deactivate = useMutation(api.cardOrderSettings.deactivateReferralCode);
  const activate = useMutation(api.cardOrderSettings.activateReferralCode);
  const [selectedId, setSelectedId] = useState<Id<"cardOrderReferralCodes"> | null>(null);
  const backfillStarted = useRef(false);
  useEffect(() => {
    if (backfillStarted.current) return;
    backfillStarted.current = true;
    void backfill({});
  }, [backfill]);
  const page = usePaginatedQuery(
    api.cardOrderSettings.adminReferralCodeUsage,
    selectedId ? { codeId: selectedId } : "skip",
    { initialNumItems: pageSize },
  );
  const codes: Code[] = (codesResult ?? []).map(({ _id, ...item }) => ({ id: _id, ...item }));
  return codesResult === undefined ? (
    <div className="pt-2">
      <Notice>Loading referral codes…</Notice>
    </div>
  ) : (
    <CodesWorkspace
      codes={codes}
      selectedId={selectedId ?? ""}
      onSelect={(id) => setSelectedId(id as Id<"cardOrderReferralCodes">)}
      usage={(page.results ?? []) as Usage[]}
      usageCodeId={page.status === "LoadingFirstPage" ? "" : (selectedId ?? "")}
      hasMore={page.status === "CanLoadMore"}
      loading={page.status === "LoadingFirstPage" || page.status === "LoadingMore"}
      loadMore={() => page.loadMore(pageSize)}
      onSave={async (input) => {
        const id = await save({
          ...(input.id ? { id: input.id as Id<"cardOrderReferralCodes"> } : {}),
          code: input.code,
          referrerLabel: input.referrerLabel,
          fixedPriceCentavos: input.fixedPriceCentavos,
          active: input.active,
        });
        setSelectedId(id);
      }}
      onSetActive={async (id, value) => {
        await (value ? activate : deactivate)({ id: id as Id<"cardOrderReferralCodes"> });
      }}
    />
  );
}
