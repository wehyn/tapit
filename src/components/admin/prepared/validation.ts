import { validateProfileSlug } from "@/lib/domain";
import type { PreparedErrors, PreparedFormValues, PreparedStep } from "./types";

export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validHttps(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0 && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateStep(values: PreparedFormValues, step: PreparedStep): PreparedErrors {
  const errors: PreparedErrors = {};
  if (step === 1) {
    if (!values.name.trim()) errors.name = "Enter a display name.";
    if (!values.slug.trim()) errors.slug = "Enter a profile URL.";
    else if (validateProfileSlug(values.slug) !== null)
      errors.slug = "Use lowercase letters, numbers and hyphens.";
  }
  if (step === 2) {
    if (
      values.contactEmail?.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail.trim())
    )
      errors.contactEmail = "Enter a valid email address.";
    if (values.website?.trim() && !validHttps(values.website.trim()))
      errors.website = "Enter a valid https:// address.";
  }
  if (step === 3) {
    values.links.forEach((link, index) => {
      const label = link.label.trim();
      const url = link.url.trim();
      if (!label && url) errors[`links.${index}.label`] = "Add a label.";
      if (label && !url) errors[`links.${index}.url`] = "Enter a valid https:// address.";
      else if (url && !validHttps(url))
        errors[`links.${index}.url`] = "Enter a valid https:// address.";
    });
  }
  return errors;
}

export function validatePrepared(values: PreparedFormValues): PreparedErrors {
  return { ...validateStep(values, 1), ...validateStep(values, 2), ...validateStep(values, 3) };
}
