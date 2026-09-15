import { normalizeProfileSlug, validateProfileSlug } from "../domain";

export type SignupFormValues = {
  email: string;
  password: string;
  confirmation: string;
  name: string;
  slug: string;
};
export type SignupPayload = { email: string; password: string; name: string; slug: string };
export type SignupValidationResult = {
  errors: Partial<Record<keyof SignupFormValues, string>>;
  payload: SignupPayload | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeSignupEmail(value: string): string {
  return value.trim().toLowerCase();
}
export function validateSignupEmail(value: string): string | null {
  const email = normalizeSignupEmail(value);
  return email.length === 0 || !EMAIL_PATTERN.test(email) ? "Enter a valid email address." : null;
}
export function normalizeSignupInput(values: SignupFormValues): SignupPayload {
  return {
    email: normalizeSignupEmail(values.email),
    password: values.password,
    name: values.name.trim(),
    slug: normalizeProfileSlug(values.slug),
  };
}
export function validateSignupInput(values: SignupFormValues): SignupValidationResult {
  const payload = normalizeSignupInput(values);
  const errors: Partial<Record<keyof SignupFormValues, string>> = {};
  const emailError = validateSignupEmail(values.email);
  if (emailError !== null) errors.email = emailError;
  if (payload.password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (values.confirmation !== values.password) errors.confirmation = "Passwords must match.";
  if (payload.name.length === 0) errors.name = "Enter your display name.";
  else if (payload.name.length > 120) errors.name = "Your display name is too long.";
  const slugError = validateProfileSlug(payload.slug);
  if (slugError !== null) errors.slug = slugError;
  return { errors, payload: Object.keys(errors).length === 0 ? payload : null };
}
