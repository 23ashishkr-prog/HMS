'use client'
import {usePathname, useRouter, useSearchParams} from 'next/navigation'
import {withTab} from '@/lib/tabs'

/** One tab bar for every in-page switch. The click updates the URL with the client router (no reload) and the panel uses the same viewSwap as a sidebar page change. */
export function Tabs({items, value, param = 'tab', extra, className = 'tabs'}: {
  items: {id: string; label: string}[]
  value: string
  param?: string
  extra?: React.ReactNode
  className?: string
}) {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  function select(id: string) {
    if (id === value) return
    const q = withTab(sp.toString(), param, id, items[0]?.id || '')
    router.replace(path + q, {scroll: false})
  }
  return (
    <div className={className} role="tablist">
      {items.map(it => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id} className={value === it.id ? 'on' : ''} onClick={() => select(it.id)}>{it.label}</button>
      ))}
      {extra}
    </div>
  )
}

/** Same 160ms fade used when the sidebar changes page and when a tab changes. */
export function ViewSwap({id, pending, children}: {id: string; pending?: boolean; children: React.ReactNode}) {
  return <div key={id} className="viewSwap">{pending ? <PageSkeleton/> : children}</div>
}

export function PageSkeleton() {
  return <div className="skeleton" aria-busy="true" aria-label="Loading"><div/><div/><div/></div>
}
