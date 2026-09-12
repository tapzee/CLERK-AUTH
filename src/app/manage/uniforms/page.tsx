import { UniformManager } from "@/components/manage/UniformManager";
import { requirePageAccess } from "@/lib/auth/viewer";
import { listUniforms } from "@/lib/manage/uniforms";
import { PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Uniforms · Console" };

/**
 * Owner-only. A uniform is shared by every cart attached to it, so changing a
 * pass mark here raises or lowers the bar across the business at once -- which
 * is why `uniform:write` is not in a manager's permission set.
 */
export default async function UniformsPage() {
  await requirePageAccess("uniform:write");
  const uniforms = await listUniforms();

  return (
    <section className="space-y-5">
      <PageHeader
        title="Uniforms"
        description="What the automatic check is looking for, and what it compares against."
      />
      <UniformManager uniforms={uniforms} />
    </section>
  );
}
