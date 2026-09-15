import { describe, expect, it } from "vitest";

import {
  normalizeSignupEmail,
  normalizeSignupInput,
  validateSignupEmail,
  validateSignupInput,
  type SignupFormValues,
} from "../../src/lib/auth/signup";

const values = (overrides: Partial<SignupFormValues> = {}): SignupFormValues => ({
  email: " Ada@Example.com ",
  password: "password",
  confirmation: "password",
  name: " Ada Lovelace ",
  slug: " Ada-Lovelace ",
  ...overrides,
});

describe("signup contracts", () => {
  it("normalizes email, name, and slug while excluding confirmation", () => {
    expect(normalizeSignupEmail(" Ada@Example.com ")).toBe("ada@example.com");
    expect(normalizeSignupInput(values())).toEqual({
      email: "ada@example.com",
      password: "password",
      name: "Ada Lovelace",
      slug: "ada-lovelace",
    });
  });

  it.each(["", "   ", "ada example.com", "ada@example", "ada@example.com other"])(
    "rejects malformed email %j",
    (email) => {
      expect(validateSignupEmail(email)).toBeTruthy();
    },
  );

  it("reports field errors and returns no payload", () => {
    const result = validateSignupInput(
      values({
        email: "bad email",
        password: "short",
        confirmation: "different",
        name: " ",
        slug: "bad_slug",
      }),
    );
    expect(result.payload).toBeNull();
    expect(result.errors).toMatchObject({
      email: expect.any(String),
      password: expect.any(String),
      confirmation: expect.any(String),
      name: expect.any(String),
      slug: expect.any(String),
    });
  });

  it("accepts an exact eight-character password and matching confirmation", () => {
    expect(validateSignupInput(values({ password: "12345678", confirmation: "12345678" }))).toEqual(
      {
        errors: {},
        payload: {
          email: "ada@example.com",
          password: "12345678",
          name: "Ada Lovelace",
          slug: "ada-lovelace",
        },
      },
    );
  });
});
