/** Provider-agnostic LLM layer (OpenAI-compatible chat completions; Azure OpenAI incl. India regions).
 *  LLM_PROVIDER=openai|azure|compatible, LLM_API_URL, LLM_API_KEY, LLM_MODEL (Azure: deployment name), LLM_API_VERSION (Azure).
 *  Requests ask providers not to store/train (store:false on OpenAI; Azure OpenAI does not train on customer data). */
export type ChatMsg={role:'system'|'user'|'assistant';content:string}
export type LlmResult={text:string;tokens:number;model:string}
let testFetch:typeof fetch|null=null
export const __setLlmFetch=(f:typeof fetch|null)=>{testFetch=f}
export function llmConfigured(){return !!(process.env.LLM_API_KEY&&process.env.LLM_API_URL&&process.env.LLM_MODEL)}
export async function chat(messages:ChatMsg[],opts:{maxTokens?:number;json?:boolean}={}):Promise<LlmResult>{const p=(process.env.LLM_PROVIDER||'openai').toLowerCase(),base=String(process.env.LLM_API_URL||'').replace(/\/$/,''),key=String(process.env.LLM_API_KEY||''),model=String(process.env.LLM_MODEL||'')
 if(!key||!base||!model)throw Object.assign(new Error('AI is not configured'),{status:501})
 let url=base,headers:Record<string,string>={'content-type':'application/json'};const body:any={messages,temperature:0.2,max_tokens:opts.maxTokens||600}
 if(p==='azure'){url=`${base}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${process.env.LLM_API_VERSION||'2024-06-01'}`;headers['api-key']=key}
 else{if(!/\/chat\/completions$/.test(url))url=url+'/chat/completions';headers.authorization='Bearer '+key;body.model=model;if(p==='openai')body.store=false}
 if(opts.json)body.response_format={type:'json_object'}
 const r=await (testFetch||fetch)(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS||20000))});if(!r.ok)throw Object.assign(new Error('AI provider error '+r.status),{status:503})
 const j:any=await r.json();return {text:String(j?.choices?.[0]?.message?.content||''),tokens:Number(j?.usage?.total_tokens||0),model:String(j?.model||model)}}
