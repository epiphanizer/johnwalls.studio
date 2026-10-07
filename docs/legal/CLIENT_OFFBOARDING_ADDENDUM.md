# CLIENT OFFBOARDING & TECHNICAL TRANSITION ADDENDUM

> **IMPORTANT LEGAL NOTICE**: This addendum is an operational legal schedule prepared specifically for **seanhalls.online**. It coordinates with the **Master Studio Terms of Service** ([STUDIO_TERMS_OF_SERVICE.md](file:///Users/seanhalls/Desktop/sh/STUDIO_TERMS_OF_SERVICE.md)). **You must have your licensed attorney review and adapt this document prior to formal execution or deployment with any client.**

---

**SCHEDULE ATTACHMENT TO**: Master Studio Terms of Service & SOW  
**SERVICE PROVIDER**: **seanhalls.online** ("Studio")  
**CLIENT**: [Legal Entity / Individual Name] ("Client")  
**APPLICATION / CODEBASE IDENTIFIER**: [e.g., OCC Consulting / Ramone / Englander / Custom]  

---

## 1. PURPOSE & INTENT

1.1. **Operational Transition**. This Client Offboarding & Technical Transition Addendum ("Addendum") governs the technical, operational, and intellectual property transition of Client software applications, websites, code repositories, databases, and third-party platform delegations from Studio to Client or Client’s designated successor developer/host ("Successor").

1.2. **Governing Terms**. This Addendum is incorporated into and subject to the Terms of Service executed between the parties. Capitalized terms not defined herein shall have the meanings set forth in the Terms of Service.

---

## 2. CONDITION PRECEDENT: FINANCIAL CLEARANCE & STUDIO LIEN

2.1. **Mandatory Account Reconciliation (Zero-Balance Rule)**.
> **STUDIO RETAINS AN EXPRESS POSSESSORY, EQUITABLE, AND ARTISAN’S LIEN OVER ALL SOURCE CODE, REPOSITORIES, DATABASE DUMPS, DOMAIN POINTERS, ASSETS, AND CONFIGURATION FILES. UNDER NO CIRCUMSTANCES SHALL STUDIO BE REQUIRED TO COMMENCE OFFBOARDING PROCEDURES, EXPORT DATABASES, PURGE SECRETS, OR TRANSFER GITHUB REPOSITORY OWNERSHIP UNTIL CLIENT HAS ACHIEVED A VERIFIED ZERO-DOLLAR ($0.00) ACCOUNT BALANCE.**

2.2. **Settlement of All Outstanding Liabilities**. Prior to initiating technical offboarding, Client must pay and Studio must confirm receipt of cleared funds for:
(a) All historical unpaid invoices and accrued late interest;  
(b) All unbilled development, maintenance, or DevOps hours accrued through the effective termination date;  
(c) All unreimbursed third-party expenses, domain renewals, API consumption charges, or cloud fees incurred on Client's behalf; and  
(d) The **Standard Technical Offboarding Package Fee ($2,500 USD)** set forth in Section 3 below.

---

## 3. THE STANDARD TECHNICAL OFFBOARDING PACKAGE

3.1. **Fixed-Fee Package Scope ($2,500 USD)**. The Standard Technical Offboarding Package covers up to **eight (8) cumulative engineering hours** by senior Studio personnel to execute the following standardized technical transition activities:

| Phase | Offboarding Deliverable | Description & Technical Standard |
| :--- | :--- | :--- |
| **A. Database Export** | **Sanitized Database Archive** | A full, compressed logical dump (`.sql.gz` or `.tar.gz`) of Client's production and staging databases using `mysqldump`, `mariadb-dump`, or `pg_dump` with single-transaction consistency and SHA256 checksum verification. |
| **B. Code Sanitization** | **Repository Scrubbing & Secret Purge** | Automated scanning and purging of all Studio internal tokens, service account credentials, deploy keys, internal IP references, and private submodule dependencies. Creation of a clean `.env.example` template. |
| **C. Git Handover** | **Independent Repository Transfer** | Detachment of the repository from Studio git remotes. Ownership transfer of the repository to Client’s designated GitHub / GitLab organization, or delivery of a clean standalone repository tarball archive. |
| **D. Credential Audit** | **Secret Rotation & Revocation** | Revocation of Studio service accounts, SSH authorized keys, and administrative access from Client third-party accounts (AWS, GCP, Stripe, Sendgrid, Cloudflare). |
| **E. DNS / Network Handover** | **DNS Record Documentation** | Export of current zone files or delivery of precise DNS configuration records (A, CNAME, TXT, MX) for Client's new host. |
| **F. Documentation** | **Offboarding Manifest & Briefing** | A standardized `OFFBOARDING_SUMMARY.md` detailing database restore commands, recommended runtime versions (Node.js, PHP, Python), and environment variables. |

3.2. **Excluded Transition Services (Additional Billable Scope)**. The following activities are **EXCLUDED** from the Standard Offboarding Package and will NOT be performed by Studio unless separately contracted under a time-and-materials retainer at Studio’s standard rate of **$200 USD/hr** (or **$250 USD/hr** for emergency/rush turnaround):
(a) Deploying or configuring Client software on new third-party cloud infrastructure (e.g., AWS EC2, DigitalOcean, Heroku, WP Engine);  
(b) Troubleshooting, patching, or debugging software incompatibilities caused by PHP, Node.js, MariaDB, or OS version mismatches on Successor servers;  
(c) Live telephone, video conference, or in-person technical training of Successor personnel beyond delivery of the written Offboarding Manifest;  
(d) Migrating high-volume media files, S3 buckets, or video archives exceeding 10 GB in cumulative size;  
(e) Resolving domain registrar account lockouts or third-party merchant processor transitions.

---

## 4. TEN-DAY TRANSITION TIMELINE & PHASES

Upon confirmation of cleared funds for all outstanding balances and the Offboarding Fee, the transition shall proceed according to the following 10-business-day schedule:

```
[ Day 1 - 2 ]  -->  [ Day 3 - 5 ]  -->  [ Day 6 - 8 ]  -->  [ Day 9 - 10 ]
Notice & Settlement  Data Snapshot & Audit   Sanitization & Packaging  Handoff & Severance
```

* **Day 1–2 (Initiation & Lock)**: Written offboarding request received, account reconciliation completed, and Offboarding Fee cleared. Freeze date established for production database updates.
* **Day 3–5 (Extraction & Audit)**: Production database snapshot executed via `client-offboard.sh`. Inventory of active service accounts, third-party integrations, and DNS records finalized.
* **Day 6–8 (Sanitization & Packaging)**: Automated secret scrubbing executed on source code repository. Removal of private Studio submodules and proprietary build utilities. Generation of `MANIFEST.json` and cryptographic checksums.
* **Day 9–10 (Handoff & Execution)**: Deliverables uploaded to secure transfer vault. GitHub repository ownership invitation transmitted to Client organization. Execution of Section 7 (Mutual Release).

---

## 5. HOSTING DE-COMMISSIONING & DATA DESTRUCTION POLICY

5.1. **Host De-provisioning Date**. On the **tenth (10th) business day** following the initiation of offboarding (the "Cutover Date"), or immediately upon Client’s confirmation of receipt of the Offboarding Deliverables (whichever occurs first):
(a) Studio shall disable all virtual host configurations (Apache / NGINX / Caddy) routing traffic to Client applications on Studio infrastructure;  
(b) Studio shall stop and delete all runtime processes (PM2, systemd, Docker containers) associated with Client application;  
(c) Studio shall terminate all database user privileges and local staging endpoints.

5.2. **Client DNS Cutover Responsibility**. Client is solely responsible for pointing domain DNS records to its new host prior to the Cutover Date. Studio shall not be liable for site downtime, broken links, or email delivery failures resulting from Client’s failure to reconfigure DNS before the Cutover Date.

5.3. **Fourteen-Day Cold Retention Window**.
(a) Studio will retain an offline, encrypted cold storage snapshot of Client’s final database and codebase for exactly **fourteen (14) calendar days** following the Cutover Date ("Retention Window") to protect against corrupted client transfers.  
(b) Retrieval of backups from cold storage during the Retention Window requires an administrative extraction fee of **$500 USD**.  
(c) **PERMANENT EXPUNGEMENT**: UPON EXPIRATION OF THE 14-DAY RETENTION WINDOW, STUDIO SHALL PERMANENTLY, IRREVOCABLY PURGE AND OVERWRITE ALL COPIES OF CLIENT'S CODE, ASSETS, AND DATABASES FROM ALL STUDIO SERVERS, DRIVES, AND CLOUD STORAGE. STUDIO HAS ZERO OBLIGATION TO MAINTAIN OR RECOVER CLIENT DATA FOLLOWING THIS 14-DAY PERIOD.

---

## 6. INTELLECTUAL PROPERTY & PROPRIETARY SUBMODULE SEVERANCE

6.1. **Removal of Studio Core IP**. Client acknowledges that Studio applications frequently utilize proprietary Studio build pipelines, scss mixins, rapid deployment scripts, and internal utilities ("Studio Core IP").
(a) As part of the code sanitization process, Studio will detach and remove Studio Core IP from the exported repository.  
(b) Studio will provide standard, open-source or build-ready alternatives where necessary to allow standard compilation, but has no obligation to transfer or license proprietary Studio tooling for use on third-party projects.

6.2. **Confirmation of Assignment**. Conditioned upon full payment of the Offboarding Fee and all underlying invoices, Studio confirms that ownership of Custom Deliverables transfers to Client in accordance with Section 6.2 of the Master Terms of Service.

---

## 7. MUTUAL RELEASE, INDEMNITY & COMPLETE SEVERANCE

7.1. **Client Acceptance of Deliverables**. Client acknowledges that by accepting delivery of the Offboarding Deliverables (via repository transfer, download link, or archive delivery), Client has independently inspected or retained qualified technical personnel to inspect the deliverables.

7.2. **Complete Post-Transfer Release of Studio**.
> **EFFECTIVE UPON DELIVERY OF THE OFFBOARDING ARTIFACTS OR THE CUTOVER DATE (WHICHEVER IS EARLIER), CLIENT IRREVOCABLY RELEASES, ACQUITS, AND FOREVER DISCHARGES SEANHALLS.ONLINE, ITS MEMBERS, OPERATORS, EMPLOYEES, CONTRACTORS, AND AFFILIATES FROM ANY AND ALL CLAIMS, LIABILITIES, DEMANDS, ACTIONS, COSTS, OR LOSSES ARISING OUT OF OR RELATING TO:**
> 1. **DOWNTIME, PERFORMANCE DEGRADATION, OR SYSTEM FAILURE OCCURRING ON SUCCESSOR HOSTING ENVIRONMENTS;**
> 2. **DATA LOSS, CORRUPTION, OR SECURITY BREACHES OCCURRING SUBSEQUENT TO DATABASE EXPORT;**
> 3. **INCOMPATIBILITIES BETWEEN CLIENT APPLICATION AND THIRD-PARTY RUNTIMES, PACKAGES, OR API VERSIONS;**
> 4. **DNS RESOLUTION DELAYS, SSL CERTIFICATE EXPIRATIONS, OR DOMAIN SUSPENSIONS;**
> 5. **UNAUTHORIZED ACCESS RESULTING FROM CLIENT'S FAILURE TO ROTATE PASSWORDS OR CREDENTIALS DELIVERED IN THE OFFBOARDING MANIFEST.**

7.3. **Post-Handoff Indemnification**. Client agrees to defend, indemnify, and hold harmless Studio from any third-party claim, lawsuit, regulatory enforcement action, or consumer complaint arising from the operation, maintenance, or contents of the Client application following the Cutover Date.

---

## 8. CONFIRMATION OF TECHNICAL HANDOFF & SIGN-OFF

The parties execute this Addendum to confirm the terms of offboarding. Upon completion of technical delivery, the parties shall execute the Final Transition Confirmation below.

### IN WITNESS WHEREOF, the parties execute this Client Offboarding Addendum:

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

---

### SCHEDULE A: FINAL TECHNICAL TRANSITION CONFIRMATION & RECEIPT
*(To be signed by Client upon delivery of the Offboarding Package)*

I, ___________________________________, authorized representative of Client, hereby acknowledge and confirm that:
1. Client has received the sanitized repository transfer, database archives, and associated credentials specified in the Offboarding Manifest.
2. Client has tested or had opportunity to test the exported database and codebase.
3. Client acknowledges that all hosting, maintenance, and operational obligations of **seanhalls.online** terminate as of today's date, and the Mutual Release set forth in Section 7 of this Addendum is immediately effective.

**CLIENT SIGN-OFF**:  
Signature: ____________________________________________  
Date of Handoff Acceptance: __________________________  
Incoming Technical Contact / Successor Email: __________________________  
