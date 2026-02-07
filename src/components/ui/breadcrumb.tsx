import type { HTMLAttributes, LiHTMLAttributes, OlHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export const Breadcrumb = ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
  <nav aria-label="breadcrumb" className={cn('min-w-0', className)} {...props} />
)

export const BreadcrumbList = ({ className, ...props }: OlHTMLAttributes<HTMLOListElement>) => (
  <ol className={cn('flex min-w-0 items-center gap-2 text-sm text-slate-500', className)} {...props} />
)

export const BreadcrumbItem = ({ className, ...props }: LiHTMLAttributes<HTMLLIElement>) => (
  <li className={cn('min-w-0', className)} {...props} />
)

export const BreadcrumbPage = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('block min-w-0 truncate font-medium text-slate-700', className)} {...props} />
)

