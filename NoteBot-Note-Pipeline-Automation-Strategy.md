# NoteBot Note Pipeline Automation Strategy

**Semi-Automatic Pipeline for Note Ingestion, Validation & Publishing**

February 2026 | NoteBot Engine V2
Platform: Node.js / TypeScript / Express / PostgreSQL / Redis

---

## 1. Executive Summary

NoteBot is an academic resource platform serving BUTEX textile engineering students. The platform organizes educational notes in a four-level hierarchy (**Level → Subject → Topic → Note**) with all files hosted on Google Drive.

The current note ingestion workflow is entirely manual: users submit notes via Google Form with Google Drive links, a Telegram bot notifies the admin, who must then download, validate access, rename files using a specific convention, upload to organized Drive folders, obtain shareable URLs, and finally insert note records into the database. During exam seasons, submission bursts of **20+ notes** make this a significant bottleneck.

This document proposes a **semi-automatic pipeline** that automates downloading, validation, and renaming while keeping the admin in the review/approval loop before uploading and database insertion. Estimated monthly cost: **$0–5**.

---

## 2. Current Workflow Analysis

### 2.1 Current Steps (All Manual)

1. User submits a Google Form containing: note title, subject, Google Drive file link, author name, batch number, year
2. Telegram bot sends a notification about the new submission
3. Admin opens the Google Drive link to check file accessibility
4. Admin downloads the PDF file manually
5. Admin renames the file to: `subject-note-name(author, batch, year).pdf`
6. Admin uploads the renamed file to the correct Google Drive folder (Level/Subject/Topic)
7. Admin copies the new shareable URL
8. Admin adds the note record to the database (currently manual, future via CMS)

### 2.2 Pain Points

| Pain Point | Impact | Frequency |
|---|---|---|
| Manual access validation | Files often not shared properly; wasted time on broken links | Every submission |
| Manual download & rename | Repetitive mechanical work, error-prone naming | Every submission |
| Folder navigation | Finding the right Level/Subject/Topic folder in Drive | Every submission |
| URL copy-paste to DB | Context-switching between Drive and database/code | Every submission |
| Burst handling | 20+ submissions during exam season overwhelm manual process | Seasonal |
| No validation pipeline | No automated check for duplicates, file format, or file size | Never caught |

---

## 3. Proposed Architecture: Semi-Automatic Pipeline

### 3.1 Architecture Overview

The pipeline has 4 stages with an **approval gate** between Stage 2 and Stage 3:

| Stage | Mode | Description |
|---|---|---|
| **1. TRIGGER** | Automatic | Google Form submission triggers processing via Apps Script `onFormSubmit` |
| **2. PROCESS** | Automatic | Validate access → Download file → Extract metadata → Rename → Stage |
| **3. REVIEW** | **Manual (Admin)** | Admin reviews processed files, approves/rejects via Telegram or CMS dashboard |
| **4. PUBLISH** | Auto on approval | Upload to Drive folder → Set permissions → Get URL → Insert DB record |

### 3.2 Why Semi-Automatic?

- Full automation risks uploading incorrect, duplicate, or low-quality notes without review
- The naming convention requires human judgment for edge cases (ambiguous subjects, multiple authors)
- Admin maintains quality control over what enters the platform
- Approval step can be as simple as a Telegram inline button (**Approve** / **Reject** / **Edit metadata**)

---

## 4. Detailed Technical Design

### 4.1 Stage 1: Form Submission Trigger

**Recommended: Google Apps Script with `onFormSubmit` trigger**

Google Apps Script is ideal for the trigger layer: zero infrastructure cost, native Google Forms integration, and reliable scaling for sporadic bursts. The trigger function extracts form data and forwards it to the processing service.

**How it works:**

1. An installable trigger is attached to the Google Form
2. On each submission, the trigger fires and extracts: Drive link, subject, author, batch, year, note title
3. The trigger sends a POST request to the processing service (Cloud Function or notebot-engine-v2 endpoint)
4. The trigger logs the submission to a Google Sheet for audit trail

**File ID extraction from Drive URLs:**

Parse file IDs from URLs matching `/d/([a-zA-Z0-9_-]+)/` or `/folders/([a-zA-Z0-9_-]+)/`. Handle formats: `/file/d/{id}/view`, `/open?id={id}`, `/drive/folders/{id}`.

```javascript
function extractFileId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
```

### 4.2 Stage 2: Automatic Processing

**Recommended: Node.js Cloud Function or endpoint within notebot-engine-v2**

#### Step 2a — Validate File Access

- Use Google Drive API `files.get` with metadata fields (`id, name, mimeType, size`) to verify read access
- **403** (no access): Notify admin via Telegram with the submitter's info and the inaccessible link
- **404** (not found): Notify admin that the file doesn't exist
- **Success**: Proceed to download
- Validate MIME type (must be `application/pdf` or supported format)
- Validate file size (reject over 50MB)

```javascript
async function validateAccess(drive, fileId) {
  try {
    const res = await drive.files.get({ fileId, fields: "id,name,mimeType,size" });
    if (res.data.mimeType !== "application/pdf") return { ok: false, reason: "not-pdf" };
    if (parseInt(res.data.size) > 50 * 1024 * 1024) return { ok: false, reason: "too-large" };
    return { ok: true, metadata: res.data };
  } catch (err) {
    return { ok: false, reason: err.code === 403 ? "no-access" : "not-found" };
  }
}
```

#### Step 2b — Download File

- Use Drive API `files.get` with `alt=media` and `responseType: 'stream'`
- Stream to temporary storage (Cloud Storage, `/tmp`, or local staging)
- Calculate file hash (MD5/SHA256) for duplicate detection

#### Step 2c — Extract/Validate Metadata

- Read PDF metadata using `pdf-parse` or `pdf-lib`: page count, title, creation date
- Cross-reference with form submission data
- **Optional AI**: Use an LLM vision model to extract author, subject, and details from the first page

#### Step 2d — Generate Standardized Filename

Apply naming convention and sanitize:

```
{subject}-{note-name}({author}, {batch}, {year}).pdf
```

Example: `math1-higher-engineering-mathematics(Rahman, 46, 2024).pdf`

```javascript
function generateFilename(subject, title, author, batch, year) {
  const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  return `${sanitize(subject)}-${sanitize(title)}(${author}, ${batch}, ${year}).pdf`;
}
```

#### Step 2e — Store in Staging

- Save the processed file to a **"Staging"** Google Drive folder
- Create a processing record with all metadata (original URL, new filename, subject, level, topic, validation results)
- Mark as `pending_review`

### 4.3 Stage 3: Admin Review & Approval

#### Option A — Telegram Bot Approval

Send a rich Telegram message with: proposed filename, extracted metadata, original submission details, and inline keyboard buttons:

```
📄 New Note Ready for Review

Title: Higher Engineering Mathematics
Subject: Math-I | Level: 1 | Batch: 46
Author: Rahman | Year: 2024
Pages: 245 | Size: 12.3 MB
Proposed name: math1-higher-engineering-mathematics(Rahman, 46, 2024).pdf

[✅ Approve]  [✏️ Edit]  [❌ Reject]
```

- **Approve**: Triggers Stage 4
- **Edit Metadata**: Opens a mini-conversation to correct fields
- **Reject**: Archives the file, optionally notifies submitter

#### Option B — Web Dashboard (CMS Integration)

- A review queue page in the CMS showing all pending notes
- Each entry shows: original file, proposed filename, metadata, validation status
- Supports inline metadata editing, PDF preview, and batch approval for burst periods
- Integrates naturally with the CMS being built

### 4.4 Stage 4: Publish on Approval

#### Step 4a — Upload to Organized Drive

- Map metadata to target folder: **Level → Subject → Topic**
- Maintain a **folder ID registry** in the database (maps each combination to a Drive folder ID)
- Upload using `files.create` with resumable upload

#### Step 4b — Set Sharing Permissions

```javascript
await drive.permissions.create({
  fileId,
  requestBody: { role: "reader", type: "anyone" },
  fields: "id",
});
```

This makes the file accessible via link but not findable in Drive search.

#### Step 4c — Get Shareable URL

```javascript
const file = await drive.files.get({ fileId, fields: "webViewLink,webContentLink" });
// webViewLink → for browser viewing (recommended)
// webContentLink → for direct download
```

#### Step 4d — Update Database

Insert note record via CMS API (or Drizzle ORM directly):

- `topicId`: Mapped from subject/topic metadata
- `title`: Note title from form submission
- `url`: The `webViewLink` from Google Drive
- `metadata`: `{ author, batch, year, originalSubmitter, submissionDate, pageCount, fileSize }`

Invalidate affected Redis cache keys (notes for the affected topic).

#### Step 4e — Notify

- Send Telegram confirmation: `"Note published: {filename} → {subject}/{topic}"`
- Optionally notify the submitter that their note is live

---

## 5. AI Enhancement Opportunities

### 5.1 Smart Metadata Extraction

Use an LLM (Claude API, GPT, or Gemini) with vision capabilities to analyze the first page of each PDF. Extract: subject area, author name, institution, year, topic classification. This auto-fills fields submitters leave blank or fill incorrectly. Cost: ~one API call per submission.

### 5.2 Duplicate Detection

- Compare file hashes (MD5/SHA256) against existing notes in the database
- Use text similarity (TF-IDF or embedding-based) on extracted text to catch near-duplicates (same content, different formatting)
- Flag for admin review instead of auto-rejecting

### 5.3 Quality Scoring

- **Page count check**: Flag suspiciously short (1-2 pages) or long (500+) files
- **OCR quality check**: Ensure the PDF contains readable text (not just scanned images with no OCR)
- **Relevance check**: Use embeddings to verify content matches the claimed subject

### 5.4 Smart Categorization

If the form only provides a subject name but not level/topic, use note content and existing DB structure to suggest the correct **Level → Subject → Topic** placement. Improve suggestions over time with existing metadata patterns.

---

## 6. Technology Recommendations

### 6.1 Recommended Stack

| Component | Recommended Tool | Rationale |
|---|---|---|
| Form Trigger | Google Apps Script | Zero cost, native Forms integration |
| Processing | Node.js Cloud Function or notebot-engine-v2 endpoint | TypeScript consistency, npm ecosystem |
| Staging Storage | GCS bucket or Drive "Staging" folder | Temporary holding before approval |
| Admin Review | Telegram Bot + CMS Dashboard | Telegram for mobile, CMS for batch ops |
| Drive Operations | `googleapis` npm (Drive API v3) | Full download/upload/permission control |
| PDF Processing | `pdf-parse` + `pdf-lib` | Lightweight, no cloud deps needed |
| AI Metadata | Claude API or Google Document AI | Extract metadata from PDF first pages |
| Database | Drizzle ORM → CMS API | Consistent with existing architecture |
| Cache | Redis (existing ioredis) | Invalidate topic/subject caches on publish |
| Orchestration | n8n (self-hosted) — optional | Visual workflow builder if preferred |

### 6.2 Alternative: n8n-Based Pipeline

For a visual, low-code approach: self-host n8n on a $5–10/month VPS.

**Flow:** Google Forms Trigger → Drive Download → Code node (rename) → Wait for Approval → Drive Upload → HTTP Request (DB update)

- **Pros:** Visual debugging, easy modifications, built-in retry
- **Cons:** Extra service to maintain, less TypeScript integration, harder to version-control

---

## 7. Implementation Roadmap

| Phase | Tasks | Validation |
|---|---|---|
| **Phase 1: Foundation** | Set up GCP project with Drive API. Create service account. Build Apps Script form trigger. Create validation endpoint. | Form submit → validation → Telegram notification |
| **Phase 2: Processing** | Implement file download via Drive API. Build naming convention function. Create staging folder. Add duplicate detection (hash). | Form submit → download → rename → stage → notify |
| **Phase 3: Approval** | Build Telegram bot inline keyboards (Approve/Edit/Reject). Implement metadata editing conversation. Add batch approval. | Full flow through Telegram approval |
| **Phase 4: Publish** | Implement Drive folder mapping. Build upload with permissions. Add DB insertion (Drizzle). Redis cache invalidation. | Full end-to-end pipeline |
| **Phase 5: AI** | Add pdf-parse metadata extraction. Integrate LLM first-page analysis. Quality scoring. Near-duplicate detection. | AI-assisted categorization working |
| **Phase 6: CMS** | Build review queue in CMS. Inline editing and batch ops. Telegram+CMS hybrid. Analytics dashboard. | CMS-based review operational |

---

## 8. Google Drive Folder Structure

Recommended hierarchy matching the database schema:

```
NoteBot-Resources/
├── Level-1/
│   ├── Math-I/
│   │   ├── Books/
│   │   ├── Questions/
│   │   └── Lab-Experiments/
│   ├── Chemistry-I/
│   ├── Physics-I/
│   └── ...
├── Level-2/
│   └── ...
├── Level-3/
│   └── ...
├── Level-4/
│   └── ...
├── Staging/          ← Files land here after processing, before approval
└── Rejected/         ← Rejected files moved here for reference
```

Maintain a **folder registry** in the database or a JSON config mapping each Level/Subject/Topic to a Google Drive folder ID. This eliminates folder search during upload.

---

## 9. Authentication & Security

### 9.1 Service Account Setup

- Create a GCP service account dedicated to NoteBot automation
- Grant `drive.file` scope (per-file access, least privilege)
- Share the NoteBot-Resources root folder with the service account email
- Store key JSON securely (env variable or Secret Manager, **NOT** in the repo)

### 9.2 Form Submission Validation

- Validate URLs are actual Google Drive links (regex)
- Verify file IDs exist and are accessible before processing
- Rate-limit processing (max 50 submissions/hour)
- Log all submissions with timestamp for audit

### 9.3 Telegram Bot Security

- Use webhook mode (not polling)
- Verify webhook secret token on incoming updates
- Restrict approval commands to admin user ID only

---

## 10. Cost Estimate

| Service | Free Tier | Est. Monthly Cost |
|---|---|---|
| Google Apps Script | Unlimited triggers, 6-min limit | $0 |
| Google Drive API | 1B requests/day | $0 |
| Cloud Functions | 2M invocations/month | $0 |
| Cloud Storage | 5GB free | $0 |
| Telegram Bot API | Unlimited | $0 |
| Claude API (AI) | Pay per token | ~$1–5/month |
| **Total** | — | **$0–5/month** |

---

## 11. Key Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Files not shared with service account | High | Auto-notify submitter with sharing instructions; offer pre-shared upload folder as alternative |
| Apps Script 6-min timeout | Medium | Offload heavy processing to Cloud Function; Apps Script only handles trigger + webhook |
| Incorrect AI categorization | Medium | Always require admin review; AI suggestions pre-filled but editable |
| API quota limits during bursts | Low | Exponential backoff; queue submissions for sequential processing |
| Service account key compromise | Low | Use Secret Manager; rotate keys quarterly; monitor API usage |

---

## 12. Quick Start: Minimum Viable Pipeline

For the fastest path to value, implement just these 3 components:

1. **Google Apps Script trigger** → Posts form data to a webhook URL on each submission
2. **`/process-submission` endpoint in notebot-engine-v2** → Validates access, downloads, renames, stages file, sends Telegram message with Approve/Reject buttons
3. **Telegram bot handler** → On Approve: uploads to Drive, gets shareable URL, inserts database record, invalidates cache

This gives you the core value (**automated download + rename + validation**) with minimal infrastructure. AI enhancements, CMS dashboard, and batch operations layer on later.

---

*End of Document*
