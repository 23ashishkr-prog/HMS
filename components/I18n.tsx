'use client'
import {createContext, useContext, useEffect, useMemo, useState} from 'react'
import {isLang, translate, type Lang} from '@/lib/i18n'

type Ctx = {lang: Lang, setLang: (l: Lang) => void, t: (phrase: string, vars?: Record<string, string | number>) => string}
const I18nCtx = createContext<Ctx>({lang: 'en', setLang: () => {}, t: (s) => s})

export function I18nProvider({children}: {children: React.ReactNode}) {
  const [lang, setLangState] = useState<Lang>('en')
  useEffect(() => {
    const saved = localStorage.getItem('hms.lang')
    if (isLang(saved)) setLangState(saved)
  }, [])
  const api = useMemo<Ctx>(() => ({
    lang,
    setLang: (l) => {
      setLangState(l)
      try { localStorage.setItem('hms.lang', l); document.documentElement.lang = l } catch {}
    },
    t: (phrase, vars) => translate(lang, phrase, vars),
  }), [lang])
  return <I18nCtx.Provider value={api}>{children}</I18nCtx.Provider>
}

export function useI18n() { return useContext(I18nCtx) }
