import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { reportCsv, reportXlsx } from "../src/lib/journey/export.ts";
const report = {
  from: "2026-10-01",
  to: "2026-10-31",
  total: 1,
  scoreboard: { new_visitors: 1, direct_joiners: 0, conversion_rate: null },
  definitions: {
    conversion: "Direct registrations are excluded.",
    missing: "Not recorded means unknown.",
  },
  rows: [
    {
      member_id: "fixture-id",
      name: '=HYPERLINK("bad")',
      phone: "+2348015550999",
      email: "fixture@example.invalid",
      ministry: [
        {
          team: "Choir & Media",
          role: "Volunteer",
          joined: null,
          left: null,
          currently_active: true,
        },
      ],
      home_cells: [
        {
          cell: "Fictional cell",
          area: "Test area",
          assigned: "2026-10-01",
          left: null,
          currently_active: true,
        },
      ],
      followup_outcomes: [
        {
          date: "2026-10-01",
          method: "phone",
          outcome: "positive",
          successful: true,
        },
      ],
      church_attendance: [
        {
          date: "2026-10-01",
          service: "First visit",
          type: "Not specified",
          source: "phone",
          verification: "self_report",
          voided: false,
        },
      ],
      cfc_weeks_by_period_end: 2,
    },
  ],
};
const csv = reportCsv(report);
assert(csv.includes("'=HYPERLINK"));
assert(csv.includes("'+2348015550999"));
assert(csv.includes("Not recorded"));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vbc-export-")),
  file = path.join(temp, "fixture.xlsx");
fs.writeFileSync(file, reportXlsx(report));
const checked = spawnSync(
  "python3",
  [
    "-c",
    `import zipfile,xml.etree.ElementTree as E,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 for n in z.namelist():
  if n.endswith('.xml') or n.endswith('.rels'): E.fromstring(z.read(n))
 ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
 wb=E.fromstring(z.read('xl/workbook.xml'))
 assert len(wb.find('s:sheets',ns))==6
 for n in z.namelist():
  if n.startswith('xl/worksheets/'):
   root=E.fromstring(z.read(n)); assert not root.findall('.//s:f',ns)
 assert b'Choir &amp; Media' in z.read('xl/worksheets/sheet5.xml')
 assert b'Not available' in z.read('xl/worksheets/sheet1.xml')
 print('PASS XLSX CRC, OOXML relationships, six readable sheets, literal cell strings, unknown values and XML escaping')`,
    file,
  ],
  { encoding: "utf8" },
);
assert.equal(checked.status, 0, checked.stderr);
console.log(checked.stdout.trim());
fs.rmSync(temp, { recursive: true, force: true });
console.log(
  "PASS CSV formula-injection prevention and intact phone identifiers",
);
