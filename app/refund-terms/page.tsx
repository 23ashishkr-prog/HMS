import {TermsDocument} from '@/components/TermsDocument'
import {PublicHeader,PublicLegal} from '@/components/PublicChrome'

export default function RefundTermsPage(){
 return <><PublicHeader narrow/><main className="legalPage"><TermsDocument/></main><PublicLegal/></>
}
