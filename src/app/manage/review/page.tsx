import { ReviewQueue } from "@/components/manage/ReviewQueue";
import { requirePageAccess } from "@/lib/auth/viewer";
import { getReviewQueue } from "@/lib/manage/attendance";
import { PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Uniform review · Console" };

/**
 * The human half of the uniform check.
 *
 * A check-in the model was sure about never reaches this page: a clear fail was
 * refused at the cart and a clear pass was recorded silently. What lands here is
 * a photo too poor to judge, or one the model never got to see because the call
 * timed out — and in both cases the punch was allowed, because attendance must
 * not depend on an API being up.
 */
export default async function ReviewPage() {
  const viewer = await requirePageAccess("attendance:review");
  const items = await getReviewQueue(viewer);

  return (
    <section className="space-y-5">
      <PageHeader
        title="Uniform review"
        description="Punches the automatic check could not settle. They are already recorded — this decides whether the uniform was acceptable."
      />
      <ReviewQueue items={items} />
    </section>
  );
}
