import { deflateRawSync } from "node:zlib";
import type { JourneyReport, ReportRow } from "./model";
const text = (v: unknown) =>
  v == null
    ? "Not recorded"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
const safe = (v: unknown) => {
  const s = text(v);
  return /^[\s]*[=+@-]/.test(s) ? "'" + s : s;
};
export const reportColumns: [string, string][] = [
  ["name", "Name"],
  ["gender", "Gender"],
  ["occupation", "Occupation"],
  ["residential_address", "Address (current permissions)"],
  ["contact_consent", "Current recorded contact permission"],
  ["email_opt_in", "Current email preference"],
  ["whatsapp", "WhatsApp (current permissions)"],
  ["registration_source", "Registration source"],
  ["status", "Current recorded membership status"],
  ["legacy_member", "Legacy official member; date may be unknown"],
  ["archived_at", "Archived at; retained for historical reporting"],
  ["cohort_date", "Cohort date"],
  ["cohort_date_basis", "Date basis"],
  ["reported_first_visit", "Reported first visit"],
  [
    "undated_previous_visit_confirmed",
    "Previous visit confirmed; exact date unknown",
  ],
  [
    "previous_visit_known_before",
    "Known-before bound; not an actual visit date",
  ],
  ["attendance_first_visit", "First recorded church attendance"],
  ["phone", "Phone (current permissions)"],
  ["email", "Email (current permissions)"],
  ["worker_name", "Assigned friend (current)"],
  ["visit_purpose", "Visitor purpose"],
  ["followup_state", "Follow Through status (current)"],
  ["intention", "Membership interest (current)"],
  ["joined_by_period_end", "Official membership date by period end"],
  ["attempts_in_period", "Contact attempts in period"],
  ["successful_contacts_in_period", "Successful contacts in period"],
  ["last_contact", "Last contact by period end"],
  ["next_contact", "Next contact (current)"],
  ["followup_outcomes", "Period contact outcomes"],
  ["services_in_period", "Recorded church services in period"],
  ["church_attendance", "Period church attendance"],
  ["cfc_cohort", "CFC cohort (current)"],
  ["cfc_enrolled_on", "Actual CFC enrolment date"],
  ["certificate_awarded_on", "Actual certificate award date"],
  ["cfc_weeks_by_period_end", "CFC weeks attended by period end"],
  ["cfc_missed_by_period_end", "CFC recorded missed classes by period end"],
  ["cfc_completed_on", "CFC completion by period end"],
  ["certificate_number_now", "Certificate number (current)"],
  ["care_until", "Care review date (current)"],
  ["care_status", "Continuing care (current)"],
  ["ministry", "Ministry involvement history"],
  ["home_cells", "Home Cell history"],
];
export function reportCsv(report: JourneyReport) {
  const rows = [
    reportColumns.map((x) => x[1]),
    ...report.rows.map((r) =>
      reportColumns.map(([key]) =>
        safe(
          (["phone", "email", "whatsapp", "residential_address"].includes(
            key,
          ) &&
            r.contact_consent === false) ||
            (key === "email" && r.email_opt_in === false)
            ? "Withheld by current contact permissions"
            : r[key],
        ),
      ),
    ),
  ];
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","),
      )
      .join("\r\n")
  );
}
const xml = (value: unknown) =>
  text(value)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const col = (n: number): string =>
  n < 26
    ? String.fromCharCode(65 + n)
    : col(Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26));
// Small standards-based OOXML writer. All user-provided values are literal inline strings,
// never formulas. Stored ZIP entries avoid a runtime dependency on a workbook service.
function sheet(rows: unknown[][], summary = false) {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
    Array.from(
      { length: Math.max(1, rows[0]?.length || 1) },
      (_, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${summary ? (i === 0 ? 48 : 110) : i === 0 ? 28 : 24}" customWidth="1"/>`,
    ).join("") +
    "</cols><sheetData>" +
    rows
      .map(
        (r, i) =>
          `<row r="${i + 1}"${i === 0 ? ' ht="32" customHeight="1"' : ""}>` +
          r
            .map(
              (v, j) =>
                `<c r="${col(j)}${i + 1}" s="${i === 0 ? 1 : 0}"${typeof v === "number" && Number.isFinite(v) ? "" : ' t="inlineStr"'}>` +
                (typeof v === "number" && Number.isFinite(v)
                  ? `<v>${v}</v>`
                  : `<is><t xml:space="preserve">${xml(v)}</t></is>`) +
                "</c>",
            )
            .join("") +
          "</row>",
      )
      .join("") +
    '</sheetData><autoFilter ref="A1:' +
    col(Math.max(0, (rows[0]?.length || 1) - 1)) +
    Math.max(1, rows.length) +
    '"/></worksheet>'
  );
}
function zip(files: [string, string][]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, i) => {
    let n = i;
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const locals: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, "utf8"),
      filename = Buffer.from(name),
      compressed = deflateRawSync(data);
    let crc = 0xffffffff;
    for (const b of data) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(compressed.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(filename.length, 26);
    locals.push(h, filename, compressed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(compressed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(filename.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, filename);
    offset += h.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
export function reportXlsx(report: JourneyReport): Buffer {
  const nested: Record<string, string> = {
    followup_outcomes: "Contacts",
    church_attendance: "Church attendance",
    ministry: "Ministry",
    home_cells: "Home Cells",
  };
  const people = [
    reportColumns.map((x) => x[1]),
    ...report.rows.map((r) =>
      reportColumns.map(([key]) =>
        nested[key]
          ? `${Array.isArray(r[key]) ? r[key].length : 0} entries; see ${nested[key]}`
          : typeof r[key] === "number"
            ? r[key]
            : text(r[key]),
      ),
    ),
  ];
  const score: unknown[][] = [
    ["Metric", "Value"],
    ...Object.entries(report.scoreboard).map(([k, v]) => [
      k === "conversion_rate"
        ? "Visitor cohort conversion (%)"
        : k.replaceAll("_", " "),
      v == null ? "Not available" : v,
    ]),
    ["Period start", report.from],
    ["Period end", report.to],
    ...Object.entries(report.definitions).map(([k, v]) => [
      k === "conversion_rate"
        ? "Visitor cohort conversion (%)"
        : k.replaceAll("_", " "),
      v,
    ]),
  ];
  const history = (field: string, columns: [string, string][]): unknown[][] => [
    ["Person ID", "Name", ...columns.map((x) => x[1])],
    ...report.rows.flatMap((r) =>
      (Array.isArray(r[field]) ? (r[field] as ReportRow[]) : []).map((x) => [
        r.member_id,
        r.name,
        ...columns.map(([key]) =>
          typeof x[key] === "number" ? x[key] : text(x[key]),
        ),
      ]),
    ),
  ];
  const sheets: [string, unknown[][]][] = [
    ["Scoreboard", score],
    ["People", people],
    ["Friends analysis", [
      ["Assigned Friend", "People in report", "Joined by period end", "Contact attempts in period", "Conversations in period", "Overdue now", "CFC enrolled now"],
      ...(report.friend_summary || []).map(r=>['friend','people','joined_by_period_end','contact_attempts','conversations','overdue_now','cfc_enrolled_now'].map(k=>r[k]??'Not recorded')),
    ]],
    [
      "Contacts",
      history("followup_outcomes", [
        ["date", "Actual contact time"],
        ["method", "Method"],
        ["outcome", "Outcome"],
        ["successful", "Successful conversation"],
      ]),
    ],
    [
      "Church attendance",
      history("church_attendance", [
        ["date", "Service date"],
        ["service", "Service"],
        ["type", "Service type"],
        ["source", "Source"],
        ["verification", "Verification"],
        ["voided", "Voided evidence"],
      ]),
    ],
    [
      "Ministry",
      history("ministry", [
        ["team", "Team"],
        ["role", "Role"],
        ["joined", "Date joined"],
        ["left", "Date left"],
        ["currently_active", "Active now"],
      ]),
    ],
    [
      "Home Cells",
      history("home_cells", [
        ["cell", "Home Cell"],
        ["area", "Area"],
        ["assigned", "Date assigned"],
        ["left", "Date left"],
        ["currently_active", "Active now"],
      ]),
    ],
  ];
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        "</Types>",
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      "xl/workbook.xml",
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets
          .map(
            ([name], i) =>
              `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join("") +
        "</sheets></workbook>",
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF000956"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    ],
  ];
  sheets.forEach(([, rows], i) =>
    files.push([`xl/worksheets/sheet${i + 1}.xml`, sheet(rows, i === 0)]),
  );
  return zip(files);
}
