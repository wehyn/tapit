import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mutation = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ updatedAt: 2, draftRevision: 1, imageRevision: 4 }),
);
const authToken = vi.hoisted(() => vi.fn(() => "test-token"));
const fetchMock = vi.hoisted(() => vi.fn());
const useUncustomizedProfile = vi.hoisted(() => ({ current: false }));

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
    mediaRevision: 3,
    draft: {
      name: "Mara Velasquez",
      slug: "mara-velasquez",
      customization: useUncustomizedProfile.current
        ? undefined
        : {
            preset: "warm-studio",
            accent: "coral",
            typeScale: "comfortable",
            linkTreatment: "filled",
            contentOrder: "links-first",
          },
      imageStorageId: "storage-old",
      imageUrl: "https://image.test/old",
      media: {
        heroHeight: 320,
        autoplay: true,
        background: {
          assetId: "media-old",
          altText: "Existing backdrop",
          positionX: 50,
          positionY: 50,
        },
        slideshow: [],
      },
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
  useUncustomizedProfile.current = false;
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://preview-123.convex.cloud");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://preview-123.convex.site");
  mutation.mockClear();
  fetchMock.mockReset().mockResolvedValue(
    new Response(
      JSON.stringify({
        storageId: "storage-1",
        imageUrl: "https://image.test/1",
        imageRevision: 4,
        draftRevision: 1,
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
        "X-Draft-Revision": "0",
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

it("uploads live profile media with the media revision and strips URLs before saving", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        assetId: "media-1",
        url: "https://image.test/media-1",
        previewUrl: "https://image.test/media-1-preview",
        mediaRevision: 4,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  render(<ProfileEditor view="customize" />);

  fireEvent.click(screen.getByRole("tab", { name: "Media" }));
  fireEvent.change(screen.getByLabelText("Upload background image"), {
    target: { files: [new File(["background"], "background.png", { type: "image/png" })] },
  });
  const altField = await screen.findByLabelText("Background image description");
  fireEvent.change(altField, { target: { value: "Studio backdrop" } });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith(
    "https://preview-123.convex.site/profile-media-upload",
    expect.objectContaining({
      method: "POST",
      body: expect.any(File),
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "image/png",
        "X-Media-Revision": "3",
        "X-Profile-Id": "profile-1",
      },
    }),
  );

  await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mutation).toHaveBeenCalled());
  expect(mutation).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expectedDraftRevision: 0,
      expectedImageRevision: 3,
      expectedMediaRevision: 4,
      profileId: "profile-1",
      draft: expect.objectContaining({
        media: {
          heroHeight: 320,
          autoplay: true,
          background: {
            assetId: "media-1",
            altText: "Studio backdrop",
            positionX: 50,
            positionY: 50,
          },
          slideshow: [],
        },
      }),
    }),
  );
  const savedDraft = mutation.mock.calls.at(-1)?.[0].draft;
  expect(JSON.stringify(savedDraft)).not.toContain("image.test/media-1");
});

it("serializes live slideshow uploads and saves the latest media revision", async () => {
  useUncustomizedProfile.current = true;
  const resolveUploads: Array<(response: Response) => void> = [];
  fetchMock.mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        resolveUploads.push(resolve);
      }),
  );
  render(<ProfileEditor view="customize" />);

  fireEvent.click(screen.getByRole("tab", { name: "Slideshow" }));
  const slideshowInput = screen.getByLabelText("Upload slideshow images");
  fireEvent.change(slideshowInput, {
    target: { files: [new File(["first"], "first.png", { type: "image/png" })] },
  });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

  fireEvent.change(slideshowInput, {
    target: { files: [new File(["second"], "second.png", { type: "image/png" })] },
  });
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Remove slideshow upload second.png" })).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
  fireEvent.click(screen.getByLabelText("Moss"));
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  fireEvent.click(screen.getByRole("tab", { name: "Slideshow" }));
  expect(screen.getByText("Uploading", { exact: true })).toBeVisible();
  expect(screen.getByText("Waiting", { exact: true })).toBeVisible();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect((fetchMock.mock.calls[0]?.[1] as RequestInit).body).toBeInstanceOf(File);
  expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).body as File).name).toBe("first.png");

  const resolveFirstUpload = resolveUploads[0];
  if (!resolveFirstUpload) throw new Error("Expected the first deferred upload request.");
  resolveFirstUpload(
    new Response(
      JSON.stringify({
        assetId: "media-1",
        url: "https://image.test/media-1",
        previewUrl: "https://image.test/media-1-preview",
        mediaRevision: 4,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBeInstanceOf(File);
  expect(((fetchMock.mock.calls[1]?.[1] as RequestInit).body as File).name).toBe("second.png");
  expect(fetchMock.mock.calls[1]?.[1]).toEqual(
    expect.objectContaining({
      headers: expect.objectContaining({ "X-Media-Revision": "4" }),
    }),
  );

  const resolveSecondUpload = resolveUploads[1];
  if (!resolveSecondUpload) throw new Error("Expected the second deferred upload request.");
  const saveDraftButton = screen.getByRole("button", { name: "Save draft" });
  expect(saveDraftButton).toBeDisabled();
  let showedSecondSlideWhenSaveEnabled = false;
  const saveWhenEnabled = new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (saveDraftButton.hasAttribute("disabled")) return;
      observer.disconnect();
      showedSecondSlideWhenSaveEnabled = screen.queryByText("Image 2 of 2") !== null;
      fireEvent.click(saveDraftButton);
      resolve();
    });
    observer.observe(saveDraftButton, { attributes: true, attributeFilter: ["disabled"] });
  });
  resolveSecondUpload(
    new Response(
      JSON.stringify({
        assetId: "media-2",
        url: "https://image.test/media-2",
        previewUrl: "https://image.test/media-2-preview",
        mediaRevision: 5,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  await saveWhenEnabled;
  expect(showedSecondSlideWhenSaveEnabled).toBe(true);

  await waitFor(() => expect(mutation).toHaveBeenCalled());
  expect(mutation).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expectedMediaRevision: 5,
      draft: expect.objectContaining({
        media: expect.objectContaining({
          slideshow: [
            expect.objectContaining({ assetId: "media-1" }),
            expect.objectContaining({ assetId: "media-2" }),
          ],
        }),
      }),
    }),
  );
});

it("keeps existing media after a failed upload", async () => {
  fetchMock.mockResolvedValueOnce(new Response("Temporary media failure", { status: 503 }));
  render(<ProfileEditor view="customize" />);

  fireEvent.click(screen.getByRole("tab", { name: "Media" }));
  fireEvent.change(screen.getByLabelText("Upload background image"), {
    target: { files: [new File(["background"], "background.png", { type: "image/png" })] },
  });

  expect(await screen.findByRole("alert")).toHaveTextContent("Temporary media failure");
  expect(screen.getByLabelText("Background image description")).toHaveValue("Existing backdrop");
});

it("revokes a failed background preview when replacing it but keeps the active preview", async () => {
  const createObjectUrl = vi
    .spyOn(URL, "createObjectURL")
    .mockReturnValueOnce("blob:failed-background")
    .mockReturnValueOnce("blob:active-background");
  const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  fetchMock
    .mockResolvedValueOnce(new Response("Temporary media failure", { status: 503 }))
    .mockImplementationOnce(() => new Promise<Response>(() => undefined));
  const { unmount } = render(<ProfileEditor view="customize" />);

  fireEvent.click(screen.getByRole("tab", { name: "Media" }));
  const backgroundInput = screen.getByLabelText("Upload background image");
  fireEvent.change(backgroundInput, {
    target: { files: [new File(["failed"], "failed-background.png", { type: "image/png" })] },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("Temporary media failure");

  fireEvent.change(backgroundInput, {
    target: {
      files: [new File(["replacement"], "replacement-background.png", { type: "image/png" })],
    },
  });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(createObjectUrl).toHaveBeenCalledTimes(2);
  expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:failed-background");
  expect(revokeObjectUrl).not.toHaveBeenCalledWith("blob:active-background");

  unmount();
  expect(revokeObjectUrl).toHaveBeenCalledWith("blob:active-background");
  createObjectUrl.mockRestore();
  revokeObjectUrl.mockRestore();
});

it("passes the current media revision when publishing", async () => {
  render(<ProfileEditor />);

  fireEvent.click(screen.getByRole("button", { name: "Publish" }));

  await waitFor(() => expect(mutation).toHaveBeenCalled());
  expect(mutation).toHaveBeenLastCalledWith({
    expectedImageRevision: 3,
    expectedMediaRevision: 3,
    profileId: "profile-1",
  });
});

it("sends an explicit media null when the existing background is removed", async () => {
  render(<ProfileEditor view="customize" />);

  fireEvent.click(screen.getByRole("tab", { name: "Media" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove background" }));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

  await waitFor(() => expect(mutation).toHaveBeenCalled());
  expect(mutation).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expectedMediaRevision: 3,
      draft: expect.objectContaining({ media: null }),
    }),
  );
});

it("disables publish while live media processing is pending", async () => {
  let resolveUpload: (response: Response) => void = () => undefined;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        resolveUpload = resolve;
      }),
  );
  render(<ProfileEditor view="customize" />);

  fireEvent.click(screen.getByRole("tab", { name: "Media" }));
  fireEvent.change(screen.getByLabelText("Upload background image"), {
    target: { files: [new File(["background"], "background.png", { type: "image/png" })] },
  });

  await waitFor(() => expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled());
  resolveUpload(
    new Response(
      JSON.stringify({
        assetId: "media-pending",
        url: "https://image.test/media-pending",
        previewUrl: "https://image.test/media-pending-preview",
        mediaRevision: 4,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  const altField = await screen.findByLabelText("Background image description");
  fireEvent.change(altField, { target: { value: "Pending backdrop" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled());
});
