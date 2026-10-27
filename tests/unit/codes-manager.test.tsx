import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const convexHooks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return { ...actual, ...convexHooks };
});

import { CodesManager } from "@/components/admin/CodesManager";

const saveReferralCode = vi.fn();

function functionName(reference: unknown): string {
  if (reference === null || (typeof reference !== "object" && typeof reference !== "function"))
    return "";
  const name = Reflect.get(reference, Symbol.for("functionName"));
  return typeof name === "string" ? name : "";
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");
  saveReferralCode.mockReset().mockResolvedValue("codes:updated");
  convexHooks.useMutation.mockImplementation((mutation: unknown) => {
    return functionName(mutation) === "cardOrderSettings:saveReferralCode"
      ? saveReferralCode
      : vi.fn().mockResolvedValue(undefined);
  });
  convexHooks.useQuery.mockImplementation((query: unknown) =>
    functionName(query) === "cardOrderSettings:adminReferralCodes"
      ? [
          {
            _id: "codes:a",
            code: "CODE_A",
            referrerLabel: "Referrer A",
            active: true,
            usageCount: 0,
          },
          {
            _id: "codes:b",
            code: "CODE_B",
            referrerLabel: "Referrer B",
            active: true,
            usageCount: 0,
          },
        ]
      : undefined,
  );
  convexHooks.usePaginatedQuery.mockReturnValue({
    results: [],
    status: "Exhausted",
    loadMore: vi.fn(),
  });
});

describe("referral code editor", () => {
  it("blocks starting or changing another draft while a save is pending", async () => {
    const user = userEvent.setup();
    let resolveSave!: (id: string) => void;
    saveReferralCode.mockImplementation(
      () => new Promise<string>((resolve) => (resolveSave = resolve)),
    );
    render(<CodesManager />);

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    await user.clear(screen.getByLabelText("Referrer label"));
    await user.type(screen.getByLabelText("Referrer label"), "Updated A");
    await user.click(screen.getByRole("button", { name: "Save code" }));

    expect(screen.getByLabelText("Referral code")).toBeDisabled();
    expect(screen.getByLabelText("Referrer label")).toBeDisabled();
    expect(screen.getByLabelText("Fixed card price (₱, optional)")).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Active" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Edit" })[1]!).toBeDisabled();

    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    await user.type(screen.getByLabelText("Referrer label"), " B");
    expect(screen.getByLabelText("Referrer label")).toHaveValue("Updated A");
    expect(saveReferralCode).toHaveBeenCalledTimes(1);

    resolveSave("codes:a");
    await waitFor(() => expect(screen.getByLabelText("Referral code")).toHaveValue(""));
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    expect(screen.getByLabelText("Referral code")).toHaveValue("CODE_B");
    expect(screen.getByLabelText("Referrer label")).toHaveValue("Referrer B");
  });
});
