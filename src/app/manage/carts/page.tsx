import { CartManager } from "@/components/manage/CartManager";
import { requirePageAccess } from "@/lib/auth/viewer";
import { listCarts } from "@/lib/manage/carts";
import { listUniforms } from "@/lib/manage/uniforms";
import { PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Carts · Console" };

export default async function CartsPage() {
  const viewer = await requirePageAccess("cart:read");

  const [carts, uniforms] = await Promise.all([listCarts(viewer), listUniforms()]);

  return (
    <section className="space-y-5">
      <PageHeader
        title="Carts"
        description="The pin and the radius decide where a punch is accepted from."
      />
      <CartManager
        carts={carts}
        uniforms={uniforms}
        // A manager runs a cart; opening new ones is an owner's job, and the
        // action refuses it regardless of what the UI shows.
        canCreate={viewer.scope === "all"}
      />
    </section>
  );
}
