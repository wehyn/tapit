import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountId: "customer-1",
  preview: undefined as
    | undefined
    | {
        promoValid: boolean;
        referralValid: boolean;
        promoAdjustedPriceCentavos: number;
        discountCentavos: number;
      },
  place: vi.fn(),
}));

vi.mock("@/lib/demo/mode", () => ({ isLocalDemoMode: () => false }));
vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useAuthToken: () => "token",
}));
vi.mock("convex/react", () => ({
  useMutation: () => mocks.place,
  useQuery: (ref: unknown) => {
    switch (getFunctionName(ref as never)) {
      case "admin:currentAccess":
        return {
          authenticated: true,
          accountStatus: "active",
          role: "customer",
          accountId: mocks.accountId,
        };
      case "cardOrderSettings:customerSettings":
        return {
          paymentMethods: [
            {
              _id: "method-1",
              provider: "Bank",
              label: "Main",
              accountDetails: "123",
              instructions: "Pay",
              qrUrl: null,
            },
          ],
        };
      case "cardOrderSettings:previewOrderCodes":
        return mocks.preview;
      case "cardOrders:myOrders":
        return [];
      default:
        return undefined;
    }
  },
}));

import { OrderCardExperience } from "@/components/card-order/OrderCardExperience";

// A referral alone discounts the ₱799 regular price to ₱719.10.
const DISCOUNTED_AMOUNT = "₱719.10 + shipping";

function fillUrlDesigns() {
  fireEvent.change(screen.getByLabelText("Delivery name"), { target: { value: "Mara Santos" } });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "09170000000" } });
  fireEvent.change(screen.getByLabelText("Delivery address"), {
    target: { value: "1 Test Street" },
  });
  fireEvent.click(screen.getByRole("radio", { name: /Use a design link/ }));
  fireEvent.change(screen.getByLabelText("Front design URL"), {
    target: { value: "https://example.test/front.png" },
  });
  fireEvent.click(screen.getByRole("button", { name: "back" }));
  fireEvent.click(screen.getByRole("radio", { name: /Use a design link/ }));
  fireEvent.change(screen.getByLabelText("Back design URL"), {
    target: { value: "https://example.test/back.png" },
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountId = "customer-1";
  mocks.preview = undefined;
  mocks.place.mockResolvedValue({ kind: "created", orderId: "order-live-1" });
});

describe("live card order price confirmation", () => {
  it("disables submit while the referral preview is pending, then submits the resolved amount", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OrderCardExperience />);
    fillUrlDesigns();
    await user.click(screen.getByRole("switch", { name: "Have a referral code?" }));
    await user.type(screen.getByLabelText("Referral code"), "AHRON");

    // The query has no result for this code and time yet.
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Place order" }).closest("form")!);
    expect(mocks.place).not.toHaveBeenCalled();

    mocks.preview = {
      promoValid: true,
      referralValid: true,
      promoAdjustedPriceCentavos: 79_900,
      discountCentavos: 7_990,
    };
    rerender(<OrderCardExperience />);
    await settle();

    expect(screen.getByText(DISCOUNTED_AMOUNT)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Place order" });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(mocks.place).toHaveBeenCalledWith(
      expect.objectContaining({
        referralCode: "AHRON",
        expectedCardAmountCentavos: 71_910,
      }),
    );
  });

  it("places no order when the account changes during an awaited URL-only submit", async () => {
    const { rerender } = render(<OrderCardExperience />);
    fillUrlDesigns();

    fireEvent.submit(screen.getByRole("button", { name: "Place order" }).closest("form")!);
    act(() => {
      mocks.accountId = "customer-2";
      rerender(<OrderCardExperience />);
    });
    await settle();

    expect(mocks.place).not.toHaveBeenCalled();
  });
});
