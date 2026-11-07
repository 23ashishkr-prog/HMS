/** A short check for a phone typed at the desk. Empty is fine — the field is optional until they type. */
export function phoneHint(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.length < 10) return 'Phone number looks short, please check'
  if (d.length > 13) return 'Phone number looks long, please check'
  return null
}

const DONE = new Set(['checked', 'completed', 'dispensed', 'paid', 'available', 'ready', 'signed', 'active'])
const WAIT = new Set(['waiting', 'ordered', 'pending', 'sample_collected', 'open', 'due', 'hold', 'called', 'consultation'])
const ATTN = new Set(['cancelled', 'canceled', 'overdue', 'stat', 'urgent', 'critical', 'unpaid'])

/** Green done, orange waiting, red needs attention. */
export function cue(status: unknown): 'cue-done' | 'cue-wait' | 'cue-attn' | '' {
  const s = String(status ?? '').toLowerCase().replace(/\s+/g, '_')
  if (DONE.has(s)) return 'cue-done'
  if (WAIT.has(s)) return 'cue-wait'
  if (ATTN.has(s)) return 'cue-attn'
  return ''
}

const STATUS_WORDS: Record<string, string> = {
  waiting: 'Waiting',
  ordered: 'Ordered',
  pending: 'Waiting',
  sample_collected: 'Sample taken',
  completed: 'Done',
  paid: 'Paid',
  dispensed: 'Given',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  open: 'Open',
  checked: 'Seen',
  called: 'Called',
  consultation: 'With the doctor',
  available: 'Free',
  ready: 'Ready',
}

export function statusWord(status: unknown): string {
  const s = String(status ?? '').toLowerCase().replace(/\s+/g, '_')
  return STATUS_WORDS[s] || String(status ?? '').replace(/_/g, ' ')
}
