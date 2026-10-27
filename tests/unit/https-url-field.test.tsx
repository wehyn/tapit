import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { HttpsUrlField } from "@/components/ui/Field";

function Harness({ onValue }: { onValue: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <HttpsUrlField
      id="url"
      label="Destination"
      onValueChange={(next) => {
        setValue(next);
        onValue(next);
      }}
      value={value}
    />
  );
}

describe("HttpsUrlField", () => {
  it("shows a fixed https:// prefix and stores the full URL", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    expect(screen.getByText("https://")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Destination"), "example.com");

    expect(onValue).toHaveBeenLastCalledWith("https://example.com");
    expect(screen.getByLabelText("Destination")).toHaveValue("example.com");
  });

  it("does not double the scheme when a full URL is pasted and keeps empty input empty", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText("Destination");

    await user.click(input);
    await user.paste("https://example.com/path");
    expect(onValue).toHaveBeenLastCalledWith("https://example.com/path");
    expect(input).toHaveValue("example.com/path");

    await user.clear(input);
    expect(onValue).toHaveBeenLastCalledWith("");
  });

  it("upgrades a pasted http:// scheme instead of nesting it", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    await user.click(screen.getByLabelText("Destination"));
    await user.paste("http://example.com");

    expect(onValue).toHaveBeenLastCalledWith("https://example.com");
  });
});
