'use client'
import {useState} from 'react'
import Link from 'next/link'
import {useI18n} from '@/components/I18n'
import {LANGS, TOUR, isLang, type Lang} from '@/lib/i18n'
import {call, clearMe} from '@/lib/client'

/** The one obvious button for this screen. `act` runs the job here; otherwise it opens the desk. */
export function PrimaryJob({label, href, act}: {label: string, href?: string, act?: boolean}) {
  const {t} = useI18n()
  const text = t(label)
  if (act || !href) return <button type="button" className="jobBtn" onClick={() => window.dispatchEvent(new CustomEvent('hms:job'))}>{text}</button>
  return <Link href={href} className="jobBtn" prefetch>{text}</Link>
}

export function Steps({n, labels}: {n: number, labels: string[]}) {
  const {t} = useI18n()
  return <div className="stepWrap">
    <p className="stepCount">{t('Step {n} of {m}', {n, m: labels.length})}</p>
    <ol className="steps">{labels.map((l, i) => <li key={l} className={i + 1 === n ? 'on' : i + 1 < n ? 'done' : ''}><b>{i + 1}</b><span>{t(l)}</span></li>)}</ol>
  </div>
}

export function LangSwitch({save}: {save?: boolean}) {
  const {lang, setLang, t} = useI18n()
  async function pick(id: Lang) {
    setLang(id)
    try { sessionStorage.setItem('hms.langPick', id) } catch {}
    if (save) { try { await call('/api/me/prefs', 'PATCH', {locale: id}); clearMe() } catch {} }
  }
  return <div className="langSwitch" role="group" aria-label={t('Language')}>
    {LANGS.map(l => <button type="button" key={l.id} className={lang === l.id ? 'on' : ''} aria-pressed={lang === l.id} onClick={() => pick(l.id)}>{l.native}</button>)}
  </div>
}

export function TourCard({role, onClose}: {role: string, onClose: () => void}) {
  const {t} = useI18n()
  const tips = TOUR[role] || TOUR.admin
  const [i, setI] = useState(0)
  const tip = tips[Math.min(i, tips.length - 1)]
  async function finish() {
    try { sessionStorage.setItem('hms.tourDone', '1'); sessionStorage.removeItem('hms.tour') } catch {}
    onClose()
    try { await call('/api/me/prefs', 'PATCH', {tourSeen: true}); clearMe() } catch {}
  }
  return <div className="tourBackdrop" role="dialog" aria-label={t(tip.title)}>
    <div className="tourCard">
      <p className="stepCount">{t('Step {n} of {m}', {n: i + 1, m: tips.length})}</p>
      <h2>{t(tip.title)}</h2>
      <p>{t(tip.body)}</p>
      <div className="tourActs">
        <button type="button" className="ghost" onClick={finish}>{t('Skip')}</button>
        {i < tips.length - 1
          ? <button type="button" className="primary" onClick={() => setI(i + 1)}>{t('Next')}</button>
          : <button type="button" className="primary" onClick={finish}>{t('Done')}</button>}
      </div>
    </div>
  </div>
}

export function applySavedLanguage(locale: string | undefined, setLang: (l: Lang) => void) {
  let pick = ''
  try { pick = sessionStorage.getItem('hms.langPick') || '' } catch {}
  if (isLang(pick)) {
    try { sessionStorage.removeItem('hms.langPick') } catch {}
    setLang(pick)
    if (pick !== locale) call('/api/me/prefs', 'PATCH', {locale: pick}).then(() => clearMe()).catch(() => {})
    return
  }
  if (isLang(locale)) setLang(locale)
}
