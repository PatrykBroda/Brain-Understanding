import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="frame-ambient relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="glow-orb h-72 w-72 opacity-50" />
      <div className="glass glass-red frame-rise relative w-full max-w-md p-8">
        <div className="mb-4 flex items-center gap-3">
          <AlertCircle className="h-8 w-8 flex-none text-[#E5645A]" strokeWidth={1.25} />
          <h1 className="display-heading">404 Page Not Found</h1>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Did you forget to add the page to the router?
        </p>
      </div>
    </div>
  );
}
