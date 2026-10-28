"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { isLocalDemoMode } from "@/lib/demo/mode";
import * as demoOrdering from "@/lib/demo/card-ordering";
import { useDemoState } from "@/lib/demo/store";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";

type Offer = { id: string; code: string; fixedPriceCentavos?: number; usageCount: number; usageLimit?: number };
type Code = { id: string; code: string; referrerCode?: string; referrerLabel?: string; active: boolean; offer?: Offer };
type Usage = { date: number; orderId: string; customerName?: string; customerEmail?: string; paymentStatus: string; fulfillmentStatus: string; commissionStatus: string };
type OfferInput = { id?: string; code: string; fixedPriceCentavos?: number; usageLimit?: number };
type AliasInput = { id?: string; code: string; offerId?: string; referrerCode?: string; referrerLabel?: string; active: boolean };
const pageSize = 20;
const money = (centavos: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(centavos / 100);
const codePattern = /^[A-Z0-9_-]+$/;

export function CodesManager() { return isLocalDemoMode() ? <DemoCodesManager /> : <LiveCodesManager />; }

function CodesWorkspace({ codes, selectedId, onSelect, usage, usageCodeId, hasMore, loadMore, loading, onSaveAlias, onSetActive, offers, onSaveOffer }: {
  codes: Code[]; selectedId: string; onSelect: (id: string) => void; usage: Usage[]; usageCodeId: string; hasMore: boolean; loadMore: () => void; loading: boolean;
  onSaveAlias: (input: AliasInput) => Promise<void>; onSetActive: (id: string, active: boolean) => Promise<void>; offers: Offer[]; onSaveOffer: (input: OfferInput) => Promise<void>;
}) {
  const [aliasId, setAliasId] = useState(""); const [aliasCode, setAliasCode] = useState(""); const [referrerCode, setReferrerCode] = useState(""); const [referrerLabel, setReferrerLabel] = useState(""); const [offerId, setOfferId] = useState(""); const [active, setActive] = useState(true);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null); const [offerCode, setOfferCode] = useState(""); const [price, setPrice] = useState(""); const [usageLimit, setUsageLimit] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const selected = codes.find((item) => item.id === selectedId);
  async function run(action: () => Promise<void>, success: string) { setBusy(true); setMessage(null); try { await action(); setMessage({ tone: "success", text: success }); return true; } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Code could not be saved." }); return false; } finally { setBusy(false); } }
  function resetAlias() { setAliasId(""); setAliasCode(""); setReferrerCode(""); setReferrerLabel(""); setOfferId(""); setActive(true); }
  function startOffer(offer?: Offer) { setEditingOffer(offer ?? null); setOfferCode(offer?.code ?? ""); setPrice(offer?.fixedPriceCentavos === undefined ? "" : String(offer.fixedPriceCentavos / 100)); setUsageLimit(offer?.usageLimit === undefined ? "" : String(offer.usageLimit)); }
  async function submitOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const normalized = offerCode.trim().toUpperCase();
    if (!codePattern.test(normalized) || offers.some((item) => item.code === normalized && item.id !== editingOffer?.id)) { setMessage({ tone: "error", text: "Use a unique offer code with letters, numbers, hyphens, or underscores." }); return; }
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(price); const cents = price === "" ? undefined : match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : NaN;
    if (cents !== undefined && (!Number.isSafeInteger(cents) || cents <= 0 || cents > 59900)) { setMessage({ tone: "error", text: "Fixed price must be a positive whole-centavo amount no greater than ₱599." }); return; }
    const limit = usageLimit === "" ? undefined : Number(usageLimit);
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) { setMessage({ tone: "error", text: "Usage limit must be a positive whole number." }); return; }
    if (await run(() => onSaveOffer({ ...(editingOffer ? { id: editingOffer.id } : {}), code: normalized, fixedPriceCentavos: cents, usageLimit: limit }), editingOffer ? "Offer updated." : "Offer created.")) startOffer();
  }
  async function submitAlias(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const normalized = aliasCode.trim().toUpperCase();
    if (!codePattern.test(normalized)) { setMessage({ tone: "error", text: "Use letters, numbers, hyphens, or underscores in the code." }); return; }
    if (codes.some((item) => item.code === normalized && item.id !== aliasId)) { setMessage({ tone: "error", text: "Code already exists." }); return; }
    if (await run(() => onSaveAlias({ ...(aliasId ? { id: aliasId } : {}), code: normalized, ...(offerId ? { offerId } : {}), ...(referrerCode.trim() ? { referrerCode: referrerCode.trim().toUpperCase() } : {}), ...(referrerLabel.trim() ? { referrerLabel: referrerLabel.trim() } : {}), active }), aliasId ? "Code updated." : "Code created.")) resetAlias();
  }
  return <div className="flex min-w-0 flex-col gap-6 pt-2">
    <AdminPageHeader title="Codes" description="Manage codes and review their order usage." />
    <Card title="Offers" description="Offer pricing and usage limits are shared by every exact code mapped to that offer.">
      <div className="mt-4 grid gap-2">{offers.map((offer) => <section className="rounded-card bg-tapit-paper/60 p-3" key={offer.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-tapit-ink">{offer.code}</h3><p className="text-sm text-tapit-muted">{offer.fixedPriceCentavos === undefined ? "10% off" : money(offer.fixedPriceCentavos)} · {offer.usageLimit === undefined ? `${offer.usageCount} uses · unlimited` : `${offer.usageCount} of ${offer.usageLimit} uses · ${Math.max(0, offer.usageLimit - offer.usageCount)} remaining`}</p><p className="mt-1 text-sm text-tapit-muted">Codes: {codes.filter((code) => code.offer?.id === offer.id).map((code) => code.code).join(", ") || "None"}</p></div><Button disabled={busy} onClick={() => startOffer(offer)} type="button" variant="secondary">Edit offer</Button></div>
        {editingOffer?.id === offer.id ? <OfferForm {...{ busy, offerCode, setOfferCode, price, setPrice, usageLimit, setUsageLimit, onSubmit: submitOffer, onCancel: () => startOffer() }} /> : null}
      </section>)}{offers.length === 0 ? <p className="text-sm text-tapit-muted">No offers configured.</p> : null}</div>
      {!editingOffer ? <OfferForm {...{ busy, offerCode, setOfferCode, price, setPrice, usageLimit, setUsageLimit, onSubmit: submitOffer, onCancel: undefined }} /> : null}
    </Card>
    <Card title="Exact codes">
      <form className="mt-2 grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={submitAlias}>
        <Field autoCapitalize="characters" disabled={busy} id="referral-code" label="Referral code" onChange={(e) => setAliasCode(e.target.value)} placeholder="FOUNDING-AHRON" required value={aliasCode} />
        <label className="grid gap-1 text-sm font-medium text-tapit-ink">Offer (optional)<select className="min-h-11 rounded-control bg-tapit-soft-surface px-4 py-3 text-sm" disabled={busy} value={offerId} onChange={(e) => setOfferId(e.target.value)}><option value="">No offer</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.code}</option>)}</select></label>
        <Field disabled={busy} id="referrer-code" label="Referrer key (optional)" onChange={(e) => setReferrerCode(e.target.value)} placeholder="AHRON" value={referrerCode} />
        <Field disabled={busy} id="referrer-label" label="Referrer label (optional)" onChange={(e) => setReferrerLabel(e.target.value)} placeholder="Ahron" value={referrerLabel} />
        <label className="flex items-center gap-2 text-sm font-medium text-tapit-ink"><input checked={active} disabled={busy} onChange={(e) => setActive(e.target.checked)} type="checkbox" /> Active</label>
        <div className="flex gap-3 sm:col-span-2"><Button disabled={busy} type="submit">{aliasId ? "Save code" : "Create code"}</Button>{aliasId ? <Button disabled={busy} onClick={resetAlias} type="button" variant="secondary">Cancel</Button> : null}</div>
      </form>
      <div className="mt-4 grid gap-2">{codes.map((item) => <div className={`flex flex-wrap items-center gap-3 rounded-card p-3 ${item.id === selectedId ? "bg-tapit-accent-soft" : "bg-tapit-paper/60"}`} key={item.id}>
        <button className="min-w-40 grow text-left" onClick={() => onSelect(item.id)} type="button"><span className="font-semibold text-tapit-ink">{item.code}</span><span className="ml-2 text-sm text-tapit-muted">{item.offer?.code ? `→ ${item.offer.code} · ` : ""}{item.referrerLabel ?? item.referrerCode ?? "Referral only"} · {item.active ? "Active" : "Inactive"}</span></button>
        <Button disabled={busy} onClick={() => { setAliasId(item.id); setAliasCode(item.code); setOfferId(item.offer?.id ?? ""); setReferrerCode(item.referrerCode ?? ""); setReferrerLabel(item.referrerLabel ?? ""); setActive(item.active); }} type="button" variant="secondary">Edit</Button>
        <Button disabled={busy} onClick={() => void run(() => onSetActive(item.id, !item.active), item.active ? "Referral code deactivated." : "Referral code activated.")} type="button" variant="quiet">{item.active ? "Deactivate" : "Activate"}</Button>
      </div>)}{codes.length === 0 ? <p className="text-sm text-tapit-muted">No referral codes configured.</p> : null}</div>
    </Card>
    {selected ? <Card title={`Usage history · ${selected.code}`} description="Order identifiers and status only; delivery details are not shown.">{loading || usageCodeId !== selectedId ? <p className="text-sm text-tapit-muted">Loading usage…</p> : usage.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Date", "Order", "Customer", "Payment", "Fulfillment", "Commission"].map((heading) => <th className="p-2" key={heading}>{heading}</th>)}</tr></thead><tbody>{usage.map((row) => <tr key={row.orderId}><td className="p-2">{new Date(row.date).toLocaleDateString("en-PH")}</td><td className="p-2"><Link className="font-semibold text-tapit-accent underline" href={`/admin/orders?orderId=${encodeURIComponent(row.orderId)}`}>{row.orderId}</Link></td><td className="p-2">{row.customerName ?? row.customerEmail ?? "Customer unavailable"}{row.customerName && row.customerEmail ? <span className="block text-xs text-tapit-muted">{row.customerEmail}</span> : null}</td><td className="p-2">{row.paymentStatus.replaceAll("_", " ")}</td><td className="p-2">{row.fulfillmentStatus.replaceAll("_", " ")}</td><td className="p-2">{row.commissionStatus.replaceAll("_", " ")}</td></tr>)}</tbody></table></div> : <p className="text-sm text-tapit-muted">No orders used this code.</p>}{usageCodeId === selectedId && hasMore ? <div className="mt-4"><Button disabled={loading} onClick={loadMore} type="button" variant="secondary">Load more usage</Button></div> : null}</Card> : null}
    {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
  </div>;
}

function OfferForm({ busy, offerCode, setOfferCode, price, setPrice, usageLimit, setUsageLimit, onSubmit, onCancel }: { busy: boolean; offerCode: string; setOfferCode: (v: string) => void; price: string; setPrice: (v: string) => void; usageLimit: string; setUsageLimit: (v: string) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onCancel?: () => void }) {
  return <form className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={onSubmit}><Field disabled={busy} id="offer-code" label="Offer code" onChange={(e) => setOfferCode(e.target.value)} placeholder="FOUNDING" required value={offerCode} /><Field disabled={busy} id="offer-price" label="Fixed card price (₱, optional)" max="599" min="0.01" onChange={(e) => setPrice(e.target.value)} placeholder="Blank for 10% off" step="0.01" type="number" value={price} /><Field disabled={busy} id="offer-limit" label="Usage limit (orders, optional)" min={1} onChange={(e) => setUsageLimit(e.target.value)} step={1} type="number" value={usageLimit} /><div className="flex gap-3"><Button disabled={busy} type="submit">Save offer</Button>{onCancel ? <Button disabled={busy} onClick={onCancel} type="button" variant="secondary">Cancel</Button> : null}</div></form>;
}

function DemoCodesManager() {
  useDemoState(); const settings = demoOrdering.getDemoCardOrderAdminSettings(); const [selectedId, setSelectedId] = useState(""); const [cursor, setCursor] = useState<string | null>(null); const [usage, setUsage] = useState<Usage[]>([]); const [loadedMore, setLoadedMore] = useState(false); const [hasMore, setHasMore] = useState(false);
  const firstPage = selectedId ? demoOrdering.getDemoCardOrderReferralCodeUsage(selectedId, { numItems: pageSize, cursor: null }) : null;
  const codes: Code[] = settings.referralCodes.map((row: any) => ({ id: row.id, code: row.code, referrerCode: row.referrerCode, referrerLabel: row.referrerLabel, active: row.active, offer: row.offer && { id: row.offer.id, code: row.offer.code, fixedPriceCentavos: row.offer.fixedPriceCentavos, usageCount: row.offer.usageCount, usageLimit: row.offer.usageLimit } }));
  const offers = [...new Map(codes.flatMap((code) => code.offer ? [[code.offer.id, code.offer] as const] : [])).values()];
  const saveOffer = (demoOrdering as any).saveDemoCardOrderOffer as (input: OfferInput) => Promise<string>;
  const saveAlias = (demoOrdering as any).saveDemoCardOrderReferralCode as (input: AliasInput) => Promise<string>;
  function select(id: string) { setSelectedId(id); setCursor(null); setUsage([]); setLoadedMore(false); setHasMore(false); }
  return <CodesWorkspace codes={codes} offers={offers} selectedId={selectedId} onSelect={select} usage={[...(firstPage?.page ?? []), ...usage]} usageCodeId={selectedId} hasMore={loadedMore ? hasMore : Boolean(firstPage && !firstPage.isDone)} loading={false} loadMore={() => { const result = demoOrdering.getDemoCardOrderReferralCodeUsage(selectedId, { numItems: pageSize, cursor: cursor ?? firstPage?.continueCursor ?? null }); setUsage((old) => [...old, ...result.page]); setLoadedMore(true); setHasMore(!result.isDone); setCursor(result.continueCursor || null); }} onSaveOffer={async (input) => { await saveOffer(input); }} onSaveAlias={async (input) => { select(await saveAlias(input)); }} onSetActive={async (id, value) => { await demoOrdering.setDemoCardOrderReferralCodeActive(id, value); }} />;
}

function LiveCodesManager() {
  const result = useQuery(api.cardOrderSettings.adminReferralCodes, {}); const backfill = useMutation(api.cardOrderSettings.startReferralUsageBackfill); const saveAlias = useMutation(api.cardOrderSettings.saveReferralCode); const saveOffer = useMutation((api.cardOrderSettings as any).saveCardOrderOffer); const deactivate = useMutation(api.cardOrderSettings.deactivateReferralCode); const activate = useMutation(api.cardOrderSettings.activateReferralCode);
  const [selectedId, setSelectedId] = useState<Id<"cardOrderReferralCodes"> | null>(null); const started = useRef(false);
  useEffect(() => { if (!started.current) { started.current = true; void backfill({}); } }, [backfill]);
  const page = usePaginatedQuery(api.cardOrderSettings.adminReferralCodeUsage, selectedId ? { codeId: selectedId } : "skip", { initialNumItems: pageSize });
  const codes: Code[] = ((result ?? []) as any[]).map(({ _id, offer, ...row }) => ({ id: _id, ...row, ...(offer ? { offer: { id: offer._id, ...offer } } : {}) })); const offers = [...new Map(codes.flatMap((code) => code.offer ? [[code.offer.id, code.offer] as const] : [])).values()];
  return result === undefined ? <div className="pt-2"><Notice>Loading referral codes…</Notice></div> : <CodesWorkspace codes={codes} offers={offers} selectedId={selectedId ?? ""} onSelect={(id) => setSelectedId(id as Id<"cardOrderReferralCodes">)} usage={(page.results ?? []) as Usage[]} usageCodeId={page.status === "LoadingFirstPage" ? "" : selectedId ?? ""} hasMore={page.status === "CanLoadMore"} loading={page.status === "LoadingFirstPage" || page.status === "LoadingMore"} loadMore={() => page.loadMore(pageSize)} onSaveOffer={async (input) => { await (saveOffer as any)({ ...(input.id ? { id: input.id } : {}), code: input.code, fixedPriceCentavos: input.fixedPriceCentavos, usageLimit: input.usageLimit }); }} onSaveAlias={async (input) => { const id = await (saveAlias as any)({ ...(input.id ? { id: input.id as Id<"cardOrderReferralCodes"> } : {}), code: input.code, offerId: input.offerId, referrerCode: input.referrerCode, referrerLabel: input.referrerLabel, active: input.active }); setSelectedId(id as Id<"cardOrderReferralCodes">); }} onSetActive={async (id, value) => { await (value ? activate : deactivate)({ id: id as Id<"cardOrderReferralCodes"> }); }} />;
}
