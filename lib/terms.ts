import {HttpError} from './services/core'

/** Version stored with each agreement. Matches the approved text dated 19 November 2026. */
export const TERMS_VERSION='2026-11-19'
export const REFUND_POLICY_URL='https://greynova.in/refund-policy.html'
export const RENEWAL_POLICY='2026-11-19'
export const COMPANY_LEGAL_NAME='GREYNOVA TECH SOLUTIONS PRIVATE LIMITED'
export const COMPANY_CIN='U63990JH2026PTC029571'

export const TERMS_TITLE='Refund & Payment Terms — Hospital Cloud and TailDesk (GREYNOVA TECH SOLUTIONS PRIVATE LIMITED)'
export const TERMS_STANDFIRST='Approved by Ashish Kumar on 19 Nov 2026. Last updated: 19 November 2026.'

/** Verbatim clauses. Do not paraphrase. */
export const TERMS_CLAUSES=[
 'Free trial. New organisations get a free trial (Hospital Cloud Clinic: 30 days; TailDesk: 14 days). No payment is taken during the trial. One trial per organisation; repeat sign-ups or duplicate accounts are not eligible.',
 '30-day money-back guarantee. If you are not satisfied, request a full refund within 30 days of your first paid subscription payment by writing to info@greynova.in. This applies once per organisation and only to the first payment of a new subscription.',
 'Not refundable: renewal payments after the first 30 days; partially used months or annual plans after the 30-day window; one-time setup, data migration, training or custom development; third-party usage charges (SMS, WhatsApp, payment gateway fees); add-on staff or support services already delivered.',
 'No refund on misuse. Accounts suspended for breach of terms, fraud, abuse, or chargebacks raised without first contacting us are not eligible for a refund.',
 'Refund method. Approved refunds are returned to the original payment method within 7–10 business days. Bank or currency conversion charges are not refundable. Prices may be displayed in your local currency; the refund equals the amount actually charged.',
 'Billing and renewal. Subscriptions are billed in advance and renew automatically each month unless cancelled before the renewal date. Cancelling stops the next renewal; access continues until the end of the paid period.',
 'Late or failed payment. If a payment fails we will send reminders; after 7 days the account may be limited to read-only, and after 30 days unpaid it may be suspended. Data is kept for 30 days after suspension for export and may be deleted after that.',
 'Taxes. Prices exclude applicable taxes (such as GST in India), which are added at checkout where required.',
 'Price changes. We give at least 30 days\' notice before any price change; it applies from your next renewal.',
 'Account owner responsibility. The organisation is responsible for its users, the accuracy of data it enters, and keeping login details secure.',
 'Liability. The service is provided "as is"; our total liability is limited to the fees paid in the 3 months before a claim.',
 'Governing law. Indian law; courts of Jharkhand have jurisdiction. GREYNOVA TECH SOLUTIONS PRIVATE LIMITED, CIN U63990JH2026PTC029571. Contact: info@greynova.in.',
]

export function assertTermsAgreed(b:any){
 if(b?.termsAgreed!==true)throw new HttpError(400,'Agree to the Terms and Refund policy before payment.')
 return {version:TERMS_VERSION,agreedAt:new Date()}
}
