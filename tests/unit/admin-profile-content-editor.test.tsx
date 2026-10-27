import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminProfileContentEditor } from "@/components/admin/AdminProfileContentEditor";

describe("AdminProfileContentEditor link safety", () => {
  it("shows a row-level safety error for a nonblank disabled link", () => {
    render(
      <AdminProfileContentEditor
        profileId="profile-1"
        draft={{
          name: "Mara Velasquez",
          slug: "mara-velasquez",
          links: [
            {
              id: "disabled",
              label: "Old link",
              destination: "javascript:alert(1)",
              enabled: false,
            },
          ],
        }}
        onChange={vi.fn()}
        onUploadPhoto={vi.fn()}
        onRemovePhoto={vi.fn()}
        onUploadMedia={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Link destination must be a valid HTTPS, mailto, or tel address.",
    );
  });
});
