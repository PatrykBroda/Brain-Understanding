import { Link } from "wouter";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden px-5">
      <div className="atmo atmo-silver" aria-hidden />
      <div className="glass frame-rise relative z-10 flex w-full max-w-md flex-col items-center gap-2 px-6 py-8 text-center">
        <span
          className="mb-1 grid h-11 w-11 place-items-center rounded-[14px] border"
          style={{ background: "var(--f-raised)", borderColor: "var(--f-border)", color: "var(--f-text-2)" }}
        >
          <SearchX className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <h1 className="display-title">Page not found</h1>
        <p className="max-w-[32ch] text-base leading-6 text-muted-foreground">
          That page does not exist or has moved.
        </p>
        <Link href="/home" className="btn-bronze mt-4 w-full">
          Back to home
        </Link>
      </div>
    </div>
  );
}
