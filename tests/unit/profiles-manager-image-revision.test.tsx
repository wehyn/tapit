import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => {
  const profile1 = {
    _id: "profile-1",
    _creationTime: 1,
    ownerId: "customer-1",
    slug: "mara-velasquez",
    status: "draft",
    imageRevision: 7,
    mediaRevision: 11,
    draft: { name: "Mara Velasquez", slug: "mara-velasquez", links: [] },
    createdAt: 1,
    updatedAt: 1,
  };
  const profile2 = {
    ...profile1,
    _id: "profile-2",
    slug: "nora-silang",
    draft: { name: "Nora Silang", slug: "nora-silang", links: [] },
  };
  return {
    profile1,
    profile2,
    mutation: vi.fn().mockResolvedValue({
      updatedAt: 2,
      imageRevision: 7,
      mediaRevision: 11,
      draftRevision: 0,
    }),
    query: vi.fn().mockImplementation((_query: unknown, args: { profileId: string }) =>
      Promise.resolve({
        profile: args.profileId === "profile-2" ? profile2 : profile1,
        customerEmail: "mara@example.test",
        assignedCardCount: 0,
        assignedCardCountIsCapped: false,
      }),
    ),
  };
});

vi.mock("@/lib/demo/mode", () => ({ isLocalDemoMode: () => false }));
vi.mock("convex/react", () => ({
  useConvex: () => ({ query: mocks.query }),
  useMutation: () => mocks.mutation,
  usePaginatedQuery: () => ({
    results: [mocks.profile1, mocks.profile2],
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
}));

import { ProfilesManager } from "@/components/admin/ProfilesManager";

beforeEach(() => mocks.mutation.mockClear());
afterEach(() => vi.restoreAllMocks());

it("saves an administrative draft against the image revision shown", async () => {
  render(<ProfilesManager />);
  fireEvent.click(screen.getByRole("button", { name: /Mara Velasquez \/mara-velasquez/ }));
  await screen.findByRole("textbox", { name: "Name" });
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Mara New" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save admin draft" }));
  await screen.findByText("Administrative draft changes saved.");
  expect(mocks.mutation).toHaveBeenCalledWith(
    expect.objectContaining({
      profileId: "profile-1",
      expectedDraftRevision: 0,
      expectedImageRevision: 7,
      expectedMediaRevision: 11,
    }),
  );
});

it("publishes an administrative draft against the image revision shown", async () => {
  render(<ProfilesManager />);
  fireEvent.click(screen.getByRole("button", { name: /Mara Velasquez \/mara-velasquez/ }));
  await screen.findByRole("textbox", { name: "Name" });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await screen.findByText("Profile published.");
  expect(mocks.mutation).toHaveBeenCalledWith({
    profileId: "profile-1",
    expectedImageRevision: 7,
    expectedMediaRevision: 11,
  });
});

it("asks before closing a dirty admin profile dialog", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<ProfilesManager />);
  fireEvent.click(screen.getByRole("button", { name: /Mara Velasquez \/mara-velasquez/ }));
  const name = await screen.findByRole("textbox", { name: "Name" });
  fireEvent.change(name, { target: { value: "Mara Unsaved" } });
  fireEvent.click(screen.getByRole("button", { name: "Close profile details" }));

  expect(confirm).toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Mara Unsaved");
});

it("asks before switching profiles when the current admin draft is dirty", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<ProfilesManager />);
  fireEvent.click(screen.getByRole("button", { name: /Mara Velasquez \/mara-velasquez/ }));
  const name = await screen.findByRole("textbox", { name: "Name" });
  fireEvent.change(name, { target: { value: "Mara Unsaved" } });
  fireEvent.click(screen.getByRole("button", { name: /Nora Silang \/nora-silang/ }));

  expect(confirm).toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Mara Unsaved");

  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: /Nora Silang \/nora-silang/ }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Nora Silang"),
  );
});
