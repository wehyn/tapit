import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mutation = vi.hoisted(() => vi.fn().mockResolvedValue({ updatedAt: 2, imageRevision: 4 }));
const authToken = vi.hoisted(() => vi.fn(() => "test-token"));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/demo/mode", () => ({ isLocalDemoMode: () => false }));
vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useMutation: () => mutation,
  useQuery: () => ({
    _id: "profile-1",
    _creationTime: 1,
    ownerId: "customer-1",
    scope: "default",
    status: "draft",
    imageRevision: 3,
    draft: {
      name: "Mara Velasquez",
      slug: "mara-velasquez",
      imageStorageId: "storage-old",
      imageUrl: "https://image.test/old",
      links: [
        {
          id: "site",
          label: "Site",
          destination: "https://example.com",
          enabled: true,
          icon: "link",
        },
      ],
    },
    updatedAt: 1,
  }),
}));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: authToken }));
vi.mock("@/lib/profile-image", async () => {
  const actual = await vi.importActual<typeof import("@/lib/profile-image")>("@/lib/profile-image");
  return {
    ...actual,
    prepareProfileImageCrop: vi.fn().mockResolvedValue({
      blob: new Blob(["cropped"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
      width: 384,
    }),
  };
});
vi.mock("@/components/forms/ProfileImageCropDialog", () => ({
  ProfileImageCropDialog: ({
    onApply,
    onCancel,
  }: {
    onApply: (crop: { x: number; y: number; size: number }) => void;
    onCancel: () => void;
  }) => (
    <div role="dialog">
      <button onClick={() => onApply({ x: 0, y: 0, size: 100 })} type="button">
        Apply crop
      </button>
      <button onClick={onCancel} type="button">
        Cancel
      </button>
    </div>
  ),
}));

import { ProfileEditor } from "@/components/forms/ProfileEditor";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://preview-123.convex.cloud");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://preview-123.convex.site");
  mutation.mockClear();
  fetchMock.mockReset().mockResolvedValue(
    new Response(
      JSON.stringify({
        storageId: "storage-1",
        imageUrl: "https://image.test/1",
        imageRevision: 4,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

it("uploads the selected crop in one authenticated request with the image revision", async () => {
  render(<ProfileEditor />);
  const file = new File(["source"], "profile.jpg", { type: "image/jpeg" });

  fireEvent.change(screen.getByLabelText("Profile photo or logo"), { target: { files: [file] } });
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith(
    "https://preview-123.convex.site/profile-image-upload",
    expect.objectContaining({
      method: "POST",
      body: expect.any(Blob),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "image/jpeg",
        "X-Image-Revision": "3",
        "X-Profile-Id": "profile-1",
      },
    }),
  );
  expect(mutation).not.toHaveBeenCalled();
});

it("keeps the existing image when the upload fails", async () => {
  fetchMock.mockResolvedValueOnce(new Response("Temporary upload failure", { status: 503 }));
  render(<ProfileEditor />);
  for (const image of screen.getAllByRole("img", { name: "Mara Velasquez profile" }))
    expect(image).toHaveAttribute("src", "https://image.test/old");

  fireEvent.change(screen.getByLabelText("Profile photo or logo"), {
    target: { files: [new File(["source"], "profile.jpg", { type: "image/jpeg" })] },
  });
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Apply crop" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Temporary upload failure");
  for (const image of screen.getAllByRole("img", { name: "Mara Velasquez profile" }))
    expect(image).toHaveAttribute("src", "https://image.test/old");
  expect(screen.getByRole("dialog")).toBeVisible();
});
