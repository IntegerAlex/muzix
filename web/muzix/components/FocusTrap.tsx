import { useEffect, useRef, type ReactNode } from 'react'
import { View } from 'react-native'

interface FocusTrapProps {
  children: ReactNode
  active?: boolean
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function FocusTrap({ children, active = true }: FocusTrapProps) {
  const ref = useRef<View>(null)

  useEffect(() => {
    if (!active) return

    const el = ref.current as unknown as HTMLElement | null
    if (!el || typeof document === 'undefined') return

    const first = el.querySelector(FOCUSABLE) as HTMLElement | null
    first?.focus()

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) return
      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [active])

  return <View ref={ref}>{children}</View>
}
