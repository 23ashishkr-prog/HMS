import type {Metadata} from 'next'

// Sign-in, forgot and reset forms have no search value: keep them out of the index, still follow links.
export const metadata:Metadata={robots:{index:false,follow:true}}

export default function AuthLayout({children}:{children:React.ReactNode}){return children}
