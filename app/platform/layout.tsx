import {PlatformProductProvider} from '@/components/PlatformProduct'

export default function PlatformLayout({children}:{children:React.ReactNode}){
 return <PlatformProductProvider>{children}</PlatformProductProvider>
}
