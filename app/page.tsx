import {redirect} from 'next/navigation'
/** Bare /hms is GreyNova marketing. The app home lives at /dashboard. */
export default function Page(){redirect('/dashboard')}
