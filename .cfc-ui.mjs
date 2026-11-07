"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";


const lessons = [1, 2, 3, 4, 5, 6, 7];
export const completedLessons = (p) => [
    ...new Set(p.attendance.filter((a) => a.status === "present").map((a) => a.lesson)),
];
const today = () => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
}).format(new Date());
const labelDate = (s) => new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
});
export default function CfcDashboard({ initial, embedded = false, }) {
    const [data, setData] = useState(initial), [tab, setTab] = useState("Classes"), [dark, setDark] = useState(false), [search, setSearch] = useState(""), [adding, setAdding] = useState(false), [memberSearch, setMemberSearch] = useState(""), [matches, setMatches] = useState([]), [lookupBusy, setLookupBusy] = useState(false), [attendanceSearch, setAttendanceSearch] = useState(""), [filter, setFilter] = useState("all"), [cohort, setCohort] = useState(""), [session, setSession] = useState(""), [person, setPerson] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [attendanceBack, setAttendanceBack] = useState("Classes"), [marks, setMarks] = useState({}), [correction, setCorrection] = useState("");
    async function load(query = "") {
        const r = await fetch("/api/cfc?search=" + encodeURIComponent(query), {
            cache: "no-store",
        });
        const d = await r.json();
        if (!r.ok)
            throw Error(d.message);
        setData(d);
        return d;
    }
    useEffect(() => {
        void load().catch((e) => setError(e.message));
        try {
            setDark(localStorage.getItem("hco-reference-theme") === "dark");
        }
        catch { }
    }, []);
    async function write(action, values) {
        const r = await fetch("/api/cfc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, data: values }),
        });
        const d = await r.json();
        if (!r.ok)
            throw Error(d.message);
    }
    async function save(action, values) {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await write(action, values);
            await load();
            setNotice("Saved successfully.");
            return true;
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Unable to save.");
            return false;
        }
        finally {
            setBusy(false);
        }
    }
    function form(action, fields) {
        return (_jsxs("form", { className: "cfc-form", onSubmit: async (e) => {
                e.preventDefault();
                const f = e.currentTarget;
                if (await save(action, Object.fromEntries(new FormData(f))))
                    f.reset();
            }, children: [fields, _jsx("button", { disabled: busy, children: {
                        enrol: "Enrol participant",
                        baptism_register: "Register member",
                        baptism_schedule: "Save schedule",
                        baptism_complete: "Confirm baptism",
                        certificate_issue: "Record issue",
                        certificate_ready: "Mark ready",
                        certificate_collect: "Confirm collection",
                    }[action] || "Save" })] }));
    }
    function matchesPerson(p, query) {
        const digits = query.replace(/\D/g, "").replace(/^0/, "");
        return (p.name.toLowerCase().includes(query.trim().toLowerCase()) ||
            (/^[+0-9 ()-]+$/.test(query) &&
                digits.length >= 3 &&
                !!p.phone?.replace(/\D/g, "").includes(digits)));
    }
    function memberLookup(action) {
        return (_jsxs("section", { className: "cfc-card", children: [_jsx("p", { children: "Choose an existing church member. A joining date is not required for confirmed long-standing members." }), _jsxs("form", { className: "cfc-search", onSubmit: async (e) => {
                        e.preventDefault();
                        setLookupBusy(true);
                        setError("");
                        setMatches([]);
                        try {
                            const r = await fetch("/api/cfc?search=" + encodeURIComponent(memberSearch.trim()), { cache: "no-store" });
                            const result = await r.json();
                            if (!r.ok)
                                throw Error(result.message);
                            setMatches(result.candidates);
                            if (!result.candidates.length)
                                setNotice("No confirmed members found.");
                        }
                        catch (e) {
                            setError(e instanceof Error ? e.message : "Member search failed.");
                        }
                        finally {
                            setLookupBusy(false);
                        }
                    }, children: [_jsx("input", { "aria-label": "Search church members", placeholder: "Name or phone number", required: true, minLength: 2, maxLength: 120, value: memberSearch, onChange: (e) => {
                                setMemberSearch(e.target.value);
                                setMatches([]);
                                setNotice("");
                            } }), _jsx("button", { disabled: lookupBusy, children: lookupBusy ? "Searching…" : "Find member" })] }), matches.length > 0 &&
                    form(action, _jsxs(_Fragment, { children: [_jsxs("label", { children: ["Member", _jsxs("select", { name: "member", required: true, children: [_jsx("option", { value: "", children: "Choose member" }), matches.map((p) => (_jsx("option", { value: p.id, children: p.name }, p.id)))] })] }), action === "enrol" && (_jsxs("label", { children: ["Cohort", _jsxs("select", { name: "cohort", required: true, defaultValue: cohort, children: [_jsx("option", { value: "", children: "Choose cohort" }), cohortOptions()] })] }))] }))] }));
    }
    function certificate(p, id, kind, milestone) {
        const action = !p.certificate_number
            ? "certificate_issue"
            : !p.certificate_ready_on
                ? "certificate_ready"
                : "certificate_collect";
        return (_jsxs("section", { className: "cfc-card", children: [_jsx("h3", { children: kind === "cfc" ? "CFC certificate" : "Baptism certificate" }), !milestone ? (_jsxs("p", { children: ["Record", " ", kind === "cfc" ? "approved CFC completion" : "actual baptism", " ", "first."] })) : (_jsxs(_Fragment, { children: [_jsxs("p", { children: [p.certificate_collected_on
                                    ? "Collected"
                                    : p.certificate_ready_on
                                        ? "Ready for collection"
                                        : p.certificate_number
                                            ? "Issued"
                                            : "Not issued", p.certificate_number && " · " + p.certificate_number] }), p.certificate_awarded_on && (_jsxs("p", { children: ["Issued: ", labelDate(p.certificate_awarded_on)] })), p.certificate_collected_on ? (_jsxs("p", { children: ["Collected ", labelDate(p.certificate_collected_on), p.certificate_collected_by_name &&
                                    " · handed over by " + p.certificate_collected_by_name] })) : (form(action, _jsxs(_Fragment, { children: [_jsx("input", { type: "hidden", name: "member", value: id }), _jsx("input", { type: "hidden", name: "kind", value: kind }), action === "certificate_issue" && (_jsxs("label", { children: ["Certificate number", _jsx("input", { name: "number", required: true, maxLength: 100 })] })), _jsxs("label", { children: [action === "certificate_issue"
                                            ? "Issue date"
                                            : action === "certificate_ready"
                                                ? "Ready for collection date"
                                                : "Collection date", _jsx("input", { type: "date", name: "date", required: true, defaultValue: today(), min: p.certificate_ready_on ||
                                                p.certificate_awarded_on ||
                                                milestone, max: today() })] })] })))] }))] }));
    }
    const current = data?.people.find((p) => p.id === person?.id) || person;
    const visiblePeople = (data?.people || []).filter((p) => (!cohort || p.cohorts.includes(cohort)) &&
        matchesPerson(p, search) &&
        (filter === "all" ||
            (filter === "complete"
                ? completedLessons(p).length === 7
                : completedLessons(p).length < 7)));
    const sessions = (data?.sessions || []).filter((s) => !cohort || s.cohort_id === cohort);
    function cohortOptions() {
        return data?.cohorts.map((c) => (_jsx("option", { value: c.id, children: c.name }, c.id)));
    }
    function exportCsv() {
        const rows = [
            ["Name", "Completed classes", "Missing classes", "Completed on"],
            ...visiblePeople.map((p) => [
                p.name,
                completedLessons(p).join(" / "),
                lessons.filter((n) => !completedLessons(p).includes(n)).join(" / "),
                p.completed_on || "",
            ]),
        ];
        const csv = rows
            .map((r) => r
            .map((v) => '"' +
            (/^[=+@\-\t\r]/.test(v) ? "'" : "") +
            v.replaceAll('"', '""') +
            '"')
            .join(","))
            .join("\r\n");
        const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = "CFC_Class_Progress.csv";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const orderedSessions = [...(data?.sessions || [])].sort((a, b) => a.held_on.localeCompare(b.held_on));
    const next = orderedSessions.find((s) => s.held_on >= today());
    const selected = orderedSessions.find((s) => s.id === session);
    const roster = selected
        ? (data?.people || []).filter((p) => p.cohorts.includes(selected.cohort_id))
        : [];
    const saved = (p) => p.attendance.find((a) => a.session_id === session)?.status;
    const changes = roster.filter((p) => !p.completed_on && marks[p.id] && marks[p.id] !== saved(p));
    const corrections = changes.filter(saved);
    const missed = (p) => [
        ...new Set(p.attendance
            .filter((a) => a.status === "absent" && !completedLessons(p).includes(a.lesson))
            .map((a) => a.lesson)),
    ].sort();
    const missing = current
        ? lessons.filter((n) => !completedLessons(current).includes(n))
        : [];
    const makeups = orderedSessions.filter((s) => missing.includes(s.lesson) && s.held_on >= today());
    const firstMakeup = makeups[0];
    const scheduledBaptisms = (data?.baptisms || [])
        .filter((p) => p.scheduled_on && !p.baptised_on)
        .sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on));
    const personBaptism = data?.baptisms?.find((p) => p.member_id === current?.id);
    const classDate = (s) => new Date(s.held_on + "T12:00:00Z").toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    });
    const baptismStatus = (p) => p?.baptised_on
        ? "Baptised · " + labelDate(p.baptised_on)
        : p?.scheduled_on
            ? "Scheduled · " + labelDate(p.scheduled_on)
            : p
                ? "Registered"
                : "Not registered";
    const avatar = (name) => name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase();
    function go(screen) {
        if (!embedded && typeof window.scrollTo === "function" && window.scrollY)
            window.scrollTo(0, 0);
        setTab(screen);
        setAdding(false);
        setSearch("");
        setMemberSearch("");
        setMatches([]);
        setNotice("");
        setError("");
    }
    function openPerson(p) {
        go("Person");
        setPerson(p);
    }
    function openAttendance(s) {
        setAttendanceBack(tab === "Plan" ? "Plan" : "Classes");
        go("Attendance");
        setSession(s.id);
        setMarks({});
        setCorrection("");
        setAttendanceSearch("");
    }
    function makeUpButton(s, p, label) {
        return p.cohorts.includes(s.cohort_id) ? (_jsx("span", { children: "Enrolled" })) : data?.canOrganize ? (_jsx("button", { className: "lx-btn lx-primary", disabled: busy, onClick: () => void save("enrol", { member: p.id, cohort: s.cohort_id }), children: label })) : (_jsx("span", { children: "Ask the coordinator to add this participant." }));
    }
    async function saveAttendance() {
        if (!selected ||
            busy ||
            !changes.length ||
            selected.held_on > today() ||
            (corrections.length && correction.trim().length < 5))
            return;
        setBusy(true);
        setError("");
        setNotice("");
        let count = 0;
        try {
            for (const p of changes) {
                const status = marks[p.id];
                await write("attendance", {
                    member: p.id,
                    session: selected.id,
                    status,
                    note: saved(p) ? correction.trim() : "",
                });
                count++;
                setData((prev) => prev && {
                    ...prev,
                    people: prev.people.map((row) => row.id !== p.id
                        ? row
                        : {
                            ...row,
                            attendance: [
                                ...row.attendance.filter((a) => a.session_id !== selected.id),
                                {
                                    session_id: selected.id,
                                    cohort_id: selected.cohort_id,
                                    lesson: selected.lesson,
                                    date: selected.held_on,
                                    status,
                                    cohort_name: prev.cohorts.find((c) => c.id === selected.cohort_id)?.name,
                                },
                            ],
                        }),
                });
                setMarks((prev) => {
                    const rest = { ...prev };
                    delete rest[p.id];
                    return rest;
                });
            }
            setCorrection("");
            setNotice("Attendance saved.");
        }
        catch (e) {
            const message = e instanceof Error ? e.message : "Could not save attendance.";
            setError((count ? count + " saved. " : "") +
                message +
                " Unsaved marks are still here.");
        }
        finally {
            setBusy(false);
        }
    }
    function baptismCard(p) {
        return (_jsxs("article", { className: "cfc-card", children: [_jsx("h2", { children: p.name }), _jsx("p", { children: p.baptised_on
                        ? "Baptised · " + labelDate(p.baptised_on)
                        : p.scheduled_on
                            ? "Scheduled · " + labelDate(p.scheduled_on)
                            : "Registered" }), !p.baptised_on && (_jsxs(_Fragment, { children: [form("baptism_schedule", _jsxs(_Fragment, { children: [_jsx("input", { type: "hidden", name: "member", value: p.member_id }), _jsxs("label", { children: ["Schedule baptism", _jsx("input", { type: "date", name: "date", required: true, min: today() })] })] })), form("baptism_complete", _jsxs(_Fragment, { children: [_jsx("input", { type: "hidden", name: "member", value: p.member_id }), _jsxs("label", { children: ["Actual baptism date", _jsx("input", { type: "date", name: "date", required: true, max: today() })] })] }))] })), certificate(p, p.member_id, "baptism", p.baptised_on)] }, p.member_id));
    }
    const back = tab === "Person"
        ? "People"
        : tab === "Attendance"
            ? attendanceBack
            : ["Plan", "Baptism"].includes(tab)
                ? "Classes"
                : "";
    const active = tab === "Person"
        ? "People"
        : ["Plan", "Baptism"].includes(tab)
            ? "Classes"
            : tab;
    const helpBar = (_jsxs("button", { className: "lx-helpbar", onClick: () => go("Help"), children: ["\u260E Need help? ", _jsx("strong", { children: "Call your Coordinator" })] }));
    return (_jsxs("main", { className: `lx-app cfc-app ${dark ? "lx-dark" : ""} ${embedded ? "cfc-embedded" : ""}`, children: [_jsxs("div", { className: "lx-screen", children: [_jsxs("header", { className: "lx-top", children: [back && (_jsxs("button", { type: "button", className: "lx-back", disabled: busy, onClick: () => go(back), children: ["\u2039 ", back === "Plan" ? "Plan classes" : back] })), _jsxs("div", { className: "lx-brand", children: [!back && _jsx("img", { src: "/assets/image-7d4e31b34082.png", alt: "" }), _jsxs("span", { children: [_jsx("small", { children: tab === "Attendance" && selected
                                                    ? "Class " + selected.lesson + " · " + classDate(selected)
                                                    : "Foundational Class" }), _jsx("b", { children: "Vine Branch Church" })] })] }), _jsx("button", { type: "button", className: "lx-theme", "aria-label": "Switch to " + (dark ? "light" : "dark") + " mode", onClick: () => {
                                    setDark(!dark);
                                    try {
                                        localStorage.setItem("hco-reference-theme", dark ? "light" : "dark");
                                    }
                                    catch { }
                                }, children: dark ? "☀" : "☾" })] }), _jsx("h1", { className: "lx-title", children: tab === "Person"
                            ? current?.name
                            : tab === "Attendance"
                                ? "Who came?"
                                : tab === "Plan"
                                    ? "Plan classes"
                                    : tab }), error && (_jsx("p", { className: "lx-alert", role: "alert", children: error })), notice && (_jsx("p", { className: "lx-notice", role: "status", children: notice })), !data ? (_jsxs(_Fragment, { children: [_jsx("p", { children: "Loading your classes\u2026" }), error && (_jsx("button", { className: "lx-btn", onClick: () => void load()
                                    .then(() => setError(""))
                                    .catch((e) => setError(e.message)), children: "Retry loading" }))] })) : (_jsxs(_Fragment, { children: [tab === "Classes" && (_jsxs(_Fragment, { children: [_jsxs("section", { className: "lx-card lx-plain cfc-next", children: [_jsx("span", { className: "lx-label", children: "NEXT CLASS" }), _jsx("h2", { children: next
                                                    ? "Class " + next.lesson + " · " + next.topic
                                                    : "No upcoming class scheduled" }), next && (_jsxs(_Fragment, { children: [_jsx("p", { className: "lx-muted", children: [
                                                            data.cohorts.find((c) => c.id === next.cohort_id)
                                                                ?.name,
                                                            classDate(next),
                                                            next.venue || "Venue to be confirmed",
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" · ") }), _jsx("button", { className: "lx-btn lx-primary", onClick: () => openAttendance(next), children: "\u2713 Take attendance" })] }))] }), _jsxs("section", { className: "lx-card lx-soft", children: [_jsx("h2", { children: "Needs a make-up class" }), data.people
                                                .filter((p) => !p.completed_on && missed(p).length)
                                                .slice(0, 5)
                                                .map((p) => (_jsxs("div", { className: "lx-person", children: [_jsx("span", { className: "lx-av", "aria-hidden": true, children: avatar(p.name) }), _jsxs("button", { className: "cfc-text-button lx-pt", onClick: () => openPerson(p), children: [_jsx("b", { children: p.name }), _jsxs("small", { className: "lx-warn-text", children: ["Missed", " ", missed(p)
                                                                        .map((n) => "Class " + n)
                                                                        .join(", ")] })] }), p.phone && (_jsx("a", { className: "lx-sq", href: "tel:" + p.phone, "aria-label": "Call " + p.name, children: "\u260E" }))] }, p.id))), !data.people.some((p) => !p.completed_on && missed(p).length) && (_jsx("p", { className: "lx-muted", children: "No missed classes to make up." }))] }), _jsx("section", { className: "lx-card lx-list", children: _jsxs("button", { className: "lx-task", onClick: () => go("Plan"), children: [_jsx("span", { "aria-hidden": true, children: "\u25A3" }), _jsxs("span", { className: "lx-tt", children: [_jsx("b", { children: "Plan classes" }), _jsx("small", { children: "Groups, dates and topics" })] }), _jsx("span", { "aria-hidden": true, children: "\u203A" })] }) }), _jsx("section", { className: "lx-card lx-list", children: _jsxs("button", { className: "lx-task", onClick: () => go("Baptism"), children: [_jsx("span", { "aria-hidden": true, children: "\u25C7" }), _jsxs("span", { className: "lx-tt", children: [_jsx("b", { children: "Baptism" }), _jsx("small", { children: scheduledBaptisms.length
                                                                ? scheduledBaptisms.length +
                                                                    " scheduled · " +
                                                                    labelDate(scheduledBaptisms[0].scheduled_on)
                                                                : "Register and schedule" })] }), _jsx("span", { "aria-hidden": true, children: "\u203A" })] }) }), helpBar] })), (tab === "Plan" || tab === "People") && (_jsxs("label", { className: "lx-field", children: ["Cohort", _jsxs("select", { value: cohort, onChange: (e) => setCohort(e.target.value), children: [_jsx("option", { value: "", children: "All cohorts" }), cohortOptions()] })] })), tab === "People" && (_jsxs(_Fragment, { children: [_jsx("button", { className: "cfc-primary", onClick: () => setAdding(!adding), "aria-expanded": adding, children: adding ? "Close enrolment" : "Add participant" }), adding && memberLookup("enrol"), _jsxs("label", { children: ["Search participants", _jsx("input", { placeholder: "Name or phone number", value: search, onChange: (e) => setSearch(e.target.value) })] }), _jsx("div", { className: "cfc-pills", children: [
                                            ["all", "All"],
                                            ["missing", "In progress"],
                                            ["complete", "7 of 7"],
                                        ].map(([key, name]) => (_jsx("button", { "aria-pressed": filter === key, onClick: () => setFilter(key), children: name }, key))) }), _jsx("button", { className: "cfc-secondary", onClick: exportCsv, children: "Export visible progress" }), visiblePeople.map((p) => (_jsxs("article", { className: "cfc-card", children: [_jsx("h2", { children: p.name }), _jsxs("p", { children: [completedLessons(p).length, " of 7 distinct classes completed"] }), _jsxs("div", { className: "cfc-actions", children: [_jsx("button", { onClick: () => openPerson(p), children: "View progress" }), p.phone && _jsx("a", { href: "tel:" + p.phone, children: "Call" })] })] }, p.id))), !visiblePeople.length && _jsx("p", { children: "No matching participants." })] })), tab === "Person" && current && (_jsxs(_Fragment, { children: [_jsxs("section", { className: "lx-card lx-plain", "aria-label": "Participant progress", children: [_jsxs("h2", { children: [completedLessons(current).length, " of 7 classes done"] }), _jsx("div", { className: "cfc-progress", role: "list", "aria-label": "Class progress", children: lessons.map((n) => {
                                                    const done = !missing.includes(n);
                                                    return (_jsx("span", { role: "listitem", "aria-label": `Class ${n}: ${done ? "done" : "missing"}`, className: done ? "done" : "missed", children: n }, n));
                                                }) }), missing.length > 0 && (_jsxs("p", { className: "lx-notice lx-warn", children: [_jsx("span", { children: "\u25A3" }), _jsxs("span", { children: [_jsxs("strong", { children: ["Missing ", missing.map((n) => "Class " + n).join(", "), "."] }), " ", firstMakeup
                                                                ? "Next Class " +
                                                                    firstMakeup.lesson +
                                                                    " is " +
                                                                    classDate(firstMakeup) +
                                                                    "."
                                                                : "No make-up class is scheduled yet."] })] })), firstMakeup &&
                                                makeUpButton(firstMakeup, current, "Add to that class"), current.completed_on && (_jsxs("p", { children: ["Completed ", labelDate(current.completed_on)] }))] }), _jsxs("section", { className: "lx-card lx-list", children: [_jsxs("details", { className: "cfc-details", children: [_jsxs("summary", { children: ["Certificate", " ", _jsx("strong", { children: current.certificate_collected_on
                                                                    ? "Collected"
                                                                    : current.certificate_ready_on
                                                                        ? "Ready for collection"
                                                                        : current.certificate_number
                                                                            ? "Issued"
                                                                            : current.completed_on
                                                                                ? "Not issued"
                                                                                : missing.length
                                                                                    ? "After 7 of 7"
                                                                                    : "Awaiting approval" })] }), certificate(current, current.id, "cfc", current.completed_on)] }), _jsxs("details", { className: "cfc-details", children: [_jsxs("summary", { children: ["Baptism ", _jsx("strong", { children: baptismStatus(personBaptism) })] }), personBaptism ? (baptismCard(personBaptism)) : (_jsx("button", { className: "lx-btn", disabled: busy, onClick: () => void save("baptism_register", { member: current.id }), children: "Register for baptism" }))] })] }), current.phone && (_jsxs("div", { className: "lx-two", children: [_jsx("a", { className: "lx-btn", href: "tel:" + current.phone, children: "\u260E Call" }), _jsx("a", { className: "lx-btn lx-wabtn", href: "https://wa.me/" +
                                                    current.phone.replace(/\D/g, "").replace(/^0/, "234"), target: "_blank", rel: "noreferrer", children: "WhatsApp" })] })), !current.completed_on && !missing.length && (_jsxs(_Fragment, { children: [_jsx("button", { className: "lx-btn lx-primary", disabled: busy, onClick: () => void save("submit", { member: current.id }), children: current.review?.submitted_at
                                                    ? "Resubmit for review"
                                                    : "Submit completion for review" }), data.manager && current.review?.submitted_at && (_jsx("button", { className: "lx-btn", disabled: busy, onClick: () => void save("approve", { member: current.id }), children: "Approve completion" }))] })), makeups.length > 1 && (_jsxs("details", { className: "lx-card cfc-details", children: [_jsx("summary", { children: "More make-up opportunities" }), makeups.slice(1).map((s) => (_jsxs("div", { children: [_jsxs("p", { children: ["Class ", s.lesson, " \u00B7 ", classDate(s), " \u00B7", " ", data.cohorts.find((c) => c.id === s.cohort_id)?.name] }), makeUpButton(s, current, "Schedule make-up")] }, s.id)))] })), _jsxs("details", { className: "lx-card cfc-details", children: [_jsx("summary", { children: "Attendance history" }), current.attendance.length ? (current.attendance.map((a) => (_jsxs("p", { children: ["Class ", a.lesson, " \u00B7 ", a.status, " \u00B7 ", labelDate(a.date), " \u00B7", " ", a.cohort_name || "Earlier cohort"] }, a.session_id)))) : (_jsx("p", { children: "No attendance recorded yet." }))] })] })), tab === "Plan" && (_jsxs(_Fragment, { children: [_jsx("button", { className: "lx-btn", onClick: () => {
                                            setCohort("");
                                            go("People");
                                        }, children: "Find attendance by participant" }), _jsxs("section", { className: "lx-card lx-list", "aria-label": "Attendance by cohort", children: [_jsx("h2", { className: "lx-pad", children: "Attendance by cohort" }), [...sessions]
                                                .sort((a, b) => b.held_on.localeCompare(a.held_on))
                                                .map((s) => (_jsxs("button", { className: "lx-task", onClick: () => openAttendance(s), children: [_jsxs("span", { className: "lx-tt", children: [_jsxs("b", { children: ["Class ", s.lesson, " \u00B7 ", s.topic] }), _jsxs("small", { children: [labelDate(s.held_on), " \u00B7", " ", data.cohorts.find((c) => c.id === s.cohort_id)
                                                                        ?.name] })] }), _jsx("span", { "aria-hidden": true, children: "\u203A" })] }, s.id))), !sessions.length && (_jsx("p", { className: "lx-pad", children: "No classes scheduled." }))] }), data.canOrganize && (_jsxs(_Fragment, { children: [_jsx("h2", { children: "Schedule a class" }), form("session", _jsxs(_Fragment, { children: [_jsxs("label", { children: ["Cohort", _jsxs("select", { name: "cohort", required: true, children: [_jsx("option", { value: "", children: "Choose cohort" }), cohortOptions()] })] }), _jsxs("label", { children: ["Class number", _jsx("select", { name: "lesson", children: lessons.map((n) => (_jsx("option", { children: n }, n))) })] }), _jsxs("label", { children: ["Topic", _jsx("input", { name: "topic", required: true, maxLength: 160 })] }), _jsxs("label", { children: ["Date", _jsx("input", { name: "date", type: "date", required: true })] }), _jsxs("label", { children: ["Venue", _jsx("input", { name: "venue", maxLength: 200 })] })] })), _jsx("h2", { children: "Create cohort" }), form("cohort", _jsxs(_Fragment, { children: [_jsxs("label", { children: ["Name", _jsx("input", { name: "name", required: true, maxLength: 120 })] }), _jsxs("label", { children: ["Start date", _jsx("input", { name: "date", type: "date", required: true })] })] })), _jsx("button", { className: "cfc-secondary", onClick: () => {
                                                    go("People");
                                                    setAdding(true);
                                                }, children: "Add participant or arrange a make-up" })] }))] })), tab === "Attendance" && selected && (_jsxs(_Fragment, { children: [selected.held_on > today() ? (_jsx("p", { className: "lx-notice", children: "Attendance opens on the class date." })) : (_jsx("button", { className: "lx-btn", disabled: busy || !roster.some((p) => !p.completed_on), onClick: () => setMarks(Object.fromEntries(roster
                                            .filter((p) => !p.completed_on)
                                            .map((p) => [p.id, "present"]))), children: "\u2713 Everyone came" })), _jsxs("p", { className: "lx-count lx-center", children: [_jsx("b", { children: roster.filter((p) => (marks[p.id] ?? saved(p)) === "present").length }), " ", "came \u00B7", " ", _jsx("b", { children: roster.filter((p) => (marks[p.id] ?? saved(p)) === "absent").length }), " ", "absent"] }), _jsxs("section", { className: "lx-card lx-list", children: [roster
                                                .filter((p) => matchesPerson(p, attendanceSearch))
                                                .map((p) => (_jsxs("div", { className: "lx-att", children: [_jsx("span", { className: "lx-av", "aria-hidden": true, children: avatar(p.name) }), _jsxs("div", { children: [_jsx("b", { children: p.name }), p.completed_on && (_jsx("small", { className: "lx-muted cfc-readonly", children: "Completion confirmed" }))] }), _jsx("div", { className: "lx-seg cfc-seg", "aria-label": "Attendance for " + p.name, role: "group", children: ["present", "absent"].map((status) => (_jsxs("button", { disabled: busy ||
                                                                selected.held_on > today() ||
                                                                !!p.completed_on, "aria-pressed": (marks[p.id] ?? saved(p)) === status, className: (marks[p.id] ?? saved(p)) === status
                                                                ? "on " + (status === "present" ? "c" : "a")
                                                                : undefined, onClick: () => {
                                                                setError("");
                                                                setNotice("");
                                                                setMarks((prev) => ({
                                                                    ...prev,
                                                                    [p.id]: status,
                                                                }));
                                                            }, children: [(marks[p.id] ?? saved(p)) === status && (_jsx("span", { "aria-hidden": true, children: "\u2713 " })), status === "present" ? "Came" : "Absent"] }, status))) })] }, p.id))), !roster.some((p) => matchesPerson(p, attendanceSearch)) && (_jsx("p", { className: "lx-pad", children: "No matching participants." }))] }), roster.length > 0 && (_jsxs("details", { className: "lx-card cfc-details", children: [_jsx("summary", { children: "Find participant in this session" }), _jsx("input", { "aria-label": "Search session roster", value: attendanceSearch, onChange: (e) => setAttendanceSearch(e.target.value), placeholder: "Name or phone number" })] })), !!corrections.length && (_jsxs("label", { className: "lx-field", children: ["Reason for changing a saved mark", _jsx("input", { value: correction, disabled: busy, maxLength: 1000, onChange: (e) => setCorrection(e.target.value), placeholder: "At least 5 characters" })] })), selected.held_on <= today() && (_jsx("div", { className: "lx-stick", children: _jsx("button", { className: "lx-btn lx-primary", disabled: busy ||
                                                !changes.length ||
                                                (!!corrections.length && correction.trim().length < 5), onClick: () => void saveAttendance(), children: busy ? "Saving…" : "Save attendance" }) }))] })), tab === "Baptism" && (_jsxs(_Fragment, { children: [_jsx("p", { children: "Register water baptism separately from CFC completion." }), _jsx("button", { className: "cfc-primary", "aria-expanded": adding, onClick: () => setAdding(!adding), children: adding ? "Close registration" : "Register for baptism" }), adding && memberLookup("baptism_register"), _jsxs("label", { children: ["Search baptism register", _jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Search by name" })] }), (data.baptisms || [])
                                        .filter((p) => matchesPerson(p, search))
                                        .map((p) => baptismCard(p))] })), tab === "Help" && (_jsxs(_Fragment, { children: [_jsx("p", { className: "lx-notice", children: "Need help? Call your Follow Through Coordinator." }), _jsxs("section", { className: "cfc-card", children: [_jsx("h2", { children: data.name }), _jsx("p", { children: data.manager
                                                    ? "Follow Through coordinator"
                                                    : "Foundational Class leader" }), _jsx("p", { children: "Your dashboard contains CFC classes and participants. Completed classes carry across cohorts." }), _jsx("button", { className: "cfc-primary", disabled: busy, onClick: async () => {
                                                    setBusy(true);
                                                    try {
                                                        const r = await fetch("/api/auth/logout", {
                                                            method: "POST",
                                                        });
                                                        if (!r.ok)
                                                            throw Error("Log out failed. Try again.");
                                                        window.location.replace("/cfc-login");
                                                    }
                                                    catch (e) {
                                                        setError(e.message);
                                                        setBusy(false);
                                                    }
                                                }, children: "Log out" })] })] }))] }))] }), tab !== "Attendance" && (_jsx("nav", { className: "lx-tabs", "aria-label": "CFC dashboard", children: ["Classes", "People", "Help"].map((name, i) => (_jsxs("button", { "aria-current": active === name ? "page" : undefined, disabled: busy, onClick: () => go(name), children: [_jsx("svg", { "aria-hidden": "true", width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: [
                                    "M4 3h16v16H7l-3 2z",
                                    "M9 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 6",
                                    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M10 9a2 2 0 1 1 3 2c-1 .5-1 1-1 2m0 4h.01",
                                ][i] }) }), name] }, name))) }))] }));
}
