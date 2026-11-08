import crypto from 'node:crypto'
/**
 * Fidelius (ABDM health-data encryption): ECDH on Curve25519 (X25519) + HKDF-SHA256 + AES-256-GCM.
 * salt = first 20 bytes of (senderNonce XOR requesterNonce), iv = last 12 bytes, key = HKDF(sharedSecret, salt, 32 bytes).
 * Ciphertext is base64(ciphertext || 16-byte GCM tag). Public keys go out as base64 X.509/SPKI DER; raw 32-byte keys are accepted too.
 */
const SPKI=Buffer.from('302a300506032b656e032100','hex'),PKCS8=Buffer.from('302e020100300506032b656e04220420','hex')
export type KeyPair={privateKey:string;publicKey:string;nonce:string}
export type KeyMaterial={cryptoAlg:'ECDH';curve:'Curve25519';dhPublicKey:{expiry:string;parameters:string;keyValue:string};nonce:string}
/** New ephemeral X25519 key pair and a 32-byte nonce (all base64). */
export function generateKeyPair():KeyPair{const k=crypto.generateKeyPairSync('x25519');return {privateKey:(k.privateKey.export({format:'der',type:'pkcs8'}) as Buffer).toString('base64'),publicKey:(k.publicKey.export({format:'der',type:'spki'}) as Buffer).toString('base64'),nonce:crypto.randomBytes(32).toString('base64')}}
export function keyMaterial(k:KeyPair,expiry=new Date(Date.now()+86400e3)):KeyMaterial{return {cryptoAlg:'ECDH',curve:'Curve25519',dhPublicKey:{expiry:expiry.toISOString(),parameters:'Curve25519/32byte random key',keyValue:k.publicKey},nonce:k.nonce}}
const pub=(b64:string)=>{const b=Buffer.from(b64,'base64');return crypto.createPublicKey({key:b.length===32?Buffer.concat([SPKI,b]):b,format:'der',type:'spki'})}
const priv=(b64:string)=>{const b=Buffer.from(b64,'base64');return crypto.createPrivateKey({key:b.length===32?Buffer.concat([PKCS8,b]):b,format:'der',type:'pkcs8'})}
function derive(ownPrivate:string,peerPublic:string,ownNonce:string,peerNonce:string){const a=Buffer.from(ownNonce,'base64'),b=Buffer.from(peerNonce,'base64');if(a.length!==32||b.length!==32)throw new Error('Fidelius nonces must be 32 bytes.');const x=Buffer.alloc(32);for(let i=0;i<32;i++)x[i]=a[i]^b[i]
 const shared=crypto.diffieHellman({privateKey:priv(ownPrivate),publicKey:pub(peerPublic)});const key=Buffer.from(crypto.hkdfSync('sha256',shared,x.subarray(0,20),Buffer.alloc(0),32));return {key,iv:x.subarray(20)}}
export function encrypt(plain:string,sender:{privateKey:string;nonce:string},requester:{publicKey:string;nonce:string}){const {key,iv}=derive(sender.privateKey,requester.publicKey,sender.nonce,requester.nonce);const c=crypto.createCipheriv('aes-256-gcm',key,iv);const ct=Buffer.concat([c.update(plain,'utf8'),c.final(),c.getAuthTag()]);return ct.toString('base64')}
export function decrypt(cipherB64:string,requester:{privateKey:string;nonce:string},sender:{publicKey:string;nonce:string}){const {key,iv}=derive(requester.privateKey,sender.publicKey,requester.nonce,sender.nonce);const all=Buffer.from(cipherB64,'base64');if(all.length<17)throw new Error('Ciphertext too short.');const d=crypto.createDecipheriv('aes-256-gcm',key,iv);d.setAuthTag(all.subarray(all.length-16));return Buffer.concat([d.update(all.subarray(0,all.length-16)),d.final()]).toString('utf8')}
export const checksum=(s:string)=>crypto.createHash('md5').update(s).digest('hex')
