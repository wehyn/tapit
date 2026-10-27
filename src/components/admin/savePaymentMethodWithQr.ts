type PaymentMethodFields = {
  id?: string;
  provider: string;
  label: string;
  accountDetails: string;
  instructions: string;
};

export async function savePaymentMethodWithQr({
  fields,
  file,
  save,
  attachQr,
  onSavedId,
  onQrAttached,
}: {
  fields: PaymentMethodFields;
  file: File | null;
  save: (fields: PaymentMethodFields) => Promise<string | void>;
  attachQr?: (id: string, file: File) => Promise<void>;
  onSavedId: (id: string) => void;
  onQrAttached: () => void;
}) {
  const id = (await save(fields)) || fields.id;
  if (id && !fields.id) onSavedId(id);
  if (id && file && attachQr) {
    await attachQr(id, file);
    onQrAttached();
  }
}
