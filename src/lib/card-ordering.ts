export const CARD_LAUNCH_PRICE_CENTAVOS = 59_900;
export const CARD_REGULAR_PRICE_CENTAVOS = 79_900;
export const CARD_LOWEST_PRICE_CENTAVOS = CARD_LAUNCH_PRICE_CENTAVOS;
export const REFERRAL_PERCENT = 10;
export const COMMISSION_PERCENT = 10;

export type CardOrderLaunchEndDate = string;

const launchDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const manilaDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parseLaunchEndDate(value: string): [year: number, month: number, day: number] | null {
  const match = launchDatePattern.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return [year, month, day];
}

export function isCardOrderLaunchEndDate(value: unknown): value is CardOrderLaunchEndDate {
  return typeof value === "string" && parseLaunchEndDate(value) !== null;
}

/** Convert an admin YYYY-MM-DD date to midnight in Asia/Manila. */
export function manilaStartOfDayTimestamp(date: string): number | null {
  const parts = parseLaunchEndDate(date);
  if (parts === null) return null;

  const [year, month, day] = parts;
  const targetWallTimeAsUtc = Date.UTC(year, month - 1, day);
  let timestamp = targetWallTimeAsUtc;

  // Resolve the requested Manila wall time through Intl so the boundary is
  // based on Asia/Manila even when this code runs in another local timezone.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const formattedParts = Object.fromEntries(
      manilaDateTimeFormatter
        .formatToParts(new Date(timestamp))
        .map(({ type, value }) => [type, value]),
    );
    const manilaWallTimeAsUtc = Date.UTC(
      Number(formattedParts.year),
      Number(formattedParts.month) - 1,
      Number(formattedParts.day),
      Number(formattedParts.hour),
      Number(formattedParts.minute),
      Number(formattedParts.second),
    );
    const adjustedTimestamp = timestamp + targetWallTimeAsUtc - manilaWallTimeAsUtc;
    if (adjustedTimestamp === timestamp) return timestamp;
    timestamp = adjustedTimestamp;
  }

  return timestamp;
}

export function getCardPriceCentavos(
  launchEndDate: CardOrderLaunchEndDate | null,
  now = Date.now(),
): number {
  const launchEndAt = launchEndDate === null ? null : manilaStartOfDayTimestamp(launchEndDate);
  return launchEndAt !== null && now < launchEndAt
    ? CARD_LAUNCH_PRICE_CENTAVOS
    : CARD_REGULAR_PRICE_CENTAVOS;
}

export function percentageCentavos(amountCentavos: number, percent: number): number {
  if (!Number.isSafeInteger(amountCentavos) || amountCentavos < 0) {
    throw new RangeError("amountCentavos must be a non-negative safe integer.");
  }
  if (!Number.isFinite(percent) || percent < 0) {
    throw new RangeError("percent must be a non-negative finite number.");
  }

  const roundedCentavos = Math.round((amountCentavos * percent) / 100);
  if (!Number.isSafeInteger(roundedCentavos)) {
    throw new RangeError("The percentage amount is outside the safe integer range.");
  }
  return roundedCentavos;
}

export function calculateReferralDiscountCentavos(cardPriceCentavos: number): number {
  return percentageCentavos(cardPriceCentavos, REFERRAL_PERCENT);
}

export function isValidReferralFixedPriceCentavos(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= CARD_LOWEST_PRICE_CENTAVOS
  );
}

export function calculateReferralDiscountForPriceCentavos(
  cardPriceCentavos: number,
  fixedPriceCentavos?: number,
): number {
  if (fixedPriceCentavos === undefined) return calculateReferralDiscountCentavos(cardPriceCentavos);
  if (!isValidReferralFixedPriceCentavos(fixedPriceCentavos)) {
    throw new RangeError(
      "fixedPriceCentavos must be a positive safe integer no greater than the lowest card price.",
    );
  }
  if (!Number.isSafeInteger(cardPriceCentavos) || cardPriceCentavos < fixedPriceCentavos) {
    throw new RangeError("fixedPriceCentavos cannot exceed the card price.");
  }
  return cardPriceCentavos - fixedPriceCentavos;
}

export function calculateCommissionCentavos(cardPriceCentavos: number): number {
  return percentageCentavos(cardPriceCentavos, COMMISSION_PERCENT);
}

export type Centavos = number & { readonly __brand: "Centavos" };

export type CardOrderPrice = Readonly<{
  cardPriceCentavos: number;
  discountCentavos: number;
}>;

export type CardOrderPlacementResult =
  | Readonly<{ kind: "created"; orderId: string }>
  | Readonly<{ kind: "price_changed"; price: CardOrderPrice }>;

export function cardOrderAmountCentavos(price: CardOrderPrice): Centavos {
  return (price.cardPriceCentavos - price.discountCentavos) as Centavos;
}
