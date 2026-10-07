# MASTER STUDIO TERMS OF SERVICE & CLIENT SERVICES AGREEMENT

> **IMPORTANT LEGAL NOTICE**: This agreement is an operational baseline prepared specifically for **seanhalls.online**. It reflects the operational mechanics, intellectual property policies, and infrastructure realities of digital studio production. **You must have your licensed attorney review and adapt this document prior to formal execution or deployment with any client.**

---

**EFFECTIVE DATE**: [Date of Execution / Deposit Clearance]  
**SERVICE PROVIDER**: **seanhalls.online** ("Studio", "Company", "We", "Us")  
**CLIENT**: [Legal Entity / Individual Name] ("Client", "You")  

---

## RECITALS

WHEREAS, Studio is an independent technical engineering and digital design studio providing custom software architecture, web development, cloud operations, generative media, and technical infrastructure services; and

WHEREAS, Client desires to retain Studio to perform technical design, software engineering, development, consulting, hosting, or infrastructure operations as described in one or more Statements of Work ("SOW"), sprint roadmaps, or estimates;

NOW, THEREFORE, in consideration of the mutual covenants, terms, and conditions set forth herein, and for other good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the parties agree as follows:

---

## 1. STRUCTURE OF ENGAGEMENTS & THE LIFECYCLE MODEL

Every client engagement with Studio operates strictly under a four-stage operational and economic lifecycle:

```
[ Stage 1: INBOUND ]  -->  [ Stage 2: DEVELOPMENT ]  -->  [ Stage 3: HOSTING & OPS ]  -->  [ Stage 4: OUTBOUND ]
Onboarding & IAM            Active Sprints & Tooling       Runtime & Maintenance         Offboarding & Severance
```

1.1. **Statements of Work (SOW)**. All professional services, sprints, milestones, deliverables, and associated compensation shall be defined in an accompanying SOW, proposal, or written sprint agreement referencing these Terms of Service. In the event of any conflict between these Terms of Service and an SOW, these Terms of Service shall prevail unless the SOW explicitly identifies the section of these Terms to be superseded.

1.2. **Zero-Code Policy Prior to Execution**. Studio adheres to a strict Zero-Code Policy: no development, architectural implementation, code authoring, or repository initialization shall commence until:
(a) This Agreement and the applicable SOW are executed by authorized representatives of both parties; and  
(b) The initial onboarding fee and required milestone deposit have been cleared in Studio’s designated operating account.

---

## 2. STAGE 1: INBOUND & ONBOARDING

2.1. **Inbound Setup Fee**. Unless otherwise expressly waived in writing in the SOW, all new client engagements require a mandatory, non-refundable **Inbound Onboarding & Environment Provisioning Fee** (standard minimum of $1,500 USD, or a dedicated 10-hour kickoff retainer). This fee covers technical discovery, credential auditing, repository scaffolding, environment provisioning, and DNS/registrar architecture.

2.2. **Credential & Identity Management (IAM)**.
(a) Client is solely responsible for supplying Studio with functional, verified administrative credentials, API access tokens, registrar management access, and third-party platform authorizations required to initiate the project.  
(b) All credentials must be transferred through Studio's encrypted credential protocol (e.g., 1Password encrypted share or designated password vault).  
(c) Time spent by Studio recovering lost passwords, troubleshooting client-side two-factor authentication (2FA) lockouts, resolving registrar ownership disputes, or fixing broken upstream DNS delegations shall be billed at Studio’s standard hourly engineering rate ($200 USD/hr) and is not included in fixed-fee development deliverables.

2.3. **Technical Scoping & Discovery**. Architectural scoping, technical specification authoring, and system design sessions conducted prior to full SOW execution are deemed technical consulting. If Client elects not to proceed with development following discovery, Studio shall invoice for all accrued discovery hours at standard rates, and Client shall receive the technical specification artifact upon payment.

---

## 3. STAGE 2: DEVELOPMENTAL ACTIVITIES & CHANGE CONTROL

3.1. **Sprint Deliverables & Acceptance Criteria**. All software engineering deliverables shall be specified in the SOW with clear, objective Acceptance Criteria. 

3.2. **Acceptance Review Period**. Upon Studio’s notification that a milestone or deliverable has been deployed to staging, Client shall have five (5) business days ("Acceptance Window") to test and verify the deliverable against the agreed Acceptance Criteria.  
(a) If Client fails to deliver written notice of material defects within the Acceptance Window, the deliverable shall be deemed irrevocably accepted and approved for milestone billing or production deployment.  
(b) Notice of material defect must state with technical specificity the exact manner in which the deliverable fails to conform to the Acceptance Criteria.

3.3. **Scope Control & Informal Communications**. Minor revisions, ad-hoc feature requests, and informal directions submitted via chat platforms (Slack, Discord, SMS), emails, or verbal meetings do not constitute approved scope changes. 

3.4. **Change Orders**. Any modification to system architecture, user flows, database schemas, third-party integrations, or visual designs not explicitly set forth in the SOW must be formalized in a written Change Order specifying the revised budget, hourly impact, and timeline extension. Studio shall not execute scope modifications until the Change Order is signed and any required supplemental deposit is received.

3.5. **Third-Party API Accounts & Pass-Through Costs**.
(a) **Direct Client Billing (Default)**: Client must maintain and fund active direct billing accounts with all third-party service providers necessary for project execution, including but not limited to: cloud infrastructure (GCP, AWS), domain registrars, AI/LLM model providers (OpenAI, Anthropic, Google Gemini), vector databases, transactional email services (SendGrid, Postmark), SMS gateways (Twilio), payment processors (Stripe), and premium fonts/assets.  
(b) **Studio-Managed Pass-Through**: If Studio agrees in writing to provision or absorb any third-party software, API, or infrastructure costs on Client’s behalf, such expenses shall be invoiced to Client at **Actual Direct Cost plus a twenty percent (20%) administrative and management handling fee**.  
(c) **Service Suspension for Third-Party Failures**: Studio is not liable for project delays, downtime, or functional failures resulting from Client’s expired credit cards, API rate-limiting, terms of service violations with third-party providers, or platform deprecations.

---

## 4. STAGE 3: HOSTING, INFRASTRUCTURE & MAINTENANCE ("WHOLE OTHER SHEBANG")

4.1. **Hosting Classification: Managed Shared Infrastructure**. Unless Client has contracted for a dedicated, isolated server cluster under an Enterprise Hosting SOW, all hosting provided by Studio on Studio-managed servers (including `seanhalls.online` infrastructure nodes) is categorized as **Managed Shared Infrastructure**.

4.2. **Best-Effort Operational Availability & No Uptime Warranty**.
(a) Studio provides operational maintenance and monitoring on a **Best-Effort Basis** during standard business hours (Monday through Friday, 9:00 AM to 6:00 PM Mountain Time, excluding federal holidays).  
(b) **STUDIO DOES NOT WARRANT OR GUARANTEE 100%, 99.99%, OR UNINTERRUPTED UPTIME.**  
(c) Studio explicitly disclaims all service level agreements (SLAs), financial credits, or breach of contract claims arising from server downtime, upstream network outages, data center fires, fiber cuts, DDoS attacks, DNS propagation delays, or cloud provider service interruptions.  
(d) Enterprise clients requiring high-availability guarantees, multi-region failover, or 24/7/365 emergency response must execute a dedicated **Tier-3 Enterprise Infrastructure Rider** with contracted monthly minimums starting at $5,000 USD/month.

4.3. **Scheduled Maintenance & Security Windows**. Studio reserves the right to execute routine maintenance, security patch applications, kernel updates, web server reloads, and database vacuuming between the hours of 11:00 PM and 5:00 AM Mountain Time. Scheduled maintenance shall not be considered an outage.

4.4. **Disaster Recovery, Backups, and Emergency Restores**.
(a) Studio implements automated routine daily baseline backups of databases and web files for active hosting accounts, retained on a rolling 14-day schedule.  
(b) Studio makes no representation that automated backups are free from corruption or loss. Client is strongly advised to maintain its own independent off-site data archives.  
(c) **Emergency Restoration Fees**: Point-in-time database rollbacks, forensic data reconstructions, or site restorations requested by Client due to client-side errors, accidental administrative deletions, unauthorized administrative password sharing, or third-party plugin compromises are **NOT** covered under standard hosting fees and shall be billed at Studio’s **Emergency Engineering Rate ($250 USD/hr)** with a two (2) hour minimum charge.

4.5. **Security Blast Radius & Client Dependency Indemnification**.
(a) If Client application utilizes open-source CMS frameworks (e.g., WordPress), community plugins, third-party node packages, or custom client-administered integrations, Client acknowledges that vulnerabilities within such third-party code constitute a significant operational risk.  
(b) Client agrees to defend, indemnify, and hold harmless Studio, its contractors, and affiliates from and against any and all claims, liabilities, losses, damages, fines, and legal fees resulting from:
(i) Security breaches or ransomware originating in unpatched client plugins, themes, or dependencies;  
(ii) Unauthorized access resulting from weak or compromised client passwords;  
(iii) Denial-of-service conditions or resource exhaustion caused by client code;  
(iv) Scraping, defamation, copyright infringement, or regulatory non-compliance of content published by Client.  
(c) **Immediate Isolation Authority**: Studio reserves the immediate right, without prior notice and without liability, to suspend, disable, or container-isolate any client application or website hosted on Studio infrastructure that exhibits active malicious activity, outbound spamming, crypto-mining, severe CPU/memory hogging threatening neighboring tenants, or an unmitigated vulnerability.

4.6. **Domain Registrars & DNS Maintenance**. Domain registration and renewal fees remain 100% Client’s legal and financial responsibility. Studio shall have zero liability if Client’s website or email goes offline due to Client’s failure to renew domain registrations, maintain active billing with domain registrars, or unauthorized DNS modifications made by Client or third parties.

---

## 5. STAGE 4: OUTBOUND, OFFBOARDING & REPOSITORY DETACHMENT

5.1. **Incorporation of Offboarding Addendum**. The technical and operational procedures governing project offboarding, hosting termination, repository transfer, database extraction, and developer handoff are set forth in the **Client Offboarding Addendum** ([CLIENT_OFFBOARDING_ADDENDUM.md](file:///Users/seanhalls/Desktop/sh/CLIENT_OFFBOARDING_ADDENDUM.md)), which is hereby incorporated into and made an integral part of these Terms of Service.

5.2. **Mandatory Standard Offboarding Package**. Client acknowledges that technical severance, code sanitization, secret scrubbing, and repository handover require substantial engineering labor. Upon termination of development or hosting services, Client agrees to pay Studio’s **Standard Offboarding Fee ($2,500 USD)**, or the agreed time-and-materials offboarding retainer, prior to the release or transfer of any code repositories, databases, or digital assets.

5.3. **Studio Lien & Payment Condition Precedent**.
> **CRITICAL RETENTION OF TITLE**: STUDIO RETAINS AN EXPRESS CONTRACTUAL AND ARTISAN’S LIEN OVER ALL SOFTWARE CODE, REPOSITORIES, DATABASE EXPORTS, SERVER CONFIGURATIONS, GRAPHICAL ASSETS, AND PRODUCTION CREDENTIALS. UNDER NO CIRCUMSTANCES SHALL STUDIO BE OBLIGATED TO TRANSFER GITHUB REPOSITORIES, DELIVER DATABASE ARCHIVES, OR ASSIST IN MIGRATIONS UNTIL ALL OUTSTANDING INVOICES, HOSTING BALANCES, PASS-THROUGH EXPENSES, AND THE OFFBOARDING FEE ARE PAID IN FULL (CLEARED FUNDS).

---

## 6. INTELLECTUAL PROPERTY RIGHTS & LICENSING

6.1. **Studio Background Technology & Core IP**. Studio retains sole and exclusive ownership of all right, title, and interest (including all patent, copyright, trademark, trade secret, and other intellectual property rights) in and to:
(a) All proprietary frameworks, boilerplates, starter themes, build scripts, development tools, CI/CD pipelines, and utility libraries authored by Studio prior to or independently of this Agreement;  
(b) Studio’s internal core codebases, including but not limited to `creativesguide.us`, `johnwalls.rocks`, `johnwalls.studio`, `seanhalls.online`, and `appreesh` architectures;  
(c) Generic, reusable algorithmic patterns, styling mixins, database schemas, and architectural knowledge developed during the course of the engagement ("Background IP").

6.2. **Conditional Assignment of Custom Deliverables**.
(a) Subject to Section 6.1 (Background IP) and Section 5.3 (Studio Lien), and **CONDITIONED EXPRESSLY UPON CLIENT’S PAYMENT IN FULL OF ALL ACCRUED INVOICES AND FEES**, Studio agrees to assign to Client all right, title, and interest in and to the unique, custom-authored software deliverables, graphic design assets, and copy created specifically for Client pursuant to a signed SOW ("Custom Deliverables").  
(b) Until full payment is received and verified, Studio grants Client a revocable, non-exclusive, non-sublicensable license to preview and test the Custom Deliverables solely in Studio’s staging environments. Any unauthorized commercial deployment, public distribution, or third-party replication of the Custom Deliverables prior to full payment constitutes willful copyright infringement.

6.3. **Perpetual License to Background IP**. To the extent Studio’s Background IP is embedded in or required to operate the Custom Deliverables, Studio grants Client, effective upon full payment, a perpetual, irrevocable, non-exclusive, worldwide, royalty-free license to use, execute, reproduce, and display such Background IP solely as integrated within the Custom Deliverables. Client may not extract, unbundle, redistribute, license, or sell Studio’s Background IP as a standalone framework, starter kit, or software tool.

6.4. **Portfolio & Promotional Rights**. Studio reserves the perpetual, non-exclusive right to display, reference, and link to Client's publicly launched deliverables, logos, and project screens within Studio’s portfolios, case studies, website (`seanhalls.online`), awards submissions, and social marketing channels, unless an explicit written Non-Disclosure Agreement (NDA) signed by Studio prohibits such disclosure.

---

## 7. INVOICING, FEES & REMEDIES FOR NON-PAYMENT

7.1. **Payment Terms**. Unless otherwise stated in an SOW:
(a) All milestone invoices are due **Net 15** days from invoice date.  
(b) Recurring hosting, maintenance, and retainer fees are billed on the first (1st) day of each calendar month and are due upon receipt.

7.2. **Late Fees & Interest**. Any balance remaining unpaid after the due date shall accrue interest at the rate of **one and one-half percent (1.5%) per month**, or the highest rate permitted by applicable law, whichever is less, calculated daily and compounded monthly from the date due until paid in full.

7.3. **Suspension of Services & Infrastructure Shutdown**.
(a) If any invoice remains unpaid fifteen (15) days following its due date, Studio reserves the right, upon twenty-four (24) hours' written email notice, to immediately suspend all active development, pause sprint cycles, and restrict repository access.  
(b) If any invoice remains unpaid thirty (30) days following its due date, Studio reserves the right to **unpublish, disable, or suspend Client’s live websites, web applications, and database instances hosted on Studio infrastructure**.  
(c) Studio shall not be liable for any damages, business interruption, loss of sales, SEO ranking degradation, or reputational harm suffered by Client as a result of a lawful suspension for non-payment.  
(d) A **Reactivation Fee of $500 USD**, plus all accrued late fees and outstanding balances, must be paid before suspended services or hosted websites are restored.

7.4. **Collection Expenses & Attorney's Fees**. Client agrees to reimburse Studio for all costs, expenses, court fees, and reasonable attorney's fees incurred by Studio in enforcing this Agreement or collecting past-due balances.

---

## 8. WARRANTIES & DISCLAIMERS

8.1. **Limited Developer Warranty**. Studio warrants that it will perform all professional services in a diligent, professional, and workmanlike manner in accordance with prevailing software development industry standards. Studio warrants that Custom Deliverables authored entirely by Studio will be free of material defects for a period of thirty (30) days following final acceptance ("Warranty Period"). Studio’s sole obligation and Client’s exclusive remedy under this warranty shall be for Studio to use commercially reasonable efforts to correct any reproducible material defect reported in writing during the Warranty Period.

8.2. **Warranty Exclusions**. The warranty set forth in Section 8.1 does not apply to:
(a) Defects resulting from client modifications, unauthorized code edits, or third-party developer interference;  
(b) Third-party software, open-source libraries, CMS core updates, npm packages, or plugins;  
(c) API breaking changes, deprecations, or policy changes enacted by external platforms (Apple, Google, Stripe, Meta, OpenAI);  
(d) Hosting, server, or network failures on infrastructure not wholly owned and operated by Studio;  
(e) Deliverables deployed or altered following technical offboarding.

8.3. **DISCLAIMER OF ALL OTHER WARRANTIES**.
> **EXCEPT AS EXPRESSLY SET FORTH IN SECTION 8.1, ALL DELIVERABLES, SERVICES, CODE, WEBSITES, HOSTING ENVIRONMENTS, AND INFRASTRUCTURE ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. STUDIO SPECIFICALLY DISCLAIMS ALL IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, FREEDOM FROM COMPUTER VIRUSES OR SECURITY VULNERABILITIES, AND ANY WARRANTIES ARISING OUT OF COURSE OF DEALING, USAGE, OR TRADE PRACTICE.**

---

## 9. LIMITATION OF LIABILITY

9.1. **CONSEQUENTIAL DAMAGES WAIVER**.
> **TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL STUDIO, ITS OFFICERS, EMPLOYEES, CONTRACTORS, OR AGENTS BE LIABLE TO CLIENT OR ANY THIRD PARTY FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES WHATSOEVER, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, LOSS OF REVENUE, LOSS OF DATA, LOSS OF GOODWILL, LOSS OF CUSTOMERS, REPUTATIONAL DAMAGE, WORK STOPPAGE, COMPUTER FAILURE, OR SYSTEM OUTAGES, REGARDLESS OF THE THEORY OF LIABILITY (WHETHER IN CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE), AND EVEN IF STUDIO HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.**

9.2. **AGGREGATE MONETARY LIABILITY CAP**.
> **IN ALL CIRCUMSTANCES, STUDIO’S TOTAL AGGREGATE MONETARY LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT, ANY SOW, HOSTING SERVICES, CODE DELIVERABLES, OR PROFESSIONAL SERVICES (WHETHER ARISING IN CONTRACT, TORT, BREACH OF WARRANTY, OR INDEMNITY) SHALL BE STRICTLY LIMITED TO AND SHALL NOT EXCEED THE TOTAL FEES ACTUALLY RECEIVED BY STUDIO FROM CLIENT UNDER THE SPECIFIC SOW GIVING RISE TO THE CLAIM DURING THE THREE (3) MONTH PERIOD IMMEDIATELY PRECEDING THE EVENT TRIGGERING LIABILITY.**

---

## 10. TERM, TERMINATION & SEVERANCE

10.1. **Term**. This Agreement commences on the Effective Date and continues in full force until terminated by either party in accordance with this Section 10.

10.2. **Termination for Convenience**. Either party may terminate an ongoing retainer, maintenance contract, or hosting service by providing thirty (30) days’ advance written notice to the other party. In the case of an active fixed-fee development SOW, Client may only terminate for convenience if Client pays for all milestones completed and all hours expended through the effective date of termination, plus a cancellation fee equal to fifteen percent (15%) of the remaining contract balance.

10.3. **Termination for Cause**. Either party may terminate this Agreement immediately upon written notice if the other party:  
(a) Commits a material breach of this Agreement and fails to cure such breach within ten (10) business days following receipt of written notice;  
(b) Becomes insolvent, files for bankruptcy protection, or assigns assets for the benefit of creditors.

10.4. **Post-Termination Obligations**. Upon termination:  
(a) Client shall immediately pay all outstanding invoices, unbilled hours, incurred third-party pass-through expenses, and the Offboarding Fee;  
(b) Studio shall execute offboarding procedures strictly in accordance with Section 5 and the Client Offboarding Addendum;  
(c) Sections 5, 6, 7, 8.3, 9, 10.4, 11, and 12 shall survive any termination or expiration of this Agreement.

---

## 11. CONFIDENTIALITY

11.1. **Definition**. "Confidential Information" means all non-public information disclosed by one party ("Disclosing Party") to the other party ("Receiving Party"), whether orally or in writing, that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and the circumstances of disclosure.

11.2. **Protection**. Receiving Party agrees to protect Disclosing Party’s Confidential Information using the same degree of care it uses for its own confidential assets (but not less than reasonable care), and agrees not to disclose such information to any third party except to contractors, legal advisors, and employees who have a direct need to know and are bound by confidentiality obligations at least as restrictive as those herein.

11.3. **Exclusions**. Confidential Information does not include information that: (a) is or becomes publicly known through no breach of Receiving Party; (b) was already known to Receiving Party without restriction; (c) is independently developed by Receiving Party without reference to Disclosing Party’s Confidential Information; or (d) is required to be disclosed pursuant to a valid judicial order or governmental subpoena.

---

## 12. GENERAL PROVISIONS

12.1. **Governing Law & Venue**. This Agreement, and all claims arising out of or relating hereto, shall be governed by and construed in accordance with the substantive laws of the **State of Utah** (or the designated state of Studio registration), without regard to its conflict of law principles. The parties agree that the state and federal courts located in the county of Studio’s principal office shall have exclusive personal and subject-matter jurisdiction over all disputes arising hereunder.

12.2. **Mandatory Pre-Litigation Mediation**. Before initiating any formal lawsuit or arbitration, the parties agree to participate in good-faith mediation before a mutually agreed neutral mediator. The costs of mediation shall be shared equally. If mediation fails to resolve the dispute within forty-five (45) days of the mediation request, either party may pursue litigation.

12.3. **Independent Contractor Status**. The relationship of Studio to Client is strictly that of an independent contractor. Nothing in this Agreement shall be construed to create a partnership, joint venture, agency, franchise, or employer-employee relationship between the parties.

12.4. **Force Majeure**. Neither party shall be liable for delays or failures in performance resulting from acts beyond its reasonable control, including acts of God, pandemics, labor strikes, civil disturbances, power outages, fiber cable disruptions, governmental regulations, wars, terrorism, denial-of-service attacks, or cloud hosting platform blackouts.

12.5. **Severability**. If any provision of this Agreement is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect, and the invalid provision shall be deemed modified to the minimum extent necessary to make it valid and enforceable.

12.6. **No Third-Party Beneficiaries**. This Agreement is for the sole benefit of the parties hereto and their permitted successors and assigns, and nothing herein confers any rights or remedies upon any third party.

12.7. **Entire Agreement & Amendments**. This Agreement, together with any executed SOWs and the Client Offboarding Addendum, constitutes the entire understanding between the parties concerning its subject matter, and supersedes all prior agreements, proposals, representations, and communications, whether oral or written. No amendment, modification, or waiver of any provision of this Agreement shall be effective unless in writing and signed by authorized representatives of both parties.

12.8. **Counterparts & Digital Signatures**. This Agreement may be executed in counterparts, each of which shall be deemed an original, and all of which together shall constitute one agreement. Signatures transmitted via PDF, DocuSign, HelloSign, or other cryptographic digital signature mechanisms shall be deemed binding and legally enforceable.

---

### IN WITNESS WHEREOF, the parties have executed this Master Terms of Service as of the Effective Date written below.

**STUDIO: seanhalls.online**  
By: __________________________________________________  
Name: Sean Halls  
Title: Principal & Lead Architect  
Date: ________________________________________________  

**CLIENT: [Client Legal Entity Name]**  
By: __________________________________________________  
Name: ________________________________________________  
Title: _______________________________________________  
Date: ________________________________________________  
