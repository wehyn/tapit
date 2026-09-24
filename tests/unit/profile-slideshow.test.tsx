import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileSlideshow } from "../../src/components/profile/ProfileSlideshow";

const images = [
  { src: "/one.jpg", alt: "First studio detail" },
  { src: "/two.jpg", alt: "Second studio detail" },
  { src: "/three.jpg", alt: "Third studio detail" },
];

class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionObserverMock.instances.push(this);
  }

  observe() {}
  disconnect() {}
  setVisible(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

describe("ProfileSlideshow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    IntersectionObserverMock.instances = [];
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders no controls for an empty slideshow", () => {
    const { container } = render(<ProfileSlideshow autoplay images={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("supports arrows, wrapping dots, keyboard activation, and horizontal swipe", () => {
    render(<ProfileSlideshow autoplay={false} images={images} />);
    const next = screen.getByRole("button", { name: "Next image" });
    const previous = screen.getByRole("button", { name: "Previous image" });

    expect(screen.getByRole("img")).toHaveAttribute("alt", images[0]!.alt);
    fireEvent.click(next);
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[1]!.alt);
    fireEvent.click(screen.getByRole("button", { name: "Image 3 of 3" }));
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[2]!.alt);
    fireEvent.click(next);
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[0]!.alt);
    fireEvent.keyDown(previous, { key: "Enter" });
    fireEvent.click(previous);
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[2]!.alt);

    const slideshow = screen.getByRole("region", { name: "Profile slideshow" });
    fireEvent.pointerDown(slideshow, { clientX: 120, clientY: 40 });
    fireEvent.pointerUp(slideshow, { clientX: 40, clientY: 44 });
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[1]!.alt);
  });

  it("captures the pointer so a swipe can finish after crossing the surface edge", () => {
    render(<ProfileSlideshow autoplay={false} images={images} />);
    const slideshow = screen.getByRole("region", { name: "Profile slideshow" });
    const setPointerCapture = vi.fn();
    Object.defineProperty(slideshow, "setPointerCapture", { value: setPointerCapture });
    fireEvent.pointerDown(slideshow, { clientX: 120, clientY: 40 });
    fireEvent.pointerUp(slideshow, { clientX: 40, clientY: 44 });
    expect(setPointerCapture).toHaveBeenCalledWith(undefined);
  });

  it("autoplays only while visible and not when reduced motion is preferred", () => {
    render(<ProfileSlideshow autoplay images={images} />);
    const observer = IntersectionObserverMock.instances[0]!;
    act(() => observer.setVisible(false));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[0]!.alt);

    act(() => observer.setVisible(true));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[1]!.alt);
  });

  it("pauses for interaction and resumes unless the user explicitly paused it", () => {
    render(<ProfileSlideshow autoplay images={images} />);
    const observer = IntersectionObserverMock.instances[0]!;
    const slideshow = screen.getByRole("region", { name: "Profile slideshow" });
    act(() => observer.setVisible(true));

    fireEvent.mouseEnter(slideshow);
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[0]!.alt);
    fireEvent.mouseLeave(slideshow);
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[1]!.alt);

    fireEvent.click(screen.getByRole("button", { name: "Pause slideshow" }));
    expect(screen.getByRole("button", { name: "Play slideshow" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[1]!.alt);
    fireEvent.mouseEnter(slideshow);
    fireEvent.mouseLeave(slideshow);
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[1]!.alt);
  });

  it("marks the initial frame eager and later frames lazy with async decoding", () => {
    render(<ProfileSlideshow autoplay={false} images={images} />);
    const image = screen.getByRole("img");
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("decoding", "async");
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
  });

  it("does not autoplay when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<ProfileSlideshow autoplay images={images} />);
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[0]!.alt);
  });

  it("disables autoplay and image fade animation when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<ProfileSlideshow autoplay images={images} />);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole("img")).toHaveClass("tapit-profile-slideshow-image--reduced");
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("img")).toHaveAttribute("alt", images[0]!.alt);
  });
});
