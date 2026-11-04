export type Intake = Record<string, string | boolean>;
export function intakeError(data: Intake): string {
  if (!String(data.first || "").trim() || !String(data.last || "").trim())
    return "Enter other names and surname.";
  if (String(data.first).length > 100 || String(data.last).length > 100)
    return "Names must be no longer than 100 characters.";
  if (!data.phone && !data.email) return "A phone number or email is required.";
  if (data.phone && !/^(?:\+234|234|0)?[789]\d{9}$/.test(String(data.phone)))
    return "Use a Nigerian mobile number.";
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email)))
    return "Check the email address.";
  if (String(data.note || "").trim().length < 5)
    return "Add registration source evidence (at least five characters).";
  if (Object.values(data).some((v) => String(v).length > 2000))
    return "A field exceeds 2,000 characters.";
  if (
    data.previousVisitDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.previousVisitDate)) ||
      !data.visitEvidence)
  )
    return "Use a full previous visit date (YYYY-MM-DD) and its evidence.";
  for (const [month, day] of [
    [data.birthdayMonth, data.birthdayDay],
    [data.anniversaryMonth, data.anniversaryDay],
  ]) {
    if (!month && !day) continue;
    const m = Number(month),
      d = Number(day);
    if (
      !Number.isInteger(m) ||
      !Number.isInteger(d) ||
      m < 1 ||
      m > 12 ||
      d < 1 ||
      d > new Date(Date.UTC(2000, m, 0)).getUTCDate()
    )
      return "Use valid celebration month/day pairs or leave both blank.";
  }
  return "";
}
/** RFC-style quoted fields, escaped quotes and CRLF. No delimiter guessing. */
export function readIntakeCSV(
  text: string,
): Array<{ line: number; data: Intake; error: string }> {
  if (text.length > 1048576) throw Error("Choose a CSV of 1 MB or less.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell.trim());
      cell = "";
      closed = false;
      if (c !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (c === "\r" && input[i + 1] === "\n") i++;
      }
    } else {
      if (closed || c === '"')
        throw Error(
          "Malformed CSV quoting. Export a comma-separated CSV and try again.",
        );
      cell += c;
    }
  }
  if (quoted) throw Error("A quoted CSV field was not closed.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2 || rows.length > 501)
    throw Error("Include a header and 1–500 people.");
  const headers = rows
    .shift()!
    .map((h) => h.toLowerCase().replace(/[\s-]+/g, "_"));
  const map: Record<string, string> = {
    first: "first",
    other_names: "first",
    first_name: "first",
    last: "last",
    surname: "last",
    phone: "phone",
    phone_number: "phone",
    email: "email",
    gender: "gender",
    occupation: "occupation",
    address: "address",
    contact_consent: "contactConsent",
    email_opt_in: "emailOptIn",
    sms_opt_in: "smsOptIn",
    previous_visit_date: "previousVisitDate",
    visit_evidence: "visitEvidence",
    note: "note",
    birthday_month: "birthdayMonth",
    birthday_day: "birthdayDay",
    anniversary_month: "anniversaryMonth",
    anniversary_day: "anniversaryDay",
  };
  if (
    new Set(headers).size !== headers.length ||
    headers.some((h) => !map[h]) ||
    new Set(headers.map((h) => map[h])).size !== headers.length
  )
    throw Error("Use the template headers, without duplicate columns.");
  if (
    !headers.some((h) => map[h] === "first") ||
    !headers.some((h) => map[h] === "last")
  )
    throw Error("Other names and surname columns are required.");
  const seen = new Set<string>();
  return rows.map((cells, index) => {
    const data: Intake = {
      contactConsent: true,
      emailOptIn: true,
      smsOptIn: true,
      note: "Direct CSV registration by staff",
    };
    let error =
      cells.length !== headers.length
        ? "Column count does not match the header."
        : "";
    headers.forEach((h, i) => {
      const key = map[h],
        v = cells[i] || "";
      if (["contactConsent", "emailOptIn", "smsOptIn"].includes(key)) {
        if (!v) return;
        if (!/^(true|false|yes|no|1|0)$/i.test(v))
          error = "Contact choices must be true/false or yes/no.";
        else data[key] = /^(true|yes|1)$/i.test(v);
      } else data[key] = v;
    });
    if (data.phone) data.phone = String(data.phone).replace(/[\s()-]/g, "");
    if (data.email) data.email = String(data.email).toLowerCase();
    if (!error) error = intakeError(data);
    const keys = [
      data.phone ? "p:" + String(data.phone).replace(/^(\+234|234|0)/, "") : "",
      data.email ? "e:" + data.email : "",
    ].filter(Boolean);
    if (keys.some((k) => seen.has(k)))
      error = "Duplicate phone or email within this file.";
    keys.forEach((k) => seen.add(k));
    return { line: index + 2, data, error };
  });
}
