import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generators = vi.hoisted(() => ({
  generateQrPng: vi.fn(),
  generateQrSvg: vi.fn(),
}));

vi.mock("@/lib/qr", () => generators);

import { QrControls } from "@/components/qr/QrControls";

const cardUrl = "https://tapit-eosin.vercel.app/c/card-29y887jo?claim=1";

beforeEach(() => {
  generators.generateQrPng.mockReset().mockResolvedValue("data:image/png;base64,preview");
  generators.generateQrSvg.mockReset().mockResolvedValue("<svg />");
});

describe("QrControls", () => {
  it("generates preview and SVG from the exact saved URL only after opening", async () => {
    render(<QrControls cardUrl={cardUrl} label="card-29y887jo" />);
    expect(generators.generateQrPng).not.toHaveBeenCalled();
    expect(generators.generateQrSvg).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("QR fallback"));

    await waitFor(() => {
      expect(generators.generateQrSvg).toHaveBeenCalledWith(cardUrl);
      expect(generators.generateQrPng).toHaveBeenCalledWith(cardUrl);
    });
    expect(await screen.findByAltText("QR code for card-29y887jo")).toBeInTheDocument();
    expect(screen.getByText(`Encodes ${cardUrl}`)).toBeInTheDocument();
  });

  it.each([
    "/c/card-29y887jo",
    "https://user:pass@example.test/c/card-29y887jo",
    "https://example.test/c/card-29y887jo#fragment",
    "https://example.test/profile/card-29y887jo",
  ])("rejects invalid permanent URL %s without generating a fallback", async (url) => {
    render(<QrControls cardUrl={url} label="card-29y887jo" />);
    fireEvent.click(screen.getByText("QR fallback"));

    expect(await screen.findByRole("alert")).toHaveTextContent("no valid permanent production URL");
    expect(generators.generateQrSvg).not.toHaveBeenCalled();
    expect(generators.generateQrPng).not.toHaveBeenCalled();
  });

  it("offers retry after generation fails", async () => {
    generators.generateQrSvg.mockRejectedValueOnce(new Error("failed"));
    render(<QrControls cardUrl={cardUrl} label="card-29y887jo" />);
    fireEvent.click(screen.getByText("QR fallback"));
    fireEvent.click(await screen.findByRole("button", { name: "Retry QR generation" }));

    await waitFor(() => {
      expect(generators.generateQrSvg).toHaveBeenCalledTimes(2);
      expect(generators.generateQrPng).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByAltText("QR code for card-29y887jo")).toBeInTheDocument();
  });

  it("keeps SVG download disabled until ready and names it from the URL token", async () => {
    let resolveSvg!: (value: string) => void;
    generators.generateQrSvg.mockImplementationOnce(
      () => new Promise<string>((resolve) => (resolveSvg = resolve)),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<QrControls cardUrl={cardUrl} label="untrusted label" />);
    fireEvent.click(screen.getByText("QR fallback"));

    const download = await screen.findByRole("button", { name: "Download SVG" });
    expect(download).toBeDisabled();
    resolveSvg("<svg />");
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);

    expect(click).toHaveBeenCalled();
    expect(click.mock.contexts[0]).toBeInstanceOf(HTMLAnchorElement);
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe("card-29y887jo.svg");
    click.mockRestore();
  });

  it("ignores a late result when the card URL changes", async () => {
    const nextUrl = "https://tapit-eosin.vercel.app/c/card-next?claim=1";
    const svgResolvers = new Map<string, (value: string) => void>();
    const pngResolvers = new Map<string, (value: string) => void>();
    generators.generateQrSvg.mockImplementation(
      (url: string) => new Promise<string>((resolve) => svgResolvers.set(url, resolve)),
    );
    generators.generateQrPng.mockImplementation(
      (url: string) => new Promise<string>((resolve) => pngResolvers.set(url, resolve)),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { rerender } = render(<QrControls cardUrl={cardUrl} label="card-29y887jo" />);
    fireEvent.click(screen.getByText("QR fallback"));
    await waitFor(() => expect(generators.generateQrSvg).toHaveBeenCalledWith(cardUrl));

    rerender(<QrControls cardUrl={nextUrl} label="card-next" />);
    await waitFor(() => expect(generators.generateQrSvg).toHaveBeenLastCalledWith(nextUrl));
    await act(async () => {
      svgResolvers.get(nextUrl)?.('<svg id="new" />');
      pngResolvers.get(nextUrl)?.("data:image/png;base64,new");
    });
    expect(await screen.findByAltText("QR code for card-next")).toBeInTheDocument();
    await act(async () => {
      svgResolvers.get(cardUrl)?.('<svg id="old" />');
      pngResolvers.get(cardUrl)?.("data:image/png;base64,old");
    });
    expect(screen.getByAltText("QR code for card-next")).toHaveAttribute(
      "src",
      "data:image/png;base64,new",
    );
    expect(screen.getByText(`Encodes ${nextUrl}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download SVG" }));
    const downloadAnchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(decodeURIComponent(downloadAnchor.href.split(",")[1]!)).toBe('<svg id="new" />');
    click.mockRestore();
  });

  it("ignores a late result when the QR disclosure closes", async () => {
    const svgResolvers: Array<(value: string) => void> = [];
    const pngResolvers: Array<(value: string) => void> = [];
    generators.generateQrSvg.mockImplementation(
      () => new Promise<string>((resolve) => svgResolvers.push(resolve)),
    );
    generators.generateQrPng.mockImplementation(
      () => new Promise<string>((resolve) => pngResolvers.push(resolve)),
    );
    render(<QrControls cardUrl={cardUrl} label="card-29y887jo" />);
    const disclosure = screen.getByText("QR fallback");
    fireEvent.click(disclosure);
    await waitFor(() => expect(generators.generateQrSvg).toHaveBeenCalledTimes(1));
    fireEvent.click(disclosure);
    await act(async () => {
      svgResolvers[0]?.('<svg id="closed" />');
      pngResolvers[0]?.("data:image/png;base64,closed");
    });
    expect(screen.queryByAltText("QR code for card-29y887jo")).not.toBeInTheDocument();

    fireEvent.click(disclosure);
    await waitFor(() => expect(generators.generateQrSvg).toHaveBeenCalledTimes(2));
    await act(async () => {
      svgResolvers[1]?.('<svg id="reopened" />');
      pngResolvers[1]?.("data:image/png;base64,reopened");
    });
    expect(await screen.findByAltText("QR code for card-29y887jo")).toHaveAttribute(
      "src",
      "data:image/png;base64,reopened",
    );
  });
});
