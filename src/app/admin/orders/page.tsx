import { OrderManager } from "@/components/admin/OrderManager";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string | string[] }>;
}) {
  const params = await searchParams;
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  return <OrderManager orderId={orderId} />;
}
