import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const useConvexAuth = vi.fn();
const useQuery = vi.fn();
const useDemoSession = vi.fn();
const isLocalDemoMode = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/build-card",
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => useConvexAuth(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

vi.mock("@/lib/demo/mode", () => ({
  isLocalDemoMode: () => isLocalDemoMode(),
}));

vi.mock("@/lib/demo/store", () => ({
  useDemoSession: () => useDemoSession(),
}));

import {
  BuildCardExperience,
  BuildCardWorkspace,
  BUILD_CARD_CANVA_URL,
} from "@/components/card-builder/BuildCardExperience";

function renderWorkspace(props: Partial<React.ComponentProps<typeof BuildCardWorkspace>> = {}) {
  return render(<BuildCardWorkspace authLoading={false} isAuthenticated={false} {...props} />);
}

function makeFile(name: string, type: string, size = 2048) {
  return new File([new Uint8Array(size)], name, { type });
}

describe("BuildCardWorkspace", () => {
  beforeEach(() => {
    push.mockReset();
    useConvexAuth.mockReset();
    useQuery.mockReset();
    useDemoSession.mockReset();
    useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    useQuery.mockReturnValue(undefined);
    useDemoSession.mockReturnValue(null);
    isLocalDemoMode.mockReturnValue(false);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:card-design"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the chooser content and Canva action", () => {
    renderWorkspace();

    expect(screen.getByText("Coming soon")).toHaveClass(
      "rounded-full",
      "bg-tapit-accent",
      "px-4",
      "py-2",
      "text-white",
    );
    expect(screen.getByRole("heading", { name: "Bring your card to life" })).toBeVisible();
    expect(screen.getByText(/Start with a template in Canva/)).toHaveClass(
      "mx-auto",
      "text-center",
    );
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    expect(screen.getByRole("banner")).toHaveClass("sticky", "top-0", "z-40");
    expect(screen.getByRole("link", { name: "Product" })).toHaveAttribute("href", "/#product");
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "/#how-it-works",
    );
    expect(screen.getByRole("link", { name: "Build card" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Build your own with Canva" })).toHaveAttribute(
      "href",
      BUILD_CARD_CANVA_URL,
    );
    expect(screen.getByRole("link", { name: "Build your own with Canva" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "Build your own with Canva" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByText("Already got your design?")).toBeVisible();
    const input = screen.getByLabelText("Upload your design");
    const canvaAction = screen.getByRole("link", { name: "Build your own with Canva" });
    const uploadAction = input.closest("label");
    expect(input).toBeVisible();
    expect(canvaAction).toHaveClass("items-center", "justify-center", "text-center");
    expect(uploadAction).toHaveClass("items-center", "justify-center", "text-center");
    expect(canvaAction.querySelector("svg")).not.toBeNull();
    expect(uploadAction?.querySelector("svg")).not.toBeNull();
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("Already got your design?").closest("label")).toHaveClass(
      "focus-within:ring-2",
      "focus-within:ring-tapit-focus",
    );
  });

  it.each([
    ["design.pdf", "application/pdf"],
    ["design.webp", "image/webp"],
  ])("rejects unsupported %s files without opening the dialog", (name, type) => {
    renderWorkspace();

    fireEvent.change(screen.getByLabelText("Upload your design"), {
      target: { files: [makeFile(name, type)] },
    });

    const input = screen.getByLabelText("Upload your design");
    expect(screen.getByRole("alert")).toHaveTextContent("Upload a PNG or JPG image.");
    expect(input).toHaveAttribute("aria-describedby", "card-design-upload-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert").parentElement).toHaveAttribute(
      "id",
      "card-design-upload-error",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["design.jpg", "image/jpeg"],
    ["design.png", "image/png"],
  ])("opens the dialog for a valid %s file", async (name, type) => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.upload(screen.getByLabelText("Upload your design"), makeFile(name, type));

    expect(screen.getByRole("dialog", { name: "Looks good?" })).toBeVisible();
    expect(screen.getByRole("img", { name: `Preview of ${name}` })).toHaveAttribute(
      "src",
      "blob:card-design",
    );
  });

  it("clears the preview and revokes the object URL when choosing another design", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const input = screen.getByLabelText("Upload your design");

    await user.upload(input, makeFile("design.png", "image/png"));
    await user.click(screen.getByRole("button", { name: "Choose another design" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:card-design");
    expect(input).toHaveValue("");
  });

  it("revokes the previous URL exactly once when replacing a valid design", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.mocked(URL.createObjectURL);
    createObjectURL.mockReset();
    createObjectURL.mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    renderWorkspace();
    const input = screen.getByLabelText("Upload your design");

    await user.upload(input, makeFile("first.png", "image/png"));
    await user.upload(input, makeFile("second.png", "image/png"));

    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:first");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes the current URL exactly once when replacing it with an invalid file", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const input = screen.getByLabelText("Upload your design");

    await user.upload(input, makeFile("design.png", "image/png"));
    fireEvent.change(input, { target: { files: [makeFile("design.pdf", "application/pdf")] } });

    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:card-design");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes the current URL exactly once when closing the dialog", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const input = screen.getByLabelText("Upload your design");

    await user.upload(input, makeFile("design.png", "image/png"));
    await user.click(screen.getByRole("button", { name: "Close card preview" }));

    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:card-design");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes the current URL exactly once when unmounting", async () => {
    const user = userEvent.setup();
    const view = renderWorkspace();

    await user.upload(
      screen.getByLabelText("Upload your design"),
      makeFile("design.png", "image/png"),
    );
    view.unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:card-design");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe("BuildCardExperience auth-aware order action", () => {
  beforeEach(() => {
    push.mockReset();
    useConvexAuth.mockReset();
    useQuery.mockReset();
    useDemoSession.mockReset();
    isLocalDemoMode.mockReturnValue(false);
    useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    useQuery.mockReturnValue(undefined);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:card-design"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openPreview() {
    const user = userEvent.setup();
    render(<BuildCardExperience />);
    await user.upload(
      screen.getByLabelText("Upload your design"),
      makeFile("design.png", "image/png"),
    );
    return user;
  }

  it("pushes the exact login return URL when logged out", async () => {
    const user = await openPreview();

    await user.click(screen.getByRole("button", { name: "Order a card now" }));

    expect(push).toHaveBeenCalledWith("/login?next=%2Fbuild-card");
  });

  it("shows the coming-soon status for an authenticated customer without pushing", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({ authenticated: true, role: "customer" });
    const user = await openPreview();

    await user.click(screen.getByRole("button", { name: "Order a card now" }));

    expect(screen.getByRole("status")).toHaveTextContent("Ordering is coming soon");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the coming-soon status for a demo admin without pushing", async () => {
    isLocalDemoMode.mockReturnValue(true);
    useDemoSession.mockReturnValue({ email: "admin@tapit.local", role: "admin" });
    const user = await openPreview();

    await user.click(screen.getByRole("button", { name: "Order a card now" }));

    expect(screen.getByRole("status")).toHaveTextContent("Ordering is coming soon");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the coming-soon status for a live admin without pushing", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({ authenticated: true, role: "admin" });
    const user = await openPreview();

    await user.click(screen.getByRole("button", { name: "Order a card now" }));

    expect(screen.getByRole("status")).toHaveTextContent("Ordering is coming soon");
    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing while auth is loading", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
    const user = await openPreview();

    await user.click(screen.getByRole("button", { name: "Order a card now" }));

    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
