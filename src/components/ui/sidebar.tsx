import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { createContext, useContext, useMemo, useState } from 'react'
import { cn } from '../../lib/utils'

type SidebarContextValue = {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (value: boolean) => void
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

const useSidebar = () => {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error('useSidebar must be used inside SidebarProvider')
  }
  return ctx
}

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const value = useMemo<SidebarContextValue>(
    () => ({
      collapsed,
      setCollapsed,
      mobileOpen,
      setMobileOpen,
      toggle: () => {
        if (window.matchMedia('(max-width: 1023px)').matches) {
          setMobileOpen((prev) => !prev)
          return
        }
        setCollapsed((prev) => !prev)
      },
    }),
    [collapsed, mobileOpen]
  )

  return (
    <SidebarContext.Provider value={value}>
      <div className="relative flex min-h-[calc(100vh-7.2rem)] w-full gap-4">
        {children}
        {mobileOpen && (
          <button
            type="button"
            aria-label="Sidebar schließen"
            className="fixed inset-0 z-[60] bg-slate-900/35 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </div>
    </SidebarContext.Provider>
  )
}

type SidebarProps = HTMLAttributes<HTMLElement> & {
  side?: 'left' | 'right'
}

export const Sidebar = ({ className, side = 'left', children, ...props }: SidebarProps) => {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar()
  const isLeft = side === 'left'
  const widthClass = isLeft ? (collapsed ? 'lg:w-20' : 'lg:w-72') : 'lg:w-80'
  const hiddenClass = isLeft ? '' : 'hidden xl:flex'

  return (
    <>
      <aside
        className={cn(
          'hidden shrink-0 flex-col rounded-2xl border border-slate-200/80 bg-white/85 p-3 shadow-sm backdrop-blur-sm lg:flex',
          widthClass,
          hiddenClass,
          className
        )}
        {...props}
      >
        {children}
      </aside>

      {isLeft && (
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-[70] flex w-72 flex-col border-r border-slate-200 bg-white p-3 shadow-xl transition-transform lg:hidden',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          {children}
          <button
            type="button"
            className="mt-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"
            onClick={() => setMobileOpen(false)}
          >
            Schließen
          </button>
        </aside>
      )}
    </>
  )
}

export const SidebarInset = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex min-w-0 flex-1 flex-col overflow-hidden', className)} {...props}>
    {children}
  </div>
)

export const SidebarTrigger = ({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => {
  const { collapsed, toggle } = useSidebar()
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50',
        className
      )}
      onClick={toggle}
      {...props}
    >
      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  )
}

