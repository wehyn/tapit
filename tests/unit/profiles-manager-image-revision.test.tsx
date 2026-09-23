import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mutation = vi.hoisted(() => vi.fn().mockResolvedValue({ imageRevision: 7 }));

vi.mock("@/lib/demo/mode", () => ({ isLocalDemoMode: () => false }));
vi.mock("convex/react", () => ({
  useMutation: () => mutation,
  useQuery: () => [
    {
      _id: "profile-1",
      _creationTime: 1,
      ownerId: "customer-1",
      status: "draft",
      imageRevision: 7,
      draft: { name: "Mara Velasquez", slug: "mara-velasquez", links: [] },
      createdAt: 1,
      updatedAt: 1,
    },
  ],
}));

import { ProfilesManager } from "@/components/admin/ProfilesManager";

beforeEach(() => mutation.mockClear());

it("saves an administrative draft against the image revision shown", async () => {
  render(<ProfilesManager />);
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Mara New" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save admin draft" }));
  await screen.findByText("Administrative draft changes saved.");
  expect(mutation).toHaveBeenCalledWith(
    expect.objectContaining({ profileId: "profile-1", expectedImageRevision: 7 }),
  );
});

it("publishes an administrative draft against the image revision shown", async () => {
  render(<ProfilesManager />);
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await screen.findByText("Profile published.");
  expect(mutation).toHaveBeenCalledWith({
    profileId: "profile-1",
    expectedImageRevision: 7,
  });
});
