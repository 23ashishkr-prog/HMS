/** GST on bills. Prices are GST-inclusive (MRP), so totals never change: each line's taxable value and tax are worked
 *  out of the amount after its share of the bill discount. Supply inside the hospital's state is CGST + SGST; a business
 *  buyer in another state is IGST. Also: e-invoice JSON (NIC schema 1.1) for business bills, and accounting exports. */
import {Ctx,Db,HttpError,audit,opt,requireRole} from './core'
const ROLES=['admin','billing','reception'] as const
const r2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100
export const GSTIN_RE=/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const GST_RATES=[0,5,12,18,28,40]
/** Reads an HSN/SAC code and GST rate from a form; undefined leaves the stored value alone. */
export function taxFields(b:any,codeLabel:string){const code=opt(b.hsn??b.sac)?.replace(/\s/g,'')||null;if(code&&!/^\d{4,8}$/.test(code))throw new HttpError(400,codeLabel+' must be 4-8 digits.');let rate:number|null=null;if(b.gstRate!==undefined&&b.gstRate!==null&&b.gstRate!==''){rate=Number(b.gstRate);if(!GST_RATES.includes(rate))throw new HttpError(400,'GST rate must be one of '+GST_RATES.join(', ')+'%.')}return {code,rate}}
export const stateOf=(gstin?:string|null)=>gstin&&GSTIN_RE.test(gstin)?gstin.slice(0,2):null
export type GstLine={id:string;description:string;hsn:string|null;rate:number;quantity:number;unitPrice:number;amount:number;discount:number;taxable:number;cgst:number;sgst:number;igst:number}
/** Per-line and per-rate GST split of one bill. */
export async function gstBreakup(db:Db,invoiceId:string){const inv=(await db.query('select i.*,h.gstin seller_gstin from invoices i join hospitals h on h.id=i.hospital_id where i.id=$1',[invoiceId])).rows[0];if(!inv)throw new HttpError(404,'Invoice not found.')
 const items=(await db.query('select id,description,hsn_sac,coalesce(gst_rate,0)::float rate,quantity::float q,unit_price::float p from invoice_items where invoice_id=$1 order by created_at',[invoiceId])).rows
 const gross=items.reduce((s:number,i:any)=>s+i.q*i.p,0),disc=Math.min(Number(inv.discount||0),gross)
 const seller=stateOf(inv.seller_gstin),buyer=stateOf(inv.buyer_gstin),inter=!!(seller&&buyer&&seller!==buyer),registered=!!seller
 let left=disc;const lines:GstLine[]=items.map((i:any,k:number)=>{const amt=r2(i.q*i.p);const d=k===items.length-1?r2(left):r2(gross?disc*amt/gross:0);left-=d;const net=amt-d,rate=registered?i.rate:0;const taxable=r2(net*100/(100+rate)),tax=r2(net-taxable)
  return {id:i.id,description:i.description,hsn:i.hsn_sac,rate,quantity:i.q,unitPrice:i.p,amount:amt,discount:d,taxable,cgst:inter?0:r2(tax/2),sgst:inter?0:r2(tax-r2(tax/2)),igst:inter?tax:0}})
 const byRate=new Map<number,{rate:number;taxable:number;cgst:number;sgst:number;igst:number}>();for(const l of lines){const x=byRate.get(l.rate)||{rate:l.rate,taxable:0,cgst:0,sgst:0,igst:0};x.taxable=r2(x.taxable+l.taxable);x.cgst=r2(x.cgst+l.cgst);x.sgst=r2(x.sgst+l.sgst);x.igst=r2(x.igst+l.igst);byRate.set(l.rate,x)}
 const t=lines.reduce((s,l)=>({taxable:r2(s.taxable+l.taxable),cgst:r2(s.cgst+l.cgst),sgst:r2(s.sgst+l.sgst),igst:r2(s.igst+l.igst)}),{taxable:0,cgst:0,sgst:0,igst:0})
 return {registered,interState:inter,lines,byRate:[...byRate.values()].sort((a,b)=>a.rate-b.rate),totals:{...t,tax:r2(t.cgst+t.sgst+t.igst),invoice:r2(gross-disc)}}}

/** Business buyer (company, insurer, TPA) on a bill: their GSTIN makes it a B2B invoice that can be e-invoiced. */
export async function setBuyer(db:Db,ctx:Ctx,invoiceId:string,b:any){requireRole(ctx,[...ROLES]);const g=opt(b.gstin)?.toUpperCase()||null;if(g&&!GSTIN_RE.test(g))throw new HttpError(400,'Buyer GSTIN format is invalid.');if(g&&!opt(b.name))throw new HttpError(400,'Enter the buyer\'s legal name.');const pin=opt(b.pincode);if(pin&&!/^\d{6}$/.test(pin))throw new HttpError(400,'PIN code must be 6 digits.')
 const r=(await db.query('update invoices set buyer_gstin=$3,buyer_name=$4,buyer_address=$5,buyer_pincode=$6 where id=$1 and hospital_id=$2 and irn is null returning id',[invoiceId,ctx.hospitalId,g,g?opt(b.name):null,g?opt(b.address):null,g?pin:null])).rows[0];if(!r)throw new HttpError(409,'Bill not found, or already registered for e-invoice.');await audit(db,ctx,'invoice_buyer','invoice',invoiceId,{gstin:g});return {ok:true}}

const dmy=(d:Date)=>{const x=new Date(d.getTime()+330*60000);return `${String(x.getUTCDate()).padStart(2,'0')}/${String(x.getUTCMonth()+1).padStart(2,'0')}/${x.getUTCFullYear()}`}
/** e-invoice JSON (NIC IRP schema 1.1) for a business bill. Upload it on the e-invoice portal, then save the IRN here. */
export async function einvoiceJson(db:Db,ctx:Ctx,invoiceId:string){requireRole(ctx,[...ROLES]);const inv=(await db.query('select i.*,h.gstin,h.legal_name,h.name hname,h.address haddr,h.city,h.pincode,h.contact_phone,h.contact_email from invoices i join hospitals h on h.id=i.hospital_id where i.id=$1 and i.hospital_id=$2',[invoiceId,ctx.hospitalId])).rows[0];if(!inv)throw new HttpError(404,'Invoice not found.')
 const miss:string[]=[];if(!inv.gstin)miss.push('hospital GSTIN (Settings → Hospital)');if(!inv.pincode)miss.push('hospital PIN code (Settings → Hospital)');if(!inv.buyer_gstin)miss.push('buyer GSTIN on this bill');if(!inv.buyer_pincode)miss.push('buyer PIN code');if(miss.length)throw new HttpError(409,'Needed for an e-invoice: '+miss.join(', ')+'.')
 const g=await gstBreakup(db,invoiceId);const addr=(s:string|null)=>String(s||'').slice(0,100)||'NA'
 return {Version:'1.1',TranDtls:{TaxSch:'GST',SupTyp:'B2B',RegRev:'N',IgstOnIntra:'N'},DocDtls:{Typ:'INV',No:String(inv.invoice_no).slice(-16),Dt:dmy(new Date(inv.created_at))},
  SellerDtls:{Gstin:inv.gstin,LglNm:inv.legal_name||inv.hname,TrdNm:inv.hname,Addr1:addr(inv.haddr),Loc:inv.city||'NA',Pin:Number(inv.pincode),Stcd:inv.gstin.slice(0,2),Ph:opt(inv.contact_phone)?.replace(/\D/g,'').slice(-12)||undefined,Em:opt(inv.contact_email)||undefined},
  BuyerDtls:{Gstin:inv.buyer_gstin,LglNm:inv.buyer_name,Pos:inv.buyer_gstin.slice(0,2),Addr1:addr(inv.buyer_address),Loc:'NA',Pin:Number(inv.buyer_pincode),Stcd:inv.buyer_gstin.slice(0,2)},
  ItemList:g.lines.map((l,k)=>({SlNo:String(k+1),PrdDesc:l.description.slice(0,300),IsServc:(l.hsn||'').startsWith('99')?'Y':'N',HsnCd:l.hsn||'9993',Qty:l.quantity,Unit:(l.hsn||'').startsWith('99')?'OTH':'NOS',UnitPrice:r2(l.unitPrice*100/(100+l.rate)),TotAmt:r2(l.amount*100/(100+l.rate)),Discount:r2(l.discount*100/(100+l.rate)),AssAmt:l.taxable,GstRt:l.rate,IgstAmt:l.igst,CgstAmt:l.cgst,SgstAmt:l.sgst,TotItemVal:r2(l.taxable+l.cgst+l.sgst+l.igst)})),
  ValDtls:{AssVal:g.totals.taxable,CgstVal:g.totals.cgst,SgstVal:g.totals.sgst,IgstVal:g.totals.igst,TotInvVal:g.totals.invoice,RndOffAmt:r2(g.totals.invoice-(g.totals.taxable+g.totals.tax))}}}
export async function recordIrn(db:Db,ctx:Ctx,invoiceId:string,b:any){requireRole(ctx,['admin','billing']);const irn=opt(b.irn);if(!irn||!/^[0-9a-f]{64}$/i.test(irn))throw new HttpError(400,'IRN is the 64-character code from the e-invoice portal.')
 const r=(await db.query('update invoices set irn=$3,irn_ack_no=$4,irn_ack_date=$5 where id=$1 and hospital_id=$2 and buyer_gstin is not null returning id',[invoiceId,ctx.hospitalId,irn.toLowerCase(),opt(b.ackNo),b.ackDate?new Date(b.ackDate):new Date()])).rows[0];if(!r)throw new HttpError(409,'Only a bill with a buyer GSTIN can carry an IRN.');await audit(db,ctx,'invoice_irn','invoice',invoiceId);return {ok:true}}

const x=(s:any)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const ymd=(d:Date)=>new Date(d.getTime()+330*60000).toISOString().slice(0,10).replace(/-/g,'')
const range=(from:string,to:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw new HttpError(400,'Pick a valid date range.');return [new Date(from+'T00:00:00+05:30'),new Date(Date.parse(to+'T00:00:00+05:30')+86400e3)]}
/** Tally Prime import (XML): a Sales voucher per bill (sales ledger per GST rate, CGST/SGST/IGST ledgers) and a Receipt voucher per payment. */
export async function tallyXml(db:Db,ctx:Ctx,from:string,to:string){requireRole(ctx,['admin','billing']);const [a,b]=range(from,to)
 const invs=(await db.query("select i.id,i.invoice_no,i.created_at,coalesce(i.buyer_name,p.full_name) party,p.uhid from invoices i join patients p on p.id=i.patient_id where i.hospital_id=$1 and i.status<>'cancelled' and i.created_at>=$2 and i.created_at<$3 order by i.created_at",[ctx.hospitalId,a,b])).rows
 const pays=(await db.query("select p.amount::float amount,p.mode,p.reference,p.received_at,i.invoice_no,coalesce(i.buyer_name,pt.full_name) party from payments p join invoices i on i.id=p.invoice_id join patients pt on pt.id=i.patient_id where p.hospital_id=$1 and p.received_at>=$2 and p.received_at<$3 order by p.received_at",[ctx.hospitalId,a,b])).rows
 const v:string[]=[];const led=(name:string,amt:number,deemed:boolean)=>`<ALLLEDGERENTRIES.LIST><LEDGERNAME>${x(name)}</LEDGERNAME><ISDEEMEDPOSITIVE>${deemed?'Yes':'No'}</ISDEEMEDPOSITIVE><AMOUNT>${(deemed?-amt:amt).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`
 for(const i of invs){const g=await gstBreakup(db,i.id);if(!g.totals.invoice)continue;const party=`${i.party} (${i.uhid})`;const e=[led(party,g.totals.invoice,true)];for(const r of g.byRate){if(r.taxable)e.push(led(r.rate?`Sales @${r.rate}%`:'Sales - Exempt',r.taxable,false));if(r.cgst)e.push(led(`CGST @${r.rate/2}%`,r.cgst,false));if(r.sgst)e.push(led(`SGST @${r.rate/2}%`,r.sgst,false));if(r.igst)e.push(led(`IGST @${r.rate}%`,r.igst,false))}
  const round=r2(g.totals.invoice-g.totals.taxable-g.totals.tax);if(round)e.push(led('Round Off',round,false))
  v.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>${ymd(new Date(i.created_at))}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${x(i.invoice_no)}</VOUCHERNUMBER><PARTYLEDGERNAME>${x(party)}</PARTYLEDGERNAME><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${e.join('')}</VOUCHER></TALLYMESSAGE>`)}
 for(const p of pays){const party=p.party;const cash=p.mode==='cash'?'Cash':p.mode==='insurance'?'Insurance Receivable':'Bank';v.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Receipt" ACTION="Create"><DATE>${ymd(new Date(p.received_at))}</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><NARRATION>${x(`${p.invoice_no} · ${p.mode}${p.reference?' · '+p.reference:''}`)}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${led(cash,p.amount,true)}${led(party,p.amount,false)}</VOUCHER></TALLYMESSAGE>`)}
 return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>\n${v.join('\n')}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`}
/** GST summary for the accountant (GSTR-1 style): B2B bills, B2C totals by rate, and the HSN/SAC summary, as CSV. */
export async function gstSummaryCsv(db:Db,ctx:Ctx,from:string,to:string){requireRole(ctx,['admin','billing']);const [a,b]=range(from,to)
 const invs=(await db.query("select id,invoice_no,created_at,buyer_gstin,buyer_name from invoices where hospital_id=$1 and status<>'cancelled' and created_at>=$2 and created_at<$3 order by created_at",[ctx.hospitalId,a,b])).rows
 const q=(s:any)=>{const t=String(s??'');return /[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t};const out:string[]=['Section,Invoice / HSN,Date,Buyer GSTIN,Buyer,Rate %,Taxable value,CGST,SGST,IGST,Invoice value']
 const b2c=new Map<number,any>(),hsn=new Map<string,any>()
 for(const i of invs){const g=await gstBreakup(db,i.id);if(i.buyer_gstin)for(const r of g.byRate)out.push(['B2B',i.invoice_no,ymd(new Date(i.created_at)),i.buyer_gstin,i.buyer_name,r.rate,r.taxable,r.cgst,r.sgst,r.igst,g.totals.invoice].map(q).join(','))
  else for(const r of g.byRate){const t=b2c.get(r.rate)||{taxable:0,cgst:0,sgst:0,igst:0};t.taxable=r2(t.taxable+r.taxable);t.cgst=r2(t.cgst+r.cgst);t.sgst=r2(t.sgst+r.sgst);t.igst=r2(t.igst+r.igst);b2c.set(r.rate,t)}
  for(const l of g.lines){const k=(l.hsn||'NA')+'|'+l.rate;const t=hsn.get(k)||{hsn:l.hsn||'NA',rate:l.rate,qty:0,taxable:0,cgst:0,sgst:0,igst:0};t.qty+=l.quantity;t.taxable=r2(t.taxable+l.taxable);t.cgst=r2(t.cgst+l.cgst);t.sgst=r2(t.sgst+l.sgst);t.igst=r2(t.igst+l.igst);hsn.set(k,t)}}
 for(const [rate,t] of [...b2c.entries()].sort((m,n)=>m[0]-n[0]))out.push(['B2C','','','','',rate,t.taxable,t.cgst,t.sgst,t.igst,''].map(q).join(','))
 for(const t of hsn.values())out.push(['HSN',t.hsn,'','','Qty '+t.qty,t.rate,t.taxable,t.cgst,t.sgst,t.igst,''].map(q).join(','))
 return out.join('\n')+'\n'}
