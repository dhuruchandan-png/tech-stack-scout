import Link from "next/link";
import { EmptyState } from "@/components/ui/States";

export default function NotFound() {
  return (
    <div className="card mt-10">
      <EmptyState title="That account is not on your watchlist." hint="It may have been removed, or the address is mistyped." action={<Link href="/accounts" className="btn btn-primary">Back to the Watchlist</Link>} />
    </div>
  );
}
