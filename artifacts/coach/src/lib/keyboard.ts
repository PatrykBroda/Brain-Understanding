// Keyboard behaviour for forms on a phone browser (onboarding, sign-up, Camp):
//  - when the on-screen keyboard is open the page can still be scrolled to the last field
//    and the Continue / Save control (the keyboard's height is added as scroll room),
//  - tapping anywhere that is not a control puts the keyboard away (typed text is kept:
//    blurring never clears a field).
// iOS Safari does not shrink the layout viewport for the keyboard, so the visual viewport
// is the only signal. These helpers are pure so they can be unit-tested.

/** Height of the keyboard (px) from the layout and visual viewports; 0 when closed. */
export function keyboardInset(innerHeight: number, vvHeight: number, vvOffsetTop: number): number {
  const inset = innerHeight - vvHeight - vvOffsetTop;
  // Browser chrome (address bar) moves by up to ~100px; only a real keyboard is taller.
  return inset > 100 ? Math.round(inset) : 0;
}

const FIELD = "input,textarea,select,[contenteditable='true']";
const CONTROL = "input,textarea,select,button,a,label,summary,[role='button'],[role='checkbox'],[role='switch'],[contenteditable='true']";

type Target = { closest?: (sel: string) => unknown } | null | undefined;

/** True when a tap on `target` should put the keyboard away: a field is focused and the tap is on non-control space. */
export function shouldDismissKeyboard(active: (Target & { matches?: (sel: string) => boolean }) | null, target: Target): boolean {
  if (!active || typeof active.matches !== "function" || !active.matches(FIELD)) return false;
  if (!target || typeof target.closest !== "function") return true;
  return !target.closest(CONTROL);
}

/** Wire the helpers once at app start. Returns a cleanup. */
export function installKeyboardHelpers(): () => void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  const update = () => {
    const inset = vv ? keyboardInset(window.innerHeight, vv.height, vv.offsetTop) : 0;
    root.style.setProperty("--kb-inset", `${inset}px`);
    root.dataset.keyboard = inset > 0 ? "open" : "closed";
  };
  const onPointerDown = (e: PointerEvent) => {
    const active = document.activeElement as HTMLElement | null;
    if (shouldDismissKeyboard(active, e.target as HTMLElement | null)) active?.blur();
  };
  update();
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  document.addEventListener("pointerdown", onPointerDown, true);
  return () => {
    vv?.removeEventListener("resize", update);
    vv?.removeEventListener("scroll", update);
    document.removeEventListener("pointerdown", onPointerDown, true);
  };
}
