import { expect, type Locator, type Page } from "@playwright/test";

export function customerRows(page: Page, text: string): Locator {
  return page
    .getByRole("list", { name: "Customer accounts" })
    .getByRole("listitem")
    .filter({ hasText: text });
}

export function customerRow(page: Page, text: string): Locator {
  return customerRows(page, text).first();
}

export async function openCustomerDetails(page: Page, text: string): Promise<Locator> {
  await customerRow(page, text).getByRole("button").click();
  const details = page.getByRole("dialog");
  await expect(details).toBeVisible();
  return details;
}
