import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

/**
 * True at the `md` breakpoint and up (same 768px as the Tailwind `md:` classes). Initialised
 * synchronously from matchMedia so the first render already picks the right layout - used where
 * mounting BOTH the phone and the desktop layout (CSS-hidden) would duplicate heavy children
 * (videos, charts) and make charts measure a zero-size container.
 */
export function useIsDesktop() {
  const query = `(min-width: ${MOBILE_BREAKPOINT}px)`
  const [isDesktop, setIsDesktop] = React.useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  )
  React.useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setIsDesktop(mql.matches)
    mql.addEventListener("change", onChange)
    onChange()
    return () => mql.removeEventListener("change", onChange)
  }, [query])
  return isDesktop
}
