/** Radiology helpers shared by the server service and the browser (no database access here). */
export type Modality='xray'|'ct'|'mri'|'usg'|'mammo'|'fluoro'|'dexa'|'cardio'
export const MODALITIES:{id:Modality;label:string;dicom:string;ionising:boolean}[]=[{id:'xray',label:'X-ray',dicom:'DX',ionising:true},{id:'ct',label:'CT',dicom:'CT',ionising:true},{id:'mri',label:'MRI',dicom:'MR',ionising:false},{id:'usg',label:'Ultrasound',dicom:'US',ionising:false},{id:'mammo',label:'Mammography',dicom:'MG',ionising:true},{id:'fluoro',label:'Fluoroscopy',dicom:'RF',ionising:true},{id:'dexa',label:'DEXA',dicom:'DX',ionising:true},{id:'cardio',label:'ECG / Echo',dicom:'ECG',ionising:false}]
export const MODALITY_IDS=MODALITIES.map(m=>m.id)
export const modalityLabel=(m?:string|null)=>MODALITIES.find(x=>x.id===m)?.label||m||'—'
export const STUDY_STATUSES=['new','scheduled','acquired','reported','verified'] as const
/** Best guess of the modality from the catalogue test name ("CT Brain plain" → ct). */
export function inferModality(name:string):Modality{const s=' '+String(name||'').toLowerCase()+' '
 if(/mammo/.test(s))return 'mammo';if(/dexa|dxa|bone densit|bmd/.test(s))return 'dexa';if(/fluoro|barium|hsg|\bivp\b|\bmcu\b/.test(s))return 'fluoro';if(/\bmri\b|\bmr\b|magnetic/.test(s))return 'mri'
 if(/\bct\b|hrct|cect|ncct|computed tom/.test(s))return 'ct';if(/ecg|ekg|echo|2d echo|\btmt\b|holter/.test(s))return 'cardio';if(/usg|ultraso|sonograph|doppler|\bnt scan|anomaly scan/.test(s))return 'usg';return 'xray'}
/** DICOM Accession Number (SH, at most 16 characters): R + IST date (yymmdd) + 4-digit daily sequence. */
export const formatAccession=(yymmdd:string,seq:number)=>'R'+yymmdd+String(seq).padStart(4,'0')
export const ACCESSION_RE=/^[A-Za-z0-9-]{1,16}$/
/** DICOM UID: dotted numbers, no leading zeros, at most 64 characters. */
export const isDicomUid=(s:string)=>s.length<=64&&/^(0|[1-9]\d*)(\.(0|[1-9]\d*))+$/.test(s)
/** UUID-derived UID under the 2.25 root (ISO/IEC 9834-8), so no registered org root is needed. */
export function uidFromUuid(uuid:string){return '2.25.'+BigInt('0x'+uuid.replace(/-/g,'')).toString()}
/** Build the PACS viewer link from the hospital template. Placeholders: {studyUid} {accession} {uhid}. Null when a value it needs is missing. */
export function viewerUrl(template:string|null|undefined,v:{studyUid?:string|null;accession?:string|null;uhid?:string|null}):string|null{const t=String(template||'').trim();if(!t||!/^https?:\/\//i.test(t))return null
 const val:Record<string,string|null|undefined>={studyUid:v.studyUid,accession:v.accession,uhid:v.uhid};let miss=false
 const out=t.replace(/\{(studyUid|accession|uhid)\}/g,(_,k)=>{const x=val[k];if(!x){miss=true;return ''}return encodeURIComponent(x)});return miss?null:out}
/** Contrast / pregnancy safety check. An empty list means safe to acquire; otherwise a doctor must record an override. */
export function safetyIssues(s:{modality:string;contrast?:boolean;allergy_status?:string|null;creatinine?:number|string|null;pregnancy_status?:string|null},gender?:string|null):string[]{const out:string[]=[];const ion=!!MODALITIES.find(m=>m.id===s.modality)?.ionising;const female=String(gender||'').toLowerCase()==='female'
 if(s.contrast){if(!s.allergy_status||s.allergy_status==='unknown')out.push('Ask about contrast allergy');else if(s.allergy_status==='known')out.push('Known contrast allergy');const cr=s.creatinine==null||s.creatinine===''?null:Number(s.creatinine);if(['ct','mri','fluoro'].includes(s.modality)){if(cr==null)out.push('Serum creatinine not recorded');else if(cr>1.5)out.push(`Creatinine ${cr} mg/dL is high (over 1.5)`)}}
 if(female&&(ion||s.contrast)){if(s.pregnancy_status==='pregnant')out.push('Patient is pregnant');else if(!s.pregnancy_status||s.pregnancy_status==='unknown')out.push('Pregnancy status not confirmed')}
 return out}
export type ReportTemplate={technique:string;findings:string;impression:string}
/** Starting text for the report editor; the radiologist edits it. */
export const REPORT_TEMPLATES:Record<Modality,ReportTemplate>={
 xray:{technique:'Single frontal (PA) view.',findings:'Both lung fields are clear. No consolidation, collapse, pleural effusion or pneumothorax.\nCardiac size and mediastinum are within normal limits.\nBoth costophrenic angles are clear. Visualised bones and soft tissues are normal.',impression:'No significant abnormality detected.'},
 ct:{technique:'Axial sections acquired from vertex to base of skull without (and with) intravenous contrast. Multiplanar reformats reviewed.',findings:'Brain parenchyma shows normal grey-white matter differentiation. No intra- or extra-axial haemorrhage, mass or midline shift.\nVentricles and sulci are normal for age. Posterior fossa structures are normal.\nCalvarium is intact.',impression:'No acute intracranial abnormality.'},
 mri:{technique:'Multiplanar, multisequence MRI (T1, T2, FLAIR, DWI) without (and with) gadolinium.',findings:'No restricted diffusion to suggest acute infarct. No mass lesion or abnormal enhancement.\nVentricular system and basal cisterns are normal.\nNo abnormal signal in the brain parenchyma.',impression:'No significant abnormality detected.'},
 usg:{technique:'Real-time grey-scale and colour Doppler ultrasound of the abdomen and pelvis.',findings:'Liver: normal size and echotexture, no focal lesion. CBD and portal vein normal.\nGall bladder: well distended, no calculus or wall thickening.\nPancreas and spleen: normal.\nKidneys: normal size and corticomedullary differentiation, no calculus or hydronephrosis.\nUrinary bladder: normal.\nNo free fluid.',impression:'Normal ultrasound of the abdomen and pelvis.'},
 mammo:{technique:'Bilateral CC and MLO views.',findings:'Breast composition: ACR category B (scattered fibroglandular densities).\nNo mass, architectural distortion or suspicious calcification.\nSkin, nipple and axillae are normal.',impression:'BI-RADS 1: negative.'},
 fluoro:{technique:'Fluoroscopic study with oral / intraluminal contrast. Spot films obtained.',findings:'Contrast passes freely. Normal calibre and mucosal pattern.\nNo filling defect, stricture or leak.',impression:'Normal study.'},
 dexa:{technique:'DEXA of lumbar spine (L1–L4) and left hip.',findings:'Lumbar spine BMD: __ g/cm², T-score __, Z-score __.\nTotal hip BMD: __ g/cm², T-score __, Z-score __.\nFemoral neck T-score __.',impression:'Normal bone mineral density (WHO criteria).'},
 cardio:{technique:'12-lead resting ECG / 2D transthoracic echocardiography with colour Doppler.',findings:'Sinus rhythm, rate __ /min. Normal axis. No ST-T changes.\nAll cardiac chambers normal in size. No regional wall motion abnormality. LVEF __ %.\nValves normal. No pericardial effusion.',impression:'Normal study.'}}
