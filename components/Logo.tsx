/** Brand mark: liquid gradient cross (navy → aqua → coral). Same artwork as /logo.svg and the favicon. */
import {withBase} from '@/lib/basePath'
export default function Logo({size=34,className=''}:{size?:number;className?:string}){return <img src={withBase('/logo.svg')} width={size} height={size} alt="" className={'brandLogo '+className} draggable={false}/>}
