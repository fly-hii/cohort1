# Cohort Payments Management

A free, local-first payment and expense workspace for Cohort Coworking Spaces. No package installation, paid service, or account is required. All interface assets are included and no third-party network requests are made.

## Run

Open a terminal in this folder and run:

```sh
python3 server.py

```

Then open http://127.0.0.1:4173 in your browser. On macOS, `start.command` runs the same server. Python 3 is required. Invoice extraction additionally requires macOS 13 or later and Apple Command Line Tools (already present on the development Mac). The first launch compiles the local recognition helper; later launches reuse it. Stop it with Control-C. Reuse the same browser and URL, including port, to access saved records.

## First steps

1. Explore the illustrative sample workspace.
2. In Settings, choose **Start empty workspace** when ready to use your own records.
3. Add locations, vendors, categories, and projects.
4. Create an invoice, select its category/location, and set approval to Approved when appropriate.
5. Record an actual payment after paying the vendor through your normal banking service. Partial payments are supported. The app never transfers money.
6. Review outstanding amounts and export CSV reports. Download a JSON backup regularly from Settings.

## Included

- Dashboard: expense totals, paid/outstanding/overdue amounts, six-month payments chart, category breakdown, location totals.
- Invoices: create/edit, vendor invoice-number uniqueness, approval tracking, dates, amount, notes, document URL, project attribution.
- Payments: full or partial payments, date, method, reference and notes; overpayment protection.
- Payment history and recent workspace activity.
- Create/edit/delete locations, vendors, categories, projects with budgets; deletion blocked for referenced records.
- Search and location/status filters; reports filtered by invoice issue-date range.
- CSV exports; JSON backups and validated restore; sample/empty workspace controls.
- Responsive navigation and layouts, keyboard-accessible forms and dialogs.

## Data and limitations

Records are stored in this browser's localStorage. Clearing website data, changing browser/profile, or changing host/port means this workspace is no longer available there. Backups are the portability and recovery mechanism. This is a single-device MVP, not a shared accounting system. There is no authentication, role enforcement, tamper-proof audit, bank integration, cloud sync, tax calculation, automatic recurring payments, or permanent receipt-file storage. Document URLs can be stored on invoices. Approval is a tracking field, not a security boundary. Expenses use the invoice's total INR amount; reports are operational summaries, not statutory accounts. Payments are immutable in this MVP; correct erroneous records through a carefully edited backup and restore.

## Source

- `dist/index.html`: app shell
- `dist/style.css`: responsive design
- `dist/app.js`: data, screens, forms, validation, exports

The interface has no package dependencies. The local server compiles the Swift extraction helper on first launch. `node --check dist/app.js` checks JavaScript syntax. `node test.cjs` runs isolated business-rule and rendering checks without modifying your browser data.


## Import PDFs and scans

Use **Import invoice** on Overview or Invoices, select one invoice, and click **Extract invoice**. The app reads text PDFs directly and uses Apple's on-device Vision text recognition for scanned PDFs and images. This is local ML-based OCR plus conservative label-based field suggestions, not a generative AI or cloud model.

Supported: PDF (1–10 pages), PNG, JPEG, HEIC/HEIF (one image); maximum 20 MB per document. English invoice labels are supported. Handwriting, unusual layouts, multilingual documents, blur and shadows may reduce accuracy. A PDF with a substantial text layer uses that layer; visually check documents with mixed scanned and digital content. No line-item, GST breakdown, or automatic category extraction is included. The total amount includes taxes as printed on the invoice.

Review the suggested vendor, invoice number, total, issue date, and due date against the preview. Choose the location and category. Missing fields remain blank. Numeric dates use day/month/year and ambiguous dates are flagged. Confirm the total is INR before saving; the app does not convert currencies. Approval defaults to Pending. A new vendor is created only when the reviewed invoice is saved. Exact duplicate source documents and duplicate vendor/invoice-number pairs are blocked.

Documents are sent only to the local server on this computer. Temporary files are removed after processing; originals are not retained in browser storage or backups. The reviewed fields, source filename, and document fingerprint are retained with the invoice. Keep your original receipt separately. Closing the import dialog discards the unsaved review.

Run the updated `start.command` or `python3 server.py`. The old `python3 -m http.server` command still serves the basic app but cannot perform extraction. No API key or cloud subscription is needed. The extraction helper is macOS-specific; other platforms can use the basic app but need a different OCR backend.

Validation: `node test.cjs` and `node test-import.cjs`. Native extraction was checked against synthetic text PDF, raster PDF, and PNG invoices. The local endpoint was checked for malformed uploads and cross-origin/token rejection.
