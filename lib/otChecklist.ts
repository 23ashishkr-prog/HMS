/** WHO Surgical Safety Checklist (2009). Pure data, shared by the OT service and the OT screen.
 *  kind 'check' must be ticked; kind 'choice' needs one of the listed answers. */
export type Phase='sign_in'|'time_out'|'sign_out'
export type Item={key:string;text:string;kind:'check'|'choice';options?:[string,string][]}
export const PHASES:{id:Phase;label:string;when:string}[]=[{id:'sign_in',label:'Sign in',when:'Before induction of anaesthesia'},{id:'time_out',label:'Time out',when:'Before skin incision'},{id:'sign_out',label:'Sign out',when:'Before the patient leaves the operating room'}]
export const WHO:Record<Phase,Item[]>={
 sign_in:[
  {key:'identity',text:'Patient has confirmed identity, site, procedure and consent',kind:'check'},
  {key:'site_marked',text:'Site marked',kind:'choice',options:[['yes','Yes'],['na','Not applicable']]},
  {key:'anaesthesia_check',text:'Anaesthesia machine and medication check complete',kind:'check'},
  {key:'pulse_oximeter',text:'Pulse oximeter on the patient and functioning',kind:'check'},
  {key:'allergy',text:'Does the patient have a known allergy?',kind:'choice',options:[['no','No'],['yes','Yes']]},
  {key:'airway',text:'Difficult airway or aspiration risk?',kind:'choice',options:[['no','No'],['yes','Yes, and equipment/assistance available']]},
  {key:'blood_loss_risk',text:'Risk of >500 ml blood loss (7 ml/kg in children)?',kind:'choice',options:[['no','No'],['yes','Yes, and two IVs/central access and fluids planned']]}],
 time_out:[
  {key:'team_intro',text:'All team members have introduced themselves by name and role',kind:'check'},
  {key:'confirm',text:'Surgeon, anaesthetist and nurse confirm patient, site and procedure',kind:'check'},
  {key:'surgeon_review',text:'Surgeon: critical or non-routine steps, case duration, anticipated blood loss',kind:'check'},
  {key:'anaesthesia_review',text:'Anaesthesia team: any patient-specific concerns',kind:'check'},
  {key:'nursing_review',text:'Nursing team: sterility (including indicator results) confirmed; equipment issues or concerns',kind:'check'},
  {key:'antibiotic',text:'Antibiotic prophylaxis given within the last 60 minutes',kind:'choice',options:[['yes','Yes'],['na','Not applicable']]},
  {key:'imaging',text:'Essential imaging displayed',kind:'choice',options:[['yes','Yes'],['na','Not applicable']]}],
 sign_out:[
  {key:'procedure_recorded',text:'Nurse confirms the name of the procedure recorded',kind:'check'},
  {key:'counts',text:'Instrument, sponge and needle counts are correct',kind:'choice',options:[['yes','Correct'],['na','Not applicable']]},
  {key:'specimen',text:'Specimen labelling (read labels aloud, including patient name)',kind:'choice',options:[['yes','Labelled'],['na','No specimen']]},
  {key:'equipment',text:'Any equipment problems to be addressed',kind:'choice',options:[['none','None'],['reported','Yes, reported']]},
  {key:'recovery',text:'Surgeon, anaesthetist and nurse review key concerns for recovery and management',kind:'check'}]}
const ok=(it:Item,v:unknown)=>it.kind==='check'?v===true||v==='true'||v==='on':(it.options||[]).some(o=>o[0]===v)
/** Items still unanswered in a phase (empty = phase complete). */
export const missing=(phase:Phase,a:Record<string,unknown>|null|undefined)=>WHO[phase].filter(it=>!ok(it,(a||{})[it.key]))
/** Keep only known keys with valid answers (plus a short free-text note). */
export function clean(phase:Phase,a:Record<string,unknown>|null|undefined){const out:Record<string,unknown>={};for(const it of WHO[phase]){const v=(a||{})[it.key];if(ok(it,v))out[it.key]=it.kind==='check'?true:v}const n=String((a||{}).note??'').trim().slice(0,500);if(n)out.note=n;return out}
