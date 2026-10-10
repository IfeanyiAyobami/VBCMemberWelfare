import { createDemoState } from "./demo-state.js";
import { mountThemeToggle } from "./theme.js";

/**
 * Mount the existing reviewed UI inside a React-owned lifecycle boundary.
 * All records and sends are local simulations for frontend review.
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function mountCareUI(root, options = {}) {
  const disposeTheme = mountThemeToggle(root);
  const lifecycle = new AbortController();
  const listen = (target, type, handler, options = {}) =>
    target.addEventListener(type, handler, {
      ...(typeof options === "boolean" ? { capture: options } : options),
      signal: lifecycle.signal,
    });

  const $ = (s, scope = root) => scope.querySelector(s);
  const $$ = (s, scope = root) => [...scope.querySelectorAll(s)];
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const icons = {
    overview:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    members:
      '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5"/>',
    celebrations:
      '<path d="M3 10h18v11H3zM12 10v11M2 6h20v4H2z"/><path d="M12 6c-7 0-6-6-2-4 2 1 2 4 2 4s0-3 2-4c4-2 5 4-2 4Z"/>',
    programmes:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h3M14 15h3"/>',
    campaigns: '<path d="M3 10v7h4l11 4V6L7 10H3ZM7 17l2 5M21 11v5"/>',
    templates:
      '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h8M8 17h4"/>',
    automations: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
    delivery: '<path d="M4 3h16v18H4zM8 7h8M8 12h8M8 17h3"/>',
    settings:
      '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    sms: '<path d="M4 3h16v14H9l-5 4V3Z"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  };
  const icon = (n) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n] || (n === "newsletters" ? icons.mail : icons.members)}</svg>`;
  const money = (n) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(n);
  const state = createDemoState(defaultEmailDesign);
  const main = $("#main"),
    modal = $("#modal");
  const nav = [
    ["overview", "Overview"],
    ["members", "Members"],
    ...(options.memberDirectorySaved ? [["guests", "Guest submissions"]] : []),
    ["celebrations", "Celebrations"],
    ["programmes", "Programmes"],
    ["campaigns", "Campaigns"],
    ["newsletters", "Newsletters"],
    ["templates", "Templates"],
    ["automations", "Automations"],
    ["delivery", "Delivery log"],
    ["settings", "Settings"],
  ];
  const field = (id, label, value = "", type = "text", attrs = "") =>
    `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${attrs}></div>`;
  const select = (id, label, options, value = "", attrs = "") =>
    `<div class="field"><label for="${id}">${label}</label><select id="${id}" name="${id}" ${attrs}>${options.map((x) => `<option value="${esc(Array.isArray(x) ? x[0] : x)}" ${(Array.isArray(x) ? x[0] : x) === value ? "selected" : ""}>${esc(Array.isArray(x) ? x[1] : x)}</option>`).join("")}</select></div>`;
  const check = (id, label, checked = false) =>
    `<label class="check-label"><input id="${id}" name="${id}" type="checkbox" ${checked ? "checked" : ""}>${label}</label>`;
  const badge = (label) =>
    `<span class="badge ${["Delivered", "Active", "Member", "Demo scheduled"].includes(label) ? "green" : ["Failed", "Missing consent"].includes(label) ? "red" : ["Draft", "Visitor", "Paused", "Not connected"].includes(label) ? "amber" : "blue"}">${esc(label)}</span>`;
  const avatar = (m, size = "") =>
    `<span class="avatar ${size} ${m.id?.endsWith("3") ? "rose" : m.id?.endsWith("5") ? "gold" : ""}">${esc((m.first || "")[0] || "")}${esc((m.last || "")[0] || "")}</span>`;
  const title = (name, sub = "", actions = "", eyebrow = "Member care") =>
    `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${name}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
  const btn = (label, action, cls = "", attrs = "") =>
    `<button class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
  const link = (label, route, cls = "") =>
    `<a class="btn ${cls}" href="/${route}" data-care-route="">${label}</a>`;
  const statusMember = (id) => state.members.find((m) => m.id === id);
  const dateLabel = (d) =>
    d
      ? new Date(d + "T12:00:00").toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "Not set";
  const celebrationDate = (d) =>
    d
      ? new Date("2026-" + d + "T12:00:00").toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
        })
      : "Not set";
  const memberRow = (m, extra = "") =>
    `<button class="row row-link" data-action="profile" data-id="${m.id}">${avatar(m)}<span class="row-main"><strong>${esc(m.first + " " + m.last)}</strong><small>${esc(m.status)}</small></span><span class="row-right">${extra}</span></button>`;
  function toast(msg) {
    $("#toast").textContent = msg;
    $("#toast").classList.add("visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(
      () => $("#toast").classList.remove("visible"),
      3800,
    );
  }
  function showModal(name, body, foot = "") {
    modal.classList.remove("email-modal");
    modal.innerHTML = `<div class="modal-head"><h2 id="modal-title">${name}</h2><button class="icon-button" data-action="close" aria-label="Close dialog">×</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ""}`;
    if (!modal.open) modal.showModal();
  }
  function currentRoute() {
    if (location.protocol === "file:")
      return location.hash.slice(1) || "overview";
    return location.pathname.replace(/^\/|\/$/g, "") || "overview";
  }
  async function afterNavigation(verified = false) {
    if (
      options.beforeNavigate &&
      verified !== true &&
      !(await options.beforeNavigate("/" + currentRoute()))
    )
      return;
    if (modal.open) modal.close();
    render();
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function go(route) {
    if (options.beforeNavigate && !(await options.beforeNavigate("/" + route)))
      return;
    if (location.protocol === "file:") {
      if (location.hash === "#" + route) afterNavigation();
      else location.hash = route;
      return;
    }
    const path = "/" + route;
    if (location.pathname !== path || location.hash)
      window.history.pushState(null, "", path);
    afterNavigation(true);
  }
  function render() {
    const route = currentRoute() || "overview";
    const base = route.split("/")[0];
    $("#navigation").innerHTML = nav
      .map(
        ([key, name]) =>
          `<a href="/${key}" data-care-route="" class="nav-item ${key === base ? "active" : ""}" ${key === base ? 'aria-current="page"' : ""}>${icon(key)}${name}${key === "delivery" && state.logs.some((l) => l.status === "Failed") ? '<span class="nav-count">1</span>' : ""}</a>`,
      )
      .join("");
    $("#breadcrumb").textContent =
      "Church office / " +
      (nav.find((n) => n[0] === base)?.[1] ||
        {
          join: "Visitor experience",
          preferences: "Message preferences",
          budget: "Budget & references",
          guide: "Review guide",
          access: "Team access",
          import: "Member import",
          compose: "Campaign composer",
        }[base] ||
        "Members");
    $("#sidebar").classList.remove("open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
    $("#menu-toggle").setAttribute("aria-label", "Open navigation");
    main.innerHTML = (
      {
        overview,
        members,
        celebrations,
        programmes,
        campaigns,
        newsletters,
        templates,
        automations,
        delivery,
        settings,
        budget,
        guide,
        join,
        preferences,
        access,
        import: importPage,
        compose,
        profile,
      }[base] || overview
    )(route.split("/")[1]);
    document.title =
      (nav.find((n) => n[0] === base)?.[1] || "Member care") + " · Vine Branch";
  }
  function overview() {
    const b = state.members.filter((m) => m.birthday === "10-08"),
      a = state.members.filter((m) => m.anniversary === "10-08");
    const due = [
      ...b.map((m) => ({ m, type: "Birthday", time: "08:00" })),
      ...a.map((m) => ({ m, type: "Anniversary", time: "08:30" })),
    ];
    const delivered = state.logs.filter((l) => l.status === "Delivered").length;
    return (
      title(
        "Every person matters.",
        "Thursday, 8 October 2026 · Your care queue for today",
        link(`${icon("plus")} New campaign`, "compose", "primary"),
      ) +
      `<div class="greeting-panel"><div><h2>A little care goes a long way.</h2><p>${b.length} birthdays and ${a.length} wedding anniversary today. Your daily greetings are set for the morning.</p></div><div class="date-stamp"><strong>08</strong><span>OCTOBER<br>THURSDAY</span></div></div><div class="stats"><div class="stat"><span class="stat-title">People in your care</span><strong class="stat-number">${state.members.length}</strong><small>${state.members.filter((m) => m.status === "New member").length} new members · ${state.members.filter((m) => m.status === "Visitor").length} visitors</small></div><div class="stat"><span class="stat-title">Celebrations today</span><strong class="stat-number">${due.length.toString().padStart(2, "0")}</strong><small>Birthday & anniversary greetings</small></div><div class="stat"><span class="stat-title">Scheduled invitations</span><strong class="stat-number">${state.campaigns
        .filter(
          (c) =>
            c.status.includes("Scheduled") || c.status === "Demo scheduled",
        )
        .length.toString()
        .padStart(
          2,
          "0",
        )}</strong><small>Next: 15 October, 09:00</small></div><div class="stat"><span class="stat-title">Delivery status</span><strong class="stat-number">${delivered}/${state.logs.length}</strong><small>Sample messages marked delivered</small></div></div><div class="grid two"><section class="card"><div class="card-head"><h2>Celebrating today</h2><a class="text-link" href="/celebrations" data-care-route="">View calendar</a></div>${due.map(({ m, type, time }) => memberRow(m, `<span class="badge ${type === "Birthday" ? "red" : "blue"}">${type}</span><small>${time} · Email${m.smsOpt ? " & SMS" : ""}</small>`)).join("")}<div class="card-foot hint">Greetings respect each member’s channel and celebration preferences.</div></section><section class="card"><div class="card-head"><h2>Next programme</h2>${badge("Upcoming")}</div><div class="card-pad"><div class="eyebrow">Sunday, 18 October · 09:00</div><h2>Family & Friends Sunday</h2><p class="muted mt" style="font-size:.875rem">A Sunday to worship together and bring someone you love.</p><div class="event-meta">${icon("pin")}Vine Branch Church, Ibadan</div><div class="button-row">${link("Review invitation", "compose/c1", "navy")}${link("Programme details", "programmes")}</div></div></section><section class="card"><div class="card-head"><h2>Recently welcomed</h2><a href="/members" data-care-route="" class="text-link">All members</a></div>${state.members
        .filter((m) => m.status !== "Member")
        .slice(0, 3)
        .map((m) => memberRow(m, badge(m.status)))
        .join(
          "",
        )}</section><section class="card"><div class="card-head"><h2>Needs your attention</h2>${badge(state.logs.filter((l) => l.status === "Failed").length + " issues")}</div><div class="card-pad"><div class="notice amber">${state.logs.some((l) => l.status === "Failed") ? "An anniversary email needs a retry. Check the delivery record before trying again." : "No failed messages need your attention. Review the delivery queue for updates."}</div>${link("Review delivery issue", "delivery", "w100")}<div class="settings-row"><div><strong>Provider setup</strong><small>Connect email and SMS for production.</small></div><a href="/settings/providers" data-care-route="" class="text-link">Review</a></div></div></section></div>`
    );
  }
  function filteredMembers() {
    return state.members.filter(
      (m) =>
        (m.first + " " + m.last + " " + m.email + " " + m.phone)
          .toLowerCase()
          .includes(state.search.toLowerCase()) &&
        (state.filter === "all" || m.status === state.filter) &&
        (state.channelFilter === "all" ||
          (state.channelFilter === "email"
            ? m.emailOpt && m.email
            : state.channelFilter === "sms"
              ? m.smsOpt && m.phone
              : !m.emailOpt && !m.smsOpt)),
    );
  }
  function members() {
    const ms = filteredMembers();
    return (
      title(
        "The church family",
        "A clear record of every person, their milestones and preferences.",
        btn("Import CSV", "start-import") +
          btn(`${icon("plus")} Add member`, "add-member", "primary"),
      ) +
      `<div class="toolbar"><label class="searchbox"><span class="sr-only">Search members</span>${icon("search")}<input id="member-search" type="search" value="${esc(state.search)}" placeholder="Search by name, email or phone"></label><select id="member-status" aria-label="Filter membership" style="max-width:180px">${["all", "Visitor", "New member", "Member"].map((s) => `<option value="${s}" ${state.filter === s ? "selected" : ""}>${s === "all" ? "All members" : s}</option>`).join("")}</select><select id="member-channel" aria-label="Filter channel permission" style="max-width:190px">${[
        ["all", "All channels"],
        ["email", "Email enabled"],
        ["sms", "SMS enabled"],
        ["none", "No permissions"],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${state.channelFilter === v ? "selected" : ""}>${l}</option>`,
        )
        .join(
          "",
        )}</select></div>${state.selected.size ? `<div class="notice"><div class="actions"><strong>${state.selected.size} selected</strong><span class="flex-spacer"></span>${btn("Compose invitation", "bulk-campaign", "small navy")}${btn("Clear", "clear-selection", "small")}</div></div>` : ""}<section class="card"><div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="select-all" aria-label="Select visible members" ${ms.length && ms.every((m) => state.selected.has(m.id)) ? "checked" : ""}></th><th>Member</th><th>Status</th><th>Birthday</th><th>Messages</th><th></th></tr></thead><tbody>${ms.map((m) => `<tr><td><input type="checkbox" data-member-select="${m.id}" aria-label="Select ${esc(m.first + " " + m.last)}" ${state.selected.has(m.id) ? "checked" : ""}></td><td><div class="name-cell">${avatar(m)}<div><button class="link-button" data-action="profile" data-id="${m.id}">${esc(m.first + " " + m.last)}</button><small>${esc(m.email || "No email recorded")}</small></div></div></td><td>${badge(m.status)}</td><td>${celebrationDate(m.birthday)}</td><td>${m.emailOpt ? badge("Email") : ""} ${m.smsOpt ? badge("SMS") : ""}${!m.emailOpt && !m.smsOpt ? "<small>No permissions</small>" : ""}</td><td><button class="link-button" data-action="profile" data-id="${m.id}">View profile</button></td></tr>`).join("") || '<tr><td colspan="6"><div class="list-empty"><h3>No members match these filters</h3><p class="mt hint">Try a different name or reset your filters.</p>' + btn("Reset filters", "reset-filters") + "</div></td></tr>"}</tbody></table></div><div class="table-bottom"><span>Showing ${ms.length} of ${state.members.length} fictional records</span><span>Birth year is optional</span></div></section>`
    );
  }
  function profile(id) {
    const m = statusMember(id) || state.members[0];
    return `<div class="mb"><a href="/members" data-care-route="" class="text-link">All members</a></div><div class="profile-hero">${avatar(m, "large")}<div><div class="eyebrow">Member profile</div><h1>${esc(m.first + " " + m.last)}</h1><div class="mt" style="margin-top:9px">${badge(m.status)}</div></div><div class="actions">${btn("Edit profile", "edit-member", "", 'data-id="' + m.id + '"')}${btn("Create invitation", "member-campaign", "primary", 'data-id="' + m.id + '"')}</div></div><div class="tabs-line"><button class="${state.profileTab === "details" ? "active" : ""}" data-action="profile-tab" data-value="details">Details & milestones</button><button class="${state.profileTab === "history" ? "active" : ""}" data-action="profile-tab" data-value="history">Communication history</button></div>${
      state.profileTab === "history"
        ? `<section class="card"><div class="card-head"><h2>Communication history</h2><span class="meta">Sample records</span></div>${
            state.logs
              .filter((l) => l.member === m.id)
              .map(
                (l) =>
                  `<button class="row row-link" data-action="log-detail" data-id="${l.id}"><span class="symbol-box">${icon(l.channel === "Email" ? "mail" : "sms")}</span><span class="row-main"><strong>${esc(l.label)}</strong><small>${l.time} · ${l.channel}</small></span>${badge(l.status)}</button>`,
              )
              .join("") ||
            '<div class="list-empty">No messages recorded for this member.</div>'
          }</section>`
        : `<div class="grid two"><div class="grid"><section class="card"><div class="card-head"><h2>Contact information</h2></div><div class="card-pad"><dl class="detail-list"><div><dt>Email</dt><dd>${esc(m.email || "Not set")}</dd></div><div><dt>Phone</dt><dd>${esc(m.phone || "Not set")}</dd></div><div><dt>Occupation</dt><dd>${esc(m.occupation || "Not set")}</dd></div><div><dt>First visit</dt><dd>${dateLabel(m.joined)}</dd></div><div class="span-two"><dt>Residential address</dt><dd>${esc(m.address || "Not set")}</dd></div></dl></div></section><section class="card"><div class="card-head"><h2>Important dates</h2></div><div class="card-pad"><dl class="detail-list"><div><dt>Birthday</dt><dd>${celebrationDate(m.birthday)}</dd></div><div><dt>Wedding anniversary</dt><dd>${celebrationDate(m.anniversary)}</dd></div></dl></div></section></div><div class="grid"><section class="card"><div class="card-head"><h2>Message preferences</h2></div><div class="card-pad"><div class="settings-row"><strong>Email</strong>${badge(m.emailOpt ? "Enabled" : "Off")}</div><div class="settings-row"><strong>SMS</strong>${badge(m.smsOpt ? "Enabled" : "Off")}</div><div class="settings-row"><strong>Celebrations</strong>${badge(m.celebrationOpt ? "Enabled" : "Off")}</div><div class="settings-row"><strong>Programme invites</strong>${badge(m.programmeOpt ? "Enabled" : "Off")}</div><div class="settings-row"><strong>Monthly newsletter</strong>${badge(m.newsletterOpt ? "Enabled" : "Off")}</div><p class="help-text">Preferences come from registration or a member’s preference link. Changes are recorded with their date and source in production.</p>${btn("Preview preference page", "preview-preferences", "soft w100", 'data-id="' + m.id + '"')}</div></section><section class="card"><div class="card-head"><h2>Care note</h2></div><form id="note-form" class="card-pad" data-id="${m.id}"><div class="field"><label for="care-note">Private team note</label><textarea id="care-note" placeholder="Add a useful follow-up note…">${esc(m.notes)}</textarea></div><button class="btn" type="submit">Save note</button></form></section></div></div>`
    }`;
  }
  function memberDialog(id) {
    if (!id && options.openMemberDirectory) {
      options.openMemberDirectory();
      return;
    }
    const m = statusMember(id) || {
      first: "",
      last: "",
      status: "Visitor",
      birthday: "",
      anniversary: "",
      email: "",
      phone: "",
      emailOpt: false,
      smsOpt: false,
      celebrationOpt: false,
      programmeOpt: false,
      occupation: "",
      address: "",
    };
    showModal(
      id ? "Edit member" : "Add member",
      `<form id="member-form" data-id="${id || ""}" novalidate><div id="member-errors"></div><div class="form-grid">${field("member-first", "Other names <span>*</span>", m.first)}${field("member-last", "Surname <span>*</span>", m.last)}${field("member-email", "Email", m.email, "email")}${field("member-phone", "Mobile number", m.phone, "tel")}${select("member-type", "Membership", ["Visitor", "New member", "Member"], m.status)}${field("member-occupation", "Occupation", m.occupation)}${field("member-birthday", "Birthday (month / day)", m.birthday ? "2000-" + m.birthday : "", "date")}${field("member-anniversary", "Wedding anniversary", m.anniversary ? "2000-" + m.anniversary : "", "date")}<div class="span-two">${field("member-address", "Residential address", m.address)}</div></div><p class="hint">Only month and day are kept for greetings. At least one contact method is required.</p><h3 class="mt">Confirmed message preferences</h3><p class="hint">Record permissions the member has actually given.</p><div class="form-grid"><div>${check("member-emailOpt", "Email", m.emailOpt)}${check("member-smsOpt", "SMS", m.smsOpt)}</div><div>${check("member-celebrationOpt", "Birthday & anniversary greetings", m.celebrationOpt)}${check("member-programmeOpt", "Programme invitations", m.programmeOpt)}${check("member-newsletterOpt", "Monthly newsletter", m.newsletterOpt)}</div></div></form>`,
      btn("Cancel", "close") +
        '<button class="btn primary" type="submit" form="member-form">Save member</button>',
    );
  }
  function celebrations() {
    const month = state.calMonth;
    const events = state.members.filter(
      (m) =>
        m[state.calType] && Number(m[state.calType].slice(0, 2)) === month + 1,
    );
    const dayEvents = events.filter(
      (m) => Number(m[state.calType].slice(3)) === state.calDay,
    );
    const first = new Date(2026, month, 1).getDay();
    const days = new Date(2026, month + 1, 0).getDate();
    const monthName = new Date(2026, month, 1).toLocaleDateString("en-GB", {
      month: "long",
    });
    return (
      title(
        "Remember their milestones",
        "A thoughtful greeting, right on time.",
        link("Manage automations", "automations"),
      ) +
      `<div class="tabs"><button class="tab ${state.calType === "birthday" ? "active" : ""}" data-action="cal-type" data-value="birthday">Birthdays</button><button class="tab ${state.calType === "anniversary" ? "active" : ""}" data-action="cal-type" data-value="anniversary">Wedding anniversaries</button></div><div class="grid two"><section class="card"><div class="card-head"><h2>${monthName} 2026</h2><div class="actions">${btn("Previous", "cal-month", "small", 'data-delta="-1"')}${btn("Next", "cal-month", "small", 'data-delta="1"')}</div></div><div class="calendar">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="cal-label">${d}</div>`).join("")}${Array.from({ length: first }, () => '<div class="cal-day blank"></div>').join("")}${Array.from(
        { length: days },
        (_, i) => {
          const num = i + 1,
            n = events.filter(
              (m) => Number(m[state.calType].slice(3)) === num,
            ).length;
          return `<button class="cal-day ${month === 9 && num === 8 ? "today" : ""} ${num === state.calDay ? "selected" : ""}" data-action="cal-day" data-day="${num}" aria-label="${num} ${monthName}, ${n} ${state.calType === "birthday" ? "birthdays" : "anniversaries"}">${num}${n ? `<span class="cal-indicator ${state.calType}">${n}<span class="cal-word">&nbsp;${state.calType === "birthday" ? "birthday" + (n > 1 ? "s" : "") : "anniversary"}</span></span>` : ""}</button>`;
        },
      ).join(
        "",
      )}</div><div class="card-foot hint">${events.length} ${state.calType === "birthday" ? "birthdays" : "anniversaries"} this month · Times shown in Lagos time</div></section><div class="grid"><section class="card"><div class="card-head"><h2>${state.calDay} ${monthName}</h2>${badge(dayEvents.length + " people")}</div>${dayEvents.map((m) => memberRow(m, badge(m.celebrationOpt ? "Eligible" : "Preferences off"))).join("") || '<div class="list-empty"><div class="empty-symbol">♡</div><h3>A quiet day</h3><p class="hint mt">No ' + (state.calType === "birthday" ? "birthdays" : "anniversaries") + " on this date.</p></div>"}</section><section class="card"><div class="card-head"><h2>Greeting preview</h2></div><div class="card-pad"><p class="hint">${state.calType === "birthday" ? "Birthday blessing" : "Anniversary blessing"} · Personalised for ${esc(dayEvents[0]?.first || "Tomi")}</p><div class="sms-bubble">${esc(personalise(state.templates[state.calType === "birthday" ? 0 : 1].sms, dayEvents[0] || state.members[0]))}</div><div class="mt">${btn("Edit template", "celebration-template", "w100", 'data-id="' + (state.calType === "birthday" ? "t1" : "t2") + '"')}</div></div></section></div></div>`
    );
  }
  function programmes() {
    return (
      title(
        "Gather the family",
        "Programme details and invitations, kept together.",
        btn(`${icon("plus")} Create programme`, "add-event", "primary"),
      ) +
      `<div class="grid three">${state.events.map((e) => `<article class="card event-card"><div class="event-art"><strong>${esc(e.title)}</strong><span>${esc(e.date.slice(8))}</span></div><div class="card-pad">${badge("Upcoming")}<div class="event-meta mt">${icon("programmes")}${dateLabel(e.date)} · ${e.time}</div><div class="event-meta">${icon("pin")}${esc(e.venue)}</div><p>${esc(e.description)}</p><div class="actions mt">${btn("Create invite", "event-campaign", "small navy", 'data-id="' + e.id + '"')}${btn("Edit", "edit-event", "small", 'data-id="' + e.id + '"')}</div></div></article>`).join("")}</div><div class="notice mt">These programmes are fictional examples for reviewing the invitation workflow.</div>`
    );
  }
  function eventDialog(id) {
    const e = state.events.find((e) => e.id === id) || {
      title: "",
      date: "",
      time: "09:00",
      venue: "",
      description: "",
      link: "",
    };
    showModal(
      id ? "Edit programme" : "New programme",
      `<form id="event-form" data-id="${id || ""}" novalidate><div id="event-errors"></div>${field("event-title", "Programme name <span>*</span>", e.title)}<div class="form-grid">${field("event-date", "Date <span>*</span>", e.date, "date")}${field("event-time", "Time · Africa/Lagos <span>*</span>", e.time, "time")}</div>${field("event-venue", "Venue <span>*</span>", e.venue)}<div class="field"><label for="event-description">Short description</label><textarea id="event-description">${esc(e.description)}</textarea></div>${field("event-link", "Information link", e.link, "url")}</form>`,
      btn("Cancel", "close") +
        '<button class="btn primary" type="submit" form="event-form">Save programme</button>',
    );
  }
  function personalisationValues(
    m = statusMember("m1") || state.members[0],
    eventId = "e1",
  ) {
    const e = state.events.find((e) => e.id === eventId) || state.events[0];
    return {
      first_name: m.first,
      programme: e.title,
      date: dateLabel(e.date),
      time: e.time,
      venue: e.venue,
    };
  }
  function personalise(text, m, eventId) {
    const v = personalisationValues(m, eventId);
    return String(text || "").replace(
      /\{\{\s*(\w+)\s*\}\}/g,
      (all, key) => v[key] ?? all,
    );
  }
  function smsInfo(text) {
    const basic =
      "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
    const ext = "^{}\\[~]|€";
    let units = 0,
      unicode = false;
    for (const ch of text) {
      if (basic.includes(ch)) units++;
      else if (ext.includes(ch)) units += 2;
      else unicode = true;
    }
    if (unicode) units = text.length;
    return {
      encoding: unicode ? "Unicode" : "GSM-7",
      units,
      segments:
        units === 0
          ? 0
          : units <= (unicode ? 70 : 160)
            ? 1
            : Math.ceil(units / (unicode ? 67 : 153)),
    };
  }
  function audience(d) {
    return state.members.filter(
      (m) =>
        d.audience === "all" ||
        (d.audience === "new" && m.status === "New member") ||
        (d.audience === "visitors" && m.status === "Visitor") ||
        (d.audience === "selected" && (d.selected || []).includes(m.id)),
    );
  }
  function recipients(d) {
    const candidates = audience(d);
    const email = Array.from(
      new Map(
        candidates
          .filter((m) => m.programmeOpt && m.emailOpt && m.email)
          .map((m) => [m.email.toLowerCase(), m]),
      ).values(),
    );
    const sms = Array.from(
      new Map(
        candidates
          .filter((m) => m.programmeOpt && m.smsOpt && m.phone)
          .map((m) => [normalizePhone(m.phone), m]),
      ).values(),
    );
    return {
      candidates,
      email: d.channel === "sms" ? [] : email,
      sms: d.channel === "email" ? [] : sms,
    };
  }
  function estimateCampaign(d) {
    const r = recipients(d);
    const segments = r.sms.reduce(
      (sum, m) => sum + smsInfo(personalise(d.sms, m, d.event)).segments,
      0,
    );
    return {
      ...r,
      segments,
      cost: segments * state.budget.smsRate,
      excluded: r.candidates.filter(
        (m) => !r.email.includes(m) && !r.sms.includes(m),
      ).length,
    };
  }
  function defaultDraft() {
    return {
      name: "",
      event: "e1",
      channel: "email",
      audience: "all",
      selected: [],
      subject: state.templates[2].subject,
      body: state.templates[2].body,
      sms: state.templates[2].sms,
      kind: "Invitation",
      design: JSON.parse(JSON.stringify(state.templates[2].design)),
      schedule: "2026-10-15T09:00",
      status: "Draft",
    };
  }
  function ensureDraft(id) {
    if (id && state.draft?.id !== id) {
      state.draft = JSON.parse(
        JSON.stringify(
          state.campaigns.find((c) => c.id === id) || defaultDraft(),
        ),
      );
      state.campaignStep = 0;
    } else if (!state.draft) state.draft = defaultDraft();
  }
  function campaigns() {
    return (
      title(
        "Invitations with intention",
        "Draft, review and schedule your programme messages.",
        btn(`${icon("plus")} Create campaign`, "new-campaign", "primary"),
      ) +
      `<section class="card"><div class="table-wrap"><table><thead><tr><th>Campaign</th><th>Channels</th><th>Audience</th><th>Schedule · Lagos</th><th>Status</th><th></th></tr></thead><tbody>${state.campaigns.map((c) => `<tr><td><strong>${esc(c.name)}</strong><br><small>${esc(state.events.find((e) => e.id === c.event)?.title || "Programme")}</small></td><td>${badge(c.channel === "both" ? "Email & SMS" : c.channel === "sms" ? "SMS" : "Email")}</td><td>${c.audience === "selected" ? (c.selected || []).length + " selected" : c.audience === "new" ? "New members" : c.audience === "visitors" ? "Visitors" : "Church family"}</td><td>${c.schedule ? dateLabel(c.schedule.slice(0, 10)) + "<br><small>" + c.schedule.slice(11) + "</small>" : "Not scheduled"}</td><td>${badge(c.status)}</td><td>${btn("Review", "review-campaign", "small", 'data-id="' + c.id + '"')}</td></tr>`).join("")}</tbody></table></div><div class="card-foot hint">Sample schedules are for review. No external sending service is connected.</div></section>`
    );
  }
  function compose(id) {
    ensureDraft(id);
    const d = state.draft,
      r = estimateCampaign(d),
      step = state.campaignStep;
    const smsOnly = d.channel === "sms";
    const sample = r.email[0] || r.sms[0] || state.members[0];
    const sms = smsInfo(personalise(d.sms, sample, d.event));
    if (state.campaignSuccess)
      return (
        title("Campaign ready", "Your review is complete.") +
        `<section class="card"><div class="success-view"><div class="success-mark">✓</div><h2>Scheduled in this prototype</h2><p><strong>${esc(d.name)}</strong> is set for ${dateLabel(d.schedule.slice(0, 10))} at ${d.schedule.slice(11)}, Africa/Lagos.<br>No emails or SMS were sent or queued with a provider.</p><div class="actions" style="justify-content:center">${link("View campaigns", "campaigns", "primary")}${btn("Create another", "new-campaign")}</div></div></section>`
      );
    return (
      title(
        d.id ? "Review invitation" : "Create an invitation",
        "Every message starts with the right people.",
        btn("Save as draft", "save-draft"),
      ) +
      `<ol class="steps">${["Programme", "Audience", "Message", "Review & schedule"].map((s, i) => `<li class="${i === step ? "current" : i < step ? "complete" : ""}"><span>${i < step ? "✓" : i + 1}</span>${s}</li>`).join("")}</ol><div class="composer"><section class="card"><form id="campaign-form" novalidate><div class="card-pad"><div id="campaign-errors"></div>${
        step === 0
          ? `<div class="section-title"><h2>What are you inviting people to?</h2><p>Use the programme details to personalise each invitation.</p></div>${field("campaign-name", "Campaign name <span>*</span>", d.name, "text", 'placeholder="e.g. Family & Friends Sunday invite"')}${select(
              "campaign-event",
              "Programme",
              state.events.map((e) => [e.id, e.title]),
              d.event,
            )}<h3>Choose the channels</h3><div class="choice-grid">${[
              [
                "email",
                "Email",
                "A branded invitation with full programme details.",
              ],
              [
                "sms",
                "SMS",
                "A short message that reaches people on their phone.",
              ],
              [
                "both",
                "Email & SMS",
                "Both channels, respecting individual preferences.",
              ],
            ]
              .map(
                ([v, l, h]) =>
                  `<label class="choice"><input type="radio" name="campaign-channel" value="${v}" ${d.channel === v ? "checked" : ""}><div><strong>${l}</strong><p>${h}</p></div></label>`,
              )
              .join("")}</div>`
          : step === 1
            ? `<div class="section-title"><h2>Who should receive this?</h2><p>Only people who permit programme messages on the selected channels are included.</p></div>${select("campaign-audience", "Audience", [["all", "All members & visitors"], ["new", "New members"], ["visitors", "Visitors"], ...(d.selected?.length ? [["selected", d.selected.length + " selected members"]] : [])], d.audience)}<div class="summary-grid"><div class="summary-box"><strong>${r.candidates.length}</strong><span>People in audience</span></div><div class="summary-box"><strong>${r.email.length}</strong><span>Email recipients</span></div><div class="summary-box"><strong>${r.sms.length}</strong><span>SMS recipients</span></div></div><div class="notice">${r.excluded} people excluded because of missing contacts or message preferences. Duplicate addresses and phone numbers are counted once per channel.</div><div class="card" style="box-shadow:none">${r.candidates
                .slice(0, 6)
                .map(
                  (m) =>
                    `<div class="row">${avatar(m, "small")}<span class="row-main"><strong>${esc(m.first + " " + m.last)}</strong></span><span>${r.email.includes(m) ? badge("Email") : ""} ${r.sms.includes(m) ? badge("SMS") : ""}${!r.email.includes(m) && !r.sms.includes(m) ? badge("Excluded") : ""}</span></div>`,
                )
                .join("")}</div>`
            : step === 2
              ? `<div class="section-title"><h2>Make it feel personal.</h2><p>Names and programme details fill in automatically for each recipient.</p></div><div class="token-buttons">${["first_name", "programme", "date", "time", "venue"].map((t) => `<button type="button" data-action="insert-token" data-token="${t}">{{${t}}}</button>`).join("")}</div>${d.channel !== "sms" ? `${field("campaign-subject", "Email subject <span>*</span>", d.subject)}<div class="field"><label for="campaign-body">Email message <span>*</span></label><textarea id="campaign-body" rows="7">${esc(d.body)}</textarea></div>${emailDesignEditor("campaign", d.design)}` : ""}${d.channel !== "email" ? `<div class="field"><label for="campaign-sms">SMS message <span>*</span></label><textarea id="campaign-sms" rows="4">${esc(d.sms)}</textarea><small id="sms-count">${sms.units} units · ${sms.encoding} · ${sms.segments} segment${sms.segments === 1 ? "" : "s"} for sample recipient</small></div>` : ""}<p class="hint">Email includes a message-preference link. SMS opt-out handling is configured with the selected provider before launch.</p>`
              : `<div class="section-title"><h2>One final look.</h2><p>Confirm the audience, message and send time.</p></div><div class="summary-grid"><div class="summary-box"><strong>${r.email.length}</strong><span>Email recipients</span></div><div class="summary-box"><strong>${r.sms.length}</strong><span>SMS recipients</span></div><div class="summary-box"><strong>${money(r.cost)}</strong><span>SMS estimate, before VAT</span></div></div><dl class="detail-list mb"><div><dt>Campaign</dt><dd>${esc(d.name)}</dd></div><div><dt>Programme</dt><dd>${esc(state.events.find((e) => e.id === d.event)?.title)}</dd></div><div><dt>SMS segments in total</dt><dd>${r.segments}</dd></div><div><dt>Rate assumption</dt><dd>₦${state.budget.smsRate} / segment</dd></div></dl>${field("campaign-schedule", "Schedule · Africa/Lagos <span>*</span>", d.schedule, "datetime-local", 'min="2026-10-08T10:00"')}<div class="notice amber">The SMS estimate uses an editable planning rate. It is not a Termii quote. Personalisation can change message length.</div>${check("campaign-confirm", "I have reviewed the message, eligible recipients and schedule.", false)}`
      }</div><div class="compose-foot">${step ? btn("Back", "campaign-back") : link("Cancel", "campaigns")}<button class="btn primary" type="submit">${step === 3 ? "Simulate scheduling" : "Continue"}</button></div></form></section><aside><div class="preview-frame"><div class="preview-label">${smsOnly ? "SMS" : "Email"} preview · ${esc(sample.first)}</div>${smsOnly ? `<div class="phone-preview"><header>VineBranch</header><div class="sms-bubble">${esc(personalise(d.sms, sample, d.event))}</div></div>` : `${emailPreview(d, "campaign", sample, d.event)}`}${d.channel === "both" ? `<div class="mt"><div class="preview-label">SMS preview</div><div class="sms-bubble" id="sms-preview">${esc(personalise(d.sms, sample, d.event))}</div></div>` : ""}<div class="help-text">No messages are sent from this review prototype.</div></div></aside></div>`
    );
  }
  function captureCampaign() {
    const d = state.draft;
    const map = {
      "campaign-name": "name",
      "campaign-event": "event",
      "campaign-audience": "audience",
      "campaign-subject": "subject",
      "campaign-body": "body",
      "campaign-sms": "sms",
      "campaign-schedule": "schedule",
    };
    for (const [id, k] of Object.entries(map)) {
      if ($("#" + id)) d[k] = $("#" + id).value.trim();
    }
    const channel = $('input[name="campaign-channel"]:checked');
    if (channel) d.channel = channel.value;
    captureDesign(d, "campaign");
  }
  function validateCampaign(step) {
    const d = state.draft,
      r = estimateCampaign(d);
    let err = [];
    if (step === 0 && !d.name) err.push("Give this campaign a name.");
    if (step === 1 && !r.email.length && !r.sms.length)
      err.push("No eligible recipients. Choose another audience or channel.");
    if (step === 2) {
      if (d.channel !== "sms" && (!d.subject || !d.body))
        err.push("Add an email subject and message.");
      if (d.channel !== "email" && !d.sms) err.push("Add an SMS message.");
      if (d.channel !== "sms") err.push(...designErrors(d));
      const all = [
        d.subject,
        d.body,
        d.sms,
        d.design?.headline,
        d.design?.preheader,
        d.design?.quote,
      ].join(" ");
      const tokens = [...all.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
      if (
        tokens.some(
          (t) =>
            !["first_name", "programme", "date", "time", "venue"].includes(t),
        )
      )
        err.push("Use only the supported personalisation fields.");
    }
    if (step === 3) {
      if (!d.schedule || d.schedule <= "2026-10-08T10:00")
        err.push(
          "Choose a future send time after 8 October 2026, 10:00 Lagos time.",
        );
      const event = state.events.find((e) => e.id === d.event);
      if (event && d.schedule > event.date + "T" + event.time)
        err.push("Schedule this invitation before the programme begins.");
      if (!$("#campaign-confirm")?.checked)
        err.push("Confirm that you have reviewed the message and schedule.");
    }
    return err;
  }
  // Graphic-rich emails share the same safe, table-based rendering path.
  function defaultEmailDesign(kind) {
    const common = {
      preheader: "A little love from your Vine Branch Church family.",
      headline: "",
      image: "",
      alt: "",
      imageUrl: "",
      quote: "",
      ctaLabel: "Visit our church website",
      ctaUrl: "https://vinebranchchurch.org/",
    };
    if (kind === "Birthday")
      return {
        ...common,
        headline: "Happy birthday,\n{{first_name}}.",
        image: "/assets/image-59ec271bcba5.jpg",
        alt: "A white birthday cake with a candle and red ribbon on a navy background",
        quote: "May this new chapter be full of grace, joy and purpose.",
      };
    if (kind === "Anniversary")
      return {
        ...common,
        preheader: "Celebrating the love and grace that make a home.",
        headline: "A beautiful love.\nA blessed journey.",
        image: "/assets/image-eb4d4ecb9a0b.jpg",
        alt: "Ivory roses and two gold wedding rings on navy velvet",
        quote: "May your home continue to flourish in love, peace and grace.",
      };
    if (kind === "Newsletter")
      return {
        ...common,
        preheader:
          "A word for the month, stories from the family and dates for your diary.",
        headline: "Rooted in faith.\nGrowing together.",
        image: "/assets/image-1135145c76a9.jpg",
        alt: "Members of the Vine Branch Church family worshipping together",
        ctaLabel: "Stay connected",
      };
    return {
      ...common,
      preheader: "There is a place for you. Join us for {{programme}}.",
      headline: "{{programme}}",
      image: "/assets/image-0efe2b07fd2f.jpg",
      alt: "Concept artwork of an empty stage lit in navy and red",
      ctaLabel: "View programme",
      ctaUrl: "https://vinebranchchurch.org/",
    };
  }
  function safeEmailLink(value) {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password
        ? u.href
        : "";
    } catch {
      return "";
    }
  }
  function validEmailImage(value) {
    return (
      /^\/assets\/[a-z0-9-]+\.(jpg|png|gif)$/i.test(value) ||
      /^data:image\/(jpeg|png|gif);base64,[A-Za-z0-9+/=]+$/.test(value) ||
      !!safeEmailLink(value)
    );
  }
  function emailLines(value, m, eventId) {
    return esc(personalise(value, m, eventId)).replace(/\n/g, "<br>");
  }
  function emailImage(src, alt, width = 620, images = state.emailImages) {
    if (!src || !validEmailImage(src)) return "";
    return images
      ? `<img src="${esc(src)}" alt="${esc(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;">`
      : `<div class="image-fallback" style="padding:28px 20px;background:#edf0f8;color:#4c5776;font-size:14px;line-height:1.6;text-align:center;">Image: ${esc(alt || "Decorative banner")}</div>`;
  }
  function emailButton(label, url) {
    const href = safeEmailLink(url);
    return label && href
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ED1C24" style="border-radius:6px;"><a href="${esc(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:15px 23px;color:#ffffff;font-family:Poppins,Arial,sans-serif;font-size:16px;font-weight:600;text-decoration:none;border:1px solid #ED1C24;border-radius:6px;">${esc(label)}</a></td></tr></table>`
      : "";
  }
  function eventEmailRow(e) {
    const day = e.date.slice(8),
      month = new Date(e.date + "T12:00:00")
        .toLocaleDateString("en-GB", { month: "short" })
        .toUpperCase();
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-top:1px solid #e1e5ee;"><tr><td width="64" valign="top" style="padding:19px 0;"><div style="background:#eef1f8;text-align:center;padding:8px 4px;border-radius:6px;color:#000956;"><strong style="display:block;font-size:26px;line-height:1.1;">${esc(day)}</strong><span style="font-size:12px;letter-spacing:1px;">${esc(month)}</span></div></td><td valign="top" style="padding:18px 0 18px 18px;"><strong style="font-size:17px;color:#000956;line-height:1.4;">${esc(e.title)}</strong><div style="font-size:14px;line-height:1.7;color:#626b80;margin-top:4px;">${dateLabel(e.date)} · ${esc(e.time)} WAT<br>${esc(e.venue)}</div></td></tr></table>`;
  }
  function emailMarkup(
    data,
    prefix = "",
    member,
    eventId = "e1",
    images = state.emailImages,
  ) {
    const kind = data.kind || "Invitation",
      design = data.design || defaultEmailDesign(kind),
      event = state.events.find((e) => e.id === eventId) || state.events[0],
      id = prefix ? ` id="${prefix}-preview-body"` : "",
      isNews = kind === "Newsletter";
    const eyebrow =
      kind === "Birthday"
        ? "CELEBRATING YOU"
        : kind === "Anniversary"
          ? "LOVE · FAMILY · GRACE"
          : isNews
            ? new Date((data.month || "2026-10") + "-01T12:00:00")
                .toLocaleDateString("en-GB", { month: "long", year: "numeric" })
                .toUpperCase() + " / THE FAMILY LETTER"
            : "YOU ARE WARMLY INVITED";
    let sections = "";
    if (isNews) {
      sections = (data.stories || [])
        .map(
          (s, i) =>
            `<tr><td class="mail-pad" style="padding:0 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr><td class="mail-stack mail-story-image" width="36%" valign="top" style="padding-right:20px;">${emailImage(s.image, s.alt, 200, images)}</td><td class="mail-stack" valign="top"><div style="font-size:12px;letter-spacing:1.6px;color:#a02028;font-weight:600;margin-bottom:8px;">${esc(s.category || "FROM THE FAMILY")}</div><h2 style="font-family:Poppins,Arial,sans-serif;font-size:21px;line-height:1.35;color:#000956;margin:0 0 12px;">${esc(s.title)}</h2><p style="font-size:16px;line-height:1.75;color:#4e5870;margin:0 0 14px;">${emailLines(s.body, member, eventId)}</p>${safeEmailLink(s.url) ? `<a href="${esc(safeEmailLink(s.url))}" target="_blank" rel="noopener" style="font-size:15px;font-weight:600;color:#000956;text-decoration:underline;">${esc(s.label || "Read more")}</a>` : ""}</td></tr></table></td></tr>`,
        )
        .join("");
      const dates = state.events.filter((e) =>
        (data.eventIds || []).includes(e.id),
      );
      if (dates.length)
        sections += `<tr><td class="mail-pad" style="padding:2px 32px 24px;"><div style="font-size:12px;letter-spacing:1.6px;color:#a02028;font-weight:600;margin-bottom:9px;">MAKE ROOM IN YOUR DIARY</div><h2 style="font-size:24px;line-height:1.35;color:#000956;margin:0 0 16px;">Coming together</h2>${dates.map(eventEmailRow).join("")}</td></tr>`;
    }
    const programmeDetails =
      kind === "Invitation"
        ? `<tr><td class="mail-pad" style="padding:24px 32px 0;">${eventEmailRow(event)}</td></tr>`
        : "";
    const quote = design.quote
      ? `<tr><td class="mail-pad" style="padding:0 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:22px;background:#f1f3fa;border-left:3px solid #ED1C24;color:#000956;font-family:Georgia,serif;font-size:21px;line-height:1.6;">${emailLines(design.quote, member, eventId)}</td></tr></table></td></tr>`
      : "";
    return `<table role="presentation" class="mail-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;margin:0 auto;background:#ffffff;border-collapse:collapse;table-layout:fixed;font-family:Poppins,Arial,sans-serif;color:#151d36;word-wrap:break-word;"><tr><td style="padding:21px 28px;border-bottom:4px solid #ED1C24;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="42">${images ? '<img src="/assets/image-7d4e31b34082.png" alt="" width="32" style="display:block;width:32px;height:auto;">' : ""}</td><td style="padding-left:8px;color:#000956;"><strong style="font-family:Anton,Impact,Arial,sans-serif;font-size:20px;line-height:1.3;letter-spacing:.6px;">VINE BRANCH CHURCH</strong><div style="font-size:11px;letter-spacing:1.7px;color:#626b80;margin-top:3px;">A FAMILY OF FAITH</div></td></tr></table></td></tr><tr><td class="mail-pad" bgcolor="#000956" style="padding:28px 32px;color:#ffffff;"><div style="font-size:12px;letter-spacing:1.8px;color:#d8def4;margin-bottom:12px;">${esc(eyebrow)}</div><h1 style="font-family:Anton,Impact,Arial,sans-serif;font-size:36px;line-height:1.2;letter-spacing:.4px;color:#ffffff;margin:0;font-weight:400;text-transform:none;">${emailLines(design.headline, member, eventId)}</h1></td></tr>${design.image ? `<tr><td>${emailImage(design.image, design.alt, 620, images)}</td></tr>` : ""}${programmeDetails}<tr><td class="mail-pad" style="padding:28px 32px;"><div${id} style="font-size:16px;line-height:1.8;color:#4e5870;">${emailLines(data.body, member, eventId)}</div></td></tr>${quote}${sections}${design.ctaLabel && safeEmailLink(design.ctaUrl) ? `<tr><td class="mail-pad" style="padding:2px 32px 32px;">${emailButton(design.ctaLabel, design.ctaUrl)}</td></tr>` : ""}<tr><td class="mail-pad" bgcolor="#000956" style="padding:26px 32px;color:#ffffff;"><strong style="font-size:17px;color:#ffffff;">With love, your church family.</strong><p style="font-size:13px;line-height:1.7;color:#d8def4;margin:8px 0 0;">Vine Branch Church · Ibadan, Nigeria<br><a href="https://vinebranchchurch.org/" target="_blank" rel="noopener" style="color:#ffffff;text-decoration:underline;">vinebranchchurch.org</a></p></td></tr><tr><td style="padding:20px 28px;background:#f4f6fa;text-align:center;font-size:12px;line-height:1.8;color:#626b80;">You receive this message according to your church communication preferences.<br><a href="/preferences/m1" data-care-route="" style="color:#000956;text-decoration:underline;">Manage preferences</a> · <a href="/preferences/m1" data-care-route="" style="color:#000956;text-decoration:underline;">Unsubscribe</a><br><span style="font-size:11px;">Sent with Brevo · Free-plan footer preview</span></td></tr></table>`;
  }
  function emailPreview(data, prefix, member, eventId = "e1") {
    const m = member || statusMember("m1") || state.members[0],
      design = data.design || defaultEmailDesign(data.kind || "Invitation");
    return `<div class="email-preview-tools" role="group" aria-label="Email preview options">${[
      ["desktop", "Desktop"],
      ["mobile", "Mobile"],
    ]
      .map(
        ([v, label]) =>
          `<button type="button" class="preview-toggle ${state.emailDevice === v ? "active" : ""}" data-action="email-device" data-value="${v}" aria-pressed="${state.emailDevice === v}">${label}</button>`,
      )
      .join(
        "",
      )}<button type="button" class="preview-toggle" data-action="email-images" aria-pressed="${!state.emailImages}">Images ${state.emailImages ? "on" : "off"}</button>${btn("Full preview", "email-full", "small")}</div><div class="email-inbox"><span>Vine Branch Church <small>to ${esc(m.first)}</small></span><strong id="${prefix}-preview-subject">${esc(personalise(data.subject, m, eventId))}</strong><small class="mail-preheader">${esc(personalise(design.preheader, m, eventId))}</small></div><div class="mail-viewport ${state.emailDevice === "mobile" ? "is-mobile" : ""}" data-email-preview="${prefix}"><div class="email-preview rich-email">${emailMarkup(data, prefix, m, eventId)}</div></div><p class="hint mt">${state.emailDevice === "mobile" ? "Mobile layout preview." : "Desktop layout adapts to the available space."} ${!state.emailImages ? "Important details remain readable with images blocked." : ""}</p>`;
  }
  function imageEditor(prefix, design, label = "Banner artwork") {
    const current = design.image,
      custom = design.imageUrl || "";
    return `<div class="art-editor"><div class="art-editor-heading"><h3>${esc(label)}</h3><span class="meta">Email only</span></div><div class="art-editor-sample">${current && validEmailImage(current) ? `<img src="${esc(current)}" alt="${esc(design.alt || "Banner preview")}">` : '<span class="hint">No image selected</span>'}</div><div class="art-editor-controls"><label class="btn small"><input type="file" id="${prefix}-image-upload" accept="image/jpeg,image/png,image/gif" data-email-upload="${prefix}" class="sr-only">${icon("upload")} Upload image</label>${btn("Use original", "email-image-reset", "small", 'data-prefix="' + prefix + '"')}${btn("Remove", "email-image-remove", "small", 'data-prefix="' + prefix + '"')}</div>${field(prefix + "-image-url", "Or use a hosted image URL", custom, "url", 'placeholder="https://…" data-email-visual="' + prefix + '"')}${field(prefix + "-alt", "Image description (alt text)", design.alt, "text", 'data-email-visual="' + prefix + '"')}<p id="${prefix}-image-error" class="error" role="alert"></p><p class="hint">JPEG, PNG or GIF · up to 1 MB. Uploaded artwork stays in this review session. Use Brevo-hosted images in the sending system.</p></div>`;
  }
  function emailDesignEditor(prefix, design) {
    return `<details class="design-details" open><summary>Email design</summary><div class="design-fields">${field(prefix + "-preheader", "Inbox preview text", design.preheader, "text", 'data-email-visual="' + prefix + '"')}<div class="field"><label for="${prefix}-headline">Banner headline</label><textarea id="${prefix}-headline" rows="2" data-email-visual="${prefix}">${esc(design.headline)}</textarea></div>${imageEditor(prefix, design)}${design.quote !== undefined ? field(prefix + "-quote", "Blessing or highlighted line (optional)", design.quote, "text", 'data-email-visual="' + prefix + '"') : ""}<div class="form-grid">${field(prefix + "-ctaLabel", "Button label", design.ctaLabel, "text", 'data-email-visual="' + prefix + '"')}${field(prefix + "-ctaUrl", "Button link", design.ctaUrl, "url", 'data-email-visual="' + prefix + '"')}</div></div></details>`;
  }
  function activeEmailTarget(prefix) {
    if (prefix === "template")
      return state.templates.find((t) => t.id === state.templateId);
    if (prefix === "newsletter")
      return state.newsletters.find((n) => n.id === state.newsletterId);
    if (prefix === "campaign") return state.draft;
    const hit = prefix.match(/^newsletter-story-(\d+)$/);
    if (hit)
      return state.newsletters.find((n) => n.id === state.newsletterId)
        ?.stories[Number(hit[1])];
  }
  function captureDesign(target, prefix) {
    if (!target) return;
    const design = target.design || target;
    for (const key of [
      "preheader",
      "headline",
      "alt",
      "quote",
      "ctaLabel",
      "ctaUrl",
    ]) {
      const el = $("#" + prefix + "-" + key);
      if (el) design[key] = el.value.trim();
    }
    const url = $("#" + prefix + "-image-url");
    if (url && url.value.trim() !== design.imageUrl) {
      design.imageUrl = url.value.trim();
      if (design.imageUrl)
        design.image =
          validEmailImage(design.imageUrl) && safeEmailLink(design.imageUrl)
            ? design.imageUrl
            : "";
      else if (/^https:/.test(design.image))
        design.image = defaultEmailDesign(target.kind || "Newsletter").image;
    }
  }
  function captureEmailEditors() {
    const route = currentRoute().split("/")[0];
    if (route === "templates") captureTemplate();
    if (route === "compose") captureCampaign();
    if (route === "newsletters") captureNewsletter();
  }
  function captureTemplate() {
    const t = activeEmailTarget("template");
    if (!t) return;
    if (state.templateChannel === "sms") {
      if ($("#template-message")) t.sms = $("#template-message").value;
      return;
    }
    if ($("#template-subject")) t.subject = $("#template-subject").value;
    if ($("#template-message")) t.body = $("#template-message").value;
    captureDesign(t, "template");
  }
  function captureNewsletter() {
    const n = activeEmailTarget("newsletter");
    if (!n) return;
    for (const [id, key] of Object.entries({
      "newsletter-name": "name",
      "newsletter-month": "month",
      "newsletter-subject": "subject",
      "newsletter-body": "body",
      "newsletter-schedule": "schedule",
      "newsletter-batch": "batch",
      "newsletter-reserve": "reserve",
    })) {
      const el = $("#" + id);
      if (el)
        n[key] = ["batch", "reserve"].includes(key)
          ? Number(el.value)
          : el.value;
    }
    captureDesign(n, "newsletter");
    (n.stories || []).forEach((s, i) => {
      const prefix = "newsletter-story-" + i;
      for (const key of ["category", "title", "body", "label", "url"]) {
        const el = $("#" + prefix + "-" + key);
        if (el) s[key] = el.value.trim();
      }
      captureDesign(s, prefix);
    });
    if ($("#newsletter-dates"))
      n.eventIds = $$("input[data-newsletter-event]:checked").map(
        (el) => el.value,
      );
  }
  function designErrors(data) {
    const d = data.design || {};
    const errors = [];
    if (!d.headline?.trim()) errors.push("Enter a banner headline.");
    if (d.image && !d.alt?.trim())
      errors.push(
        "Add an image description so the banner has alternative text.",
      );
    if (d.imageUrl && !safeEmailLink(d.imageUrl))
      errors.push("Use a complete HTTPS image URL.");
    if (d.ctaLabel && !safeEmailLink(d.ctaUrl))
      errors.push("Add a complete HTTPS link for the email button.");
    if (data.kind === "Newsletter") {
      for (const [i, s] of (data.stories || []).entries()) {
        if (!s.title || !s.body)
          errors.push(
            "Add a title and text for newsletter section " + (i + 1) + ".",
          );
        if (s.image && !s.alt)
          errors.push(
            "Add an image description for newsletter section " + (i + 1) + ".",
          );
        if (s.imageUrl && !safeEmailLink(s.imageUrl))
          errors.push(
            "Use an HTTPS image URL in newsletter section " + (i + 1) + ".",
          );
        if (s.url && !safeEmailLink(s.url))
          errors.push(
            "Use an HTTPS link in newsletter section " + (i + 1) + ".",
          );
      }
    }
    return errors;
  }
  function updateEmailPreview() {
    const prefix = currentRoute().startsWith("newsletters")
        ? "newsletter"
        : currentRoute().startsWith("templates")
          ? "template"
          : "campaign",
      target = activeEmailTarget(prefix);
    if (!target) return;
    const m =
        prefix === "campaign"
          ? recipients(target).email[0] || state.members[0]
          : statusMember("m1") || state.members[0],
      eventId = target.event || "e1";
    const view = $('[data-email-preview="' + prefix + '"] .rich-email');
    if (view) view.innerHTML = emailMarkup(target, prefix, m, eventId);
    const subject = $("#" + prefix + "-preview-subject");
    if (subject) subject.textContent = personalise(target.subject, m, eventId);
    const preheader = $(".mail-preheader");
    if (preheader)
      preheader.textContent = personalise(target.design?.preheader, m, eventId);
  }
  function emailUpload(input) {
    const prefix = input.dataset.emailUpload,
      target = activeEmailTarget(prefix),
      file = input.files?.[0];
    if (!target || !file) return;
    const error = $("#" + prefix + "-image-error");
    if (
      !["image/jpeg", "image/png", "image/gif"].includes(file.type) ||
      file.size > 1000000
    ) {
      if (error)
        error.textContent = "Choose a JPEG, PNG or GIF smaller than 1 MB.";
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      if (error)
        error.textContent = "The image could not be read. Try another file.";
    };
    reader.onload = () => {
      const test = new Image();
      test.onerror = () => {
        if (error) error.textContent = "This file is not a readable image.";
      };
      test.onload = () => {
        captureEmailEditors();
        const design = target.design || target;
        design.image = String(reader.result);
        design.imageUrl = "";
        if (!design.alt)
          design.alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
        render();
        toast("Artwork updated for this review session.");
      };
      test.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }
  function activePreviewData() {
    if (currentRoute().startsWith("newsletters"))
      return activeEmailTarget("newsletter");
    if (currentRoute().startsWith("templates"))
      return activeEmailTarget("template");
    return activeEmailTarget("campaign");
  }
  function emailFullPreview() {
    captureEmailEditors();
    const target = activePreviewData();
    if (!target) return;
    showModal(
      "Email preview",
      `<div class="full-email-preview ${state.emailDevice === "mobile" ? "is-mobile" : ""}">${emailMarkup(target, "", target.kind === "Invitation" ? recipients(target).email[0] || statusMember("m1") : statusMember("m1"), target.event || "e1")}</div><p class="hint mt">Layout review only. Programme examples are fictional. No email is sent.</p>`,
      btn("Close preview", "close", "primary"),
    );
    modal.classList.add("email-modal");
  }
  function emailArtAction(action, prefix) {
    captureEmailEditors();
    const target = activeEmailTarget(prefix);
    if (!target) return;
    const d = target.design || target;
    d.image =
      action === "email-image-remove"
        ? ""
        : prefix.startsWith("newsletter-story")
          ? state.newsletters[0].stories[Number(prefix.split("-").pop())]
              ?.originalImage || "/assets/image-1135145c76a9.jpg"
          : defaultEmailDesign(target.kind || "Invitation").image;
    d.imageUrl = "";
    render();
  }
  function richTemplates() {
    const t =
        state.templates.find((t) => t.id === state.templateId) ||
        state.templates[0],
      sms = state.templateChannel === "sms";
    return (
      title(
        "Care, beautifully expressed.",
        "A personal note, wrapped in the warmth of the church family.",
      ) +
      `<div class="template-gallery">${state.templates.map((v) => `<button type="button" class="template-art-card ${t.id === v.id ? "selected" : ""}" data-action="choose-email-template" data-id="${v.id}" aria-pressed="${t.id === v.id}"><img src="${esc(v.design.image || defaultEmailDesign(v.kind).image)}" alt=""><span><strong>${esc(v.kind === "Invitation" ? "Programme invitation" : v.kind + " blessing")}</strong><small>${v.kind === "Birthday" ? "A joyful celebration" : v.kind === "Anniversary" ? "Honouring a shared journey" : "A warm invitation to gather"}</small></span></button>`).join("")}<a class="template-art-card newsletter-art-card" href="/newsletters" data-care-route=""><img src="/assets/image-1135145c76a9.jpg" alt=""><span><strong>Monthly newsletter</strong><small>Stories, inspiration and dates</small></span></a></div><div class="composer email-composer"><section class="card"><div class="card-head"><h2>${esc(t.name)}</h2>${badge("Reusable")}</div><div class="card-pad">${select(
        "template-select",
        "Choose a template",
        state.templates.map((v) => [v.id, v.name]),
        t.id,
      )}<div class="tabs"><button type="button" class="tab ${!sms ? "active" : ""}" data-action="template-channel" data-value="email">Email</button><button type="button" class="tab ${sms ? "active" : ""}" data-action="template-channel" data-value="sms">SMS</button></div><form id="template-form" data-id="${t.id}" novalidate><div id="template-errors"></div>${!sms ? field("template-subject", "Subject <span>*</span>", t.subject) : ""}<div class="field"><label for="template-message">${sms ? "SMS message" : "Personal message"} <span>*</span></label><textarea id="template-message" rows="7">${esc(sms ? t.sms : t.body)}</textarea><small>${sms ? smsInfo(personalise(t.sms)).segments + " SMS segment(s) for Tomi" : "Use {{first_name}} to greet each person by name."}</small></div>${!sms ? emailDesignEditor("template", t.design) : '<p class="hint">SMS uses text only. Your email artwork does not change SMS length or cost.</p>'}<div class="actions"><button class="btn primary" type="submit">Save template</button>${btn("Preview test", "template-test")}</div></form></div></section><aside><div class="preview-frame design-preview"><div class="preview-label">${sms ? "SMS" : "Email"} preview · Tomi</div>${sms ? `<div class="phone-preview"><header>VineBranch</header><div class="sms-bubble" id="template-preview-body">${esc(personalise(t.sms))}</div></div>` : emailPreview(t, "template")}<div class="help-text">Sample artwork is replaceable. The preview uses a fictional member and sends no messages.</div></div></aside></div>`
    );
  }
  function storyEditor(s, i) {
    const p = "newsletter-story-" + i;
    return `<details class="design-details"><summary>Section ${i + 1} · ${esc(s.title)}</summary><div class="design-fields">${field(p + "-category", "Section label", s.category, "text", 'data-newsletter-story="true"')}${field(p + "-title", "Section title", s.title, "text", 'data-newsletter-story="true"')}<div class="field"><label for="${p}-body">Section text</label><textarea id="${p}-body" rows="3" data-newsletter-story="true">${esc(s.body)}</textarea></div>${imageEditor(p, s, "Section image")}<div class="form-grid">${field(p + "-label", "Link label", s.label, "text", 'data-newsletter-story="true"')}${field(p + "-url", "Link", s.url, "url", 'data-newsletter-story="true"')}</div></div></details>`;
  }
  function richNewsletters() {
    const n =
        state.newsletters.find((n) => n.id === state.newsletterId) ||
        state.newsletters[0],
      recipients = newsletterRecipients();
    return (
      title(
        "The family letter.",
        "A monthly rhythm of faith, stories and coming together.",
        btn(`${icon("plus")} New issue`, "new-newsletter", "primary"),
      ) +
      `<section class="card mb newsletter-issues"><div class="card-head"><h2>Your newsletter issues</h2><span class="meta">Email only</span></div>${state.newsletters.map((issue) => `<button class="row row-link" data-action="open-newsletter" data-id="${issue.id}"><span class="symbol-box">${icon("mail")}</span><span class="row-main"><strong>${esc(issue.name)}</strong><small>${esc(issue.month)} · ${esc(issue.subject || "Subject not written")}</small></span>${badge(issue.status)}</button>`).join("")}</section>${state.newsletterSuccess ? `<section class="card"><div class="success-view"><div class="success-mark">✓</div><h2>Newsletter schedule previewed</h2><p>${esc(n.name)} is scheduled in this prototype with up to ${n.batch} recipients per day. No messages are queued with Brevo.</p>${btn("Edit this issue", "open-newsletter", "primary", 'data-id="' + n.id + '"')}</div></section>` : `<div class="composer email-composer"><section class="card"><form id="newsletter-form" class="card-pad" data-id="${n.id}" novalidate><div id="newsletter-errors"></div><h2 class="mb">Build this month’s edition</h2><div class="form-grid">${field("newsletter-name", "Issue name <span>*</span>", n.name)}${field("newsletter-month", "Edition month <span>*</span>", n.month, "month")}</div>${field("newsletter-subject", "Email subject <span>*</span>", n.subject)}<div class="field"><label for="newsletter-body">Opening note <span>*</span></label><textarea id="newsletter-body" rows="5">${esc(n.body)}</textarea><small>Use {{first_name}} for the greeting.</small></div>${emailDesignEditor("newsletter", n.design)}${n.stories.map(storyEditor).join("")}<details class="design-details" open><summary>Dates for the diary</summary><div class="design-fields" id="newsletter-dates">${state.events.map((e) => `<label class="check-label"><input type="checkbox" value="${e.id}" data-newsletter-event="true" ${(n.eventIds || []).includes(e.id) ? "checked" : ""}>${esc(e.title)}<small>${dateLabel(e.date)} · ${e.time}</small></label>`).join("")}<p class="hint">The email uses the programme’s saved date, time and venue.</p></div></details><details class="design-details" open><summary>Recipients & schedule</summary><div class="design-fields"><div class="summary-grid"><div class="summary-box"><strong>${recipients.length}</strong><span>Eligible email recipients</span></div><div class="summary-box"><strong>300</strong><span>Free daily email limit</span></div></div>${field("newsletter-schedule", "First batch · Africa/Lagos", n.schedule, "datetime-local")}<div class="form-grid">${field("newsletter-batch", "Newsletter emails / day", n.batch, "number", 'min="1" max="300"')}${field("newsletter-reserve", "Daily priority reserve", n.reserve, "number", 'min="0" max="299"')}</div><p class="hint">Only members who permit email and newsletters are included. The 300 daily allowance is shared with greetings and invitations.</p></div></details><button class="btn primary" type="submit">Review newsletter schedule</button></form></section><aside><div class="preview-frame design-preview"><div class="preview-label">Newsletter preview · Tomi</div>${emailPreview(n, "newsletter")}<p class="help-text">The sample edition includes original artwork and photographs from the church website. Edit every section before using a real issue.</p></div></aside></div>`}`
    );
  }

  function templates() {
    return richTemplates();
  }
  function newsletters() {
    return richNewsletters();
  }
  function automations() {
    return (
      title(
        "Care, on time",
        "Birthday and anniversary greetings without a daily manual task.",
      ) +
      `<div class="grid equal">${state.automations.map((a) => `<section class="card"><div class="card-head"><div class="automation-mark"><span class="symbol-box">${icon("celebrations")}</span><div><h2>${a.name}</h2><small>Every year · Africa/Lagos</small></div></div><button class="switch" role="switch" aria-label="Enable ${a.name}" aria-checked="${a.on}" data-action="toggle-automation" data-id="${a.id}"><span></span></button></div><div class="card-pad"><div class="automation-flow"><span>Date matches</span><i class="flow-rule"></i><span>Check preferences</span><i class="flow-rule"></i><span>Send greeting</span></div><dl class="detail-list"><div><dt>Send time</dt><dd>${a.time} · Lagos</dd></div><div><dt>Channels</dt><dd>${a.channel === "both" ? "Email & SMS" : a.channel === "email" ? "Email" : "SMS"}</dd></div><div><dt>Template</dt><dd>${esc(state.templates.find((t) => t.id === a.template)?.name)}</dd></div><div><dt>Rule status</dt><dd>${badge(a.on ? "Active" : "Paused")}</dd></div></dl><div class="button-row">${btn("Configure rule", "configure-automation", "", 'data-id="' + a.id + '"')}${btn("Preview greeting", "automation-preview", "soft", 'data-id="' + a.id + '"')}</div></div></section>`).join("")}</div><section class="card mt"><div class="card-head"><h2>Sending rules</h2></div><div class="card-pad"><div class="settings-row"><div><strong>One greeting per person, occasion and year</strong><small>Retries use the original message record to prevent accidental duplicates.</small></div>${badge("Required")}</div><div class="settings-row"><div><strong>Consent checked at send time</strong><small>A scheduled message is skipped when a member withdraws permission.</small></div>${badge("Required")}</div><div class="settings-row"><div><strong>29 February birthdays</strong><small>Default to 28 February in a non-leap year; configurable per rule.</small></div>${badge("Configurable")}</div></div></section>`
    );
  }
  function automationDialog(id) {
    const a = state.automations.find((a) => a.id === id);
    showModal(
      "Configure " + a.name,
      `<form id="automation-form" data-id="${id}"><div class="form-grid">${field("automation-time", "Send time · Lagos", a.time, "time", "required")}${select(
        "automation-channel",
        "Channels",
        [
          ["email", "Email"],
          ["sms", "SMS"],
          ["both", "Email & SMS"],
        ],
        a.channel,
      )}</div>${select(
        "automation-template",
        "Message template",
        state.templates
          .filter(
            (t) => t.kind === (id === "birthday" ? "Birthday" : "Anniversary"),
          )
          .map((t) => [t.id, t.name]),
        a.template,
      )}${select("automation-leap", "29 February in a non-leap year", ["February 28", "March 1"], a.leap)}<div class="notice">People need a saved milestone date, celebration permission and a valid contact on the selected channel.</div></form>`,
      btn("Cancel", "close") +
        '<button class="btn primary" form="automation-form" type="submit">Save rule</button>',
    );
  }
  function delivery() {
    const rows = state.logs.filter(
      (l) =>
        state.deliveryFilter === "all" || l.status === state.deliveryFilter,
    );
    return (
      title(
        "Every message, accounted for",
        "Track delivery, inspect failures and retry safely.",
      ) +
      `<div class="tabs">${["all", "Delivered", "Failed", "Queued"].map((s) => `<button class="tab ${state.deliveryFilter === s ? "active" : ""}" data-action="delivery-filter" data-value="${s}">${s === "all" ? "All messages" : s}</button>`).join("")}</div><section class="card"><div class="table-wrap"><table><thead><tr><th>Recipient</th><th>Message</th><th>Channel</th><th>Time · Lagos</th><th>Delivery</th><th></th></tr></thead><tbody>${
        rows
          .map((l) => {
            const m = statusMember(l.member);
            return `<tr><td><strong>${esc(m.first + " " + m.last)}</strong><br><small>${esc(l.channel === "Email" ? m.email : m.phone)}</small></td><td>${esc(l.label)}</td><td>${badge(l.channel)}</td><td>${l.time}</td><td>${badge(l.status)}</td><td>${btn("Details", "log-detail", "small", 'data-id="' + l.id + '"')}</td></tr>`;
          })
          .join("") ||
        '<tr><td colspan="6"><div class="list-empty">No ' +
          (state.deliveryFilter === "all"
            ? ""
            : state.deliveryFilter.toLowerCase()) +
          " messages to show.</div></td></tr>"
      }</tbody></table></div><div class="card-foot hint">These are simulated delivery records. Production statuses come from provider callbacks; “accepted” does not mean “delivered”.</div></section>`
    );
  }
  function logDialog(id) {
    const l = state.logs.find((l) => l.id === id),
      m = statusMember(l.member);
    showModal(
      "Message details",
      `<dl class="detail-list mb"><div><dt>Recipient</dt><dd>${esc(m.first + " " + m.last)}</dd></div><div><dt>Status</dt><dd>${badge(l.status)}</dd></div><div><dt>Channel</dt><dd>${l.channel}</dd></div><div><dt>Message record</dt><dd>demo-${l.id}</dd></div></dl>${l.error ? `<div class="notice red">${esc(l.error)}</div>` : '<div class="notice success">The sample provider report marks this message as delivered.</div>'}<div class="timeline"><div class="timeline-item">Greeting generated<small>${l.time} · Member milestone matched</small></div><div class="timeline-item">Preferences checked<small>Eligible for this channel</small></div><div class="timeline-item">${esc(l.status)}<small>${l.status === "Failed" ? "Provider timeout recorded" : "Sample delivery confirmation"}</small></div></div>`,
      btn("Close", "close") +
        (l.status === "Failed"
          ? btn(
              "Simulate retry",
              "retry-log",
              "primary",
              'data-id="' + id + '"',
            )
          : ""),
    );
  }
  function settings(sub) {
    if (sub) state.settingsTab = sub;
    const tab = state.settingsTab;
    return (
      title(
        "A well-run care desk",
        "Manage your church identity, connections and team access.",
      ) +
      `<div class="tabs">${[
        ["general", "Church & senders"],
        ["providers", "Connections"],
        ["team", "Team access"],
      ]
        .map(
          ([v, l]) =>
            `<button class="tab ${tab === v ? "active" : ""}" data-action="settings-tab" data-value="${v}">${l}</button>`,
        )
        .join(
          "",
        )}</div>${tab === "providers" ? `<div class="grid three"><section class="card connection"><div class="connection-brand">brevo</div>${badge("Not connected")}<h3>Email delivery</h3><p>Birthday greetings, anniversaries and programme emails.</p><dl><dt>Proposed sender</dt><dd>${esc(state.settings.email)}</dd><dt>Before launch</dt><dd>Verify the sender domain and approve the email plan.</dd></dl>${btn("View setup steps", "provider-help", "soft", 'data-value="email"')}</section><section class="card connection"><div class="connection-brand">termii</div>${badge("Not connected")}<h3>SMS delivery</h3><p>Short greetings and programme reminders by text.</p><dl><dt>Proposed sender ID</dt><dd>${esc(state.settings.smsSender)}</dd><dt>Before launch</dt><dd>Confirm route, sender approval and the current rate card.</dd></dl>${btn("View setup steps", "provider-help", "soft", 'data-value="sms"')}</section><section class="card connection"><div class="connection-brand">supabase</div>${badge("Not connected")}<h3>Member records</h3><p>One protected database for the form and care dashboard.</p><dl><dt>Registration source</dt><dd>Elementor form via a server endpoint</dd><dt>Access</dt><dd>Church staff accounts and roles</dd></dl>${btn("View setup steps", "provider-help", "soft", 'data-value="database"')}</section></div><div class="notice mt">This review never asks for API keys. Production connections are configured securely on the server.</div>` : tab === "team" ? `<section class="card"><div class="card-head"><h2>Church office access</h2>${btn("Preview invitation", "team-invite", "small")}</div><div class="table-wrap"><table><thead><tr><th>Team member</th><th>Role</th><th>Access</th></tr></thead><tbody><tr><td>Member Care Team<br><small>care.team@example.com</small></td><td>${badge("Administrator")}</td><td>Members, campaigns, settings</td></tr><tr><td>Welcome Team<br><small>welcome.team@example.com</small></td><td>${badge("Editor")}</td><td>Members, notes, draft campaigns</td></tr><tr><td>Church leadership<br><small>leadership@example.com</small></td><td>${badge("Viewer")}</td><td>Read-only records and reports</td></tr></tbody></table></div><div class="card-foot hint">These are fictional roles for review. Authentication and server permissions are part of the production build.</div></section>` : `<section class="card" style="max-width:820px"><div class="card-head"><h2>Church identity</h2></div><form id="settings-form" class="card-pad" novalidate><div id="settings-errors"></div><div class="form-grid">${field("settings-sender", "Display name", state.settings.sender)}${field("settings-email", "Sender email", state.settings.email, "email")}${field("settings-smsSender", "SMS sender ID", state.settings.smsSender, "text", 'maxlength="11"')}${select("settings-timeZone", "Church timezone", [["Africa/Lagos", "Africa/Lagos (WAT, UTC+1)"]], state.settings.timeZone)}${field("settings-budget", "Monthly SMS planning limit (₦)", state.settings.budget, "number", 'min="0"')}</div><p class="hint">A proposed sender email is not verified until its provider setup is complete.</p><button class="btn primary" type="submit">Save settings</button></form></section>`}`
    );
  }
  const sampleCSV =
    "first_name,surname,email,phone,birthday,anniversary\nAda,Nnamdi,ada.nnamdi@example.com,08000001001,02-29,06-18\nMoses,Adeniyi,moses.adeniyi@example.com,08000001002,11-15,\nTomi,Adeyemi,tomi.adeyemi@example.com,08000000001,10-08,06-14\n,Missing,invalid,123,13-40,";
  function parseCSV(text) {
    const rows = [];
    let row = [],
      v = "",
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') {
          v += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        row.push(v.trim());
        v = "";
      } else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(v.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        v = "";
      } else v += ch;
    }
    if (quoted) throw new Error("A quoted CSV field is not closed.");
    if (v || row.length) {
      row.push(v.trim());
      if (row.some(Boolean)) rows.push(row);
    }
    return rows;
  }
  function loadCSV(text) {
    const rows = parseCSV(text.replace(/^\uFEFF/, ""));
    if (rows.length < 2)
      throw new Error("Include a header row and at least one member.");
    if (rows.length > 501)
      throw new Error("This review supports up to 500 rows per file.");
    state.importHeaders = rows.shift();
    state.importRows = rows;
    state.importMapping = {
      first: state.importHeaders.indexOf("first_name"),
      last: state.importHeaders.indexOf("surname"),
      email: state.importHeaders.indexOf("email"),
      phone: state.importHeaders.indexOf("phone"),
      birthday: state.importHeaders.indexOf("birthday"),
      anniversary: state.importHeaders.indexOf("anniversary"),
    };
    state.importStep = 1;
    render();
  }
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const validPhone = (s) =>
    /^(?:\+?234|0)[789][01]\d{8}$/.test(s.replace(/[\s()-]/g, ""));
  function validMilestone(s) {
    if (!s) return true;
    if (!/^\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date("2000-" + s + "T12:00:00");
    return !isNaN(d) && d.toISOString().slice(5, 10) === s;
  }
  const normalizePhone = (s) =>
    s
      .replace(/[\s()-]/g, "")
      .replace(/^0/, "234")
      .replace(/^\+/, "");
  function importPreview() {
    const seenEmail = new Set(
        state.members.filter((m) => m.email).map((m) => m.email.toLowerCase()),
      ),
      seenPhone = new Set(
        state.members
          .filter((m) => m.phone)
          .map((m) => normalizePhone(m.phone)),
      );
    return state.importRows.map((row) => {
      const m = Object.fromEntries(
        Object.entries(state.importMapping).map(([k, i]) => [
          k,
          i < 0 ? "" : row[i] || "",
        ]),
      );
      let error = "";
      if (!m.first || !m.last) error = "Name is missing";
      else if (!m.email && !m.phone) error = "No contact method";
      else if (m.email && !validEmail(m.email)) error = "Invalid email";
      else if (m.phone && !validPhone(m.phone)) error = "Invalid phone";
      else if (!validMilestone(m.birthday) || !validMilestone(m.anniversary))
        error = "Date must be MM-DD";
      else if (
        (m.email && seenEmail.has(m.email.toLowerCase())) ||
        (m.phone && seenPhone.has(normalizePhone(m.phone)))
      )
        error = "Duplicate contact";
      if (!error) {
        if (m.email) seenEmail.add(m.email.toLowerCase());
        if (m.phone) seenPhone.add(normalizePhone(m.phone));
      }
      return { m, error };
    });
  }
  function importPage() {
    const step = state.importStep;
    const preview = step === 2 ? importPreview() : [];
    return (
      title(
        "Bring your records together",
        "Import member details, review duplicates and keep permissions explicit.",
        link("Back to members", "members"),
      ) +
      `<ol class="steps">${["Upload CSV", "Map fields", "Review & import"].map((s, i) => `<li class="${i === step ? "current" : i < step ? "complete" : ""}"><span>${i + 1}</span>${s}</li>`).join("")}</ol><section class="card"><div class="card-pad">${
        step === 0
          ? `<h2>Start with a CSV file</h2><p class="hint mt">Use fictional records when testing. Include first name, surname and an email or Nigerian mobile number. Birthday and anniversary dates use MM-DD.</p><div id="import-errors"></div><div class="import-drop">${icon("upload")}<h3>Choose your member file</h3><p class="hint mt">CSV only · Up to 500 rows · 1 MB maximum in this prototype</p><label class="sr-only" for="csv-upload">Upload CSV</label><input id="csv-upload" type="file" accept=".csv,text/csv"></div><div class="actions">${btn("Try sample CSV", "sample-import", "primary")}${btn("Download CSV template", "download-csv")}</div>`
          : step === 1
            ? `<h2>Match your columns</h2><p class="hint mt">${state.importRows.length} rows detected. Match each member field to a column in your file.</p><div id="import-errors"></div><div class="form-grid mt">${Object.entries(
                {
                  first: "First name *",
                  last: "Surname *",
                  email: "Email",
                  phone: "Mobile number",
                  birthday: "Birthday (MM-DD)",
                  anniversary: "Anniversary (MM-DD)",
                },
              )
                .map(([key, label]) =>
                  select(
                    "map-" + key,
                    label,
                    [
                      ["-1", "Not included"],
                      ...state.importHeaders.map((h, i) => [String(i), h]),
                    ],
                    String(state.importMapping[key]),
                  ),
                )
                .join(
                  "",
                )}</div><div class="notice">Imported members start with all messaging permissions off. Record their preferences before including them in automated greetings or invitations.</div>${btn("Review rows", "review-import", "primary")}`
            : `<h2>Ready for a careful import</h2><div class="summary-grid"><div class="summary-box"><strong>${preview.length}</strong><span>Rows reviewed</span></div><div class="summary-box"><strong>${preview.filter((p) => !p.error).length}</strong><span>Ready to import</span></div><div class="summary-box"><strong>${preview.filter((p) => p.error).length}</strong><span>Skipped</span></div></div><div class="table-wrap"><table><thead><tr><th>Member</th><th>Contact</th><th>Result</th></tr></thead><tbody>${preview.map((p) => `<tr><td>${esc(p.m.first + " " + p.m.last)}</td><td>${esc(p.m.email || p.m.phone)}</td><td>${badge(p.error || "Ready")}</td></tr>`).join("")}</tbody></table></div><p class="hint mt">Invalid and duplicate rows are skipped. Existing member records are not overwritten.</p><div class="actions">${btn("Back to mapping", "import-back")}${btn("Import " + preview.filter((p) => !p.error).length + " valid records", "finish-import", "primary", preview.every((p) => p.error) ? "disabled" : "")}</div>`
      }</div></section>`
    );
  }
  function join() {
    const j = state.join,
      step = state.joinStep;
    const names = ["About you", "Stay in touch", "Your visit", "Review"];
    return (
      title(
        "Visitor experience",
        "Preview the public registration journey.",
        btn("Try fictional visitor", "sample-join") +
          link("Message preferences", "preferences"),
      ) +
      `<div class="public-shell"><aside class="public-intro"><img src="/assets/image-7d4e31b34082.png" alt="Vine Branch Church"><div class="eyebrow mt">Welcome to the family</div><h2>There’s a place<br>for you here.</h2><p>We’re so glad you joined us. Help us get to know you and stay connected after your visit.</p><div class="intro-foot">“Come thou with us, and we will do thee good.”<br><br>Heaven-backed. Bible-based.<br>Practical. For real.</div></aside><section class="public-form">${state.joinDone ? `<div class="success-view" style="padding:12px 0"><div class="success-mark">✓</div><h2>We’re so glad you came!</h2><p>Thank you for connecting with us, ${esc(j.other_names)}.</p><p>Your presence at Vine Branch Church means so much to us. We’re delighted you worshipped with us, and we look forward to getting to know you better.</p><div class="notice"><strong>This is just the beginning!</strong><br>We look forward to praying with you, helping you discover your place in our church family, and welcoming you again.</div><p>We can’t wait to see you again!<br>“Come thou with us, and we will do thee good.”</p><p>With love,<br><strong>The Vine Branch Church Family</strong></p><div class="actions" style="justify-content:center">${link("View new visitor record", "profile/" + j.memberId, "primary")}${btn("Try again", "restart-join")}</div><p class="help-text">Preview complete · The fictional record exists only until refresh.</p></div>` : `<div class="eyebrow">Step ${step + 1} of 4</div><h2>${["Let’s start with you.", "Let’s stay in touch.", "Your faith. Your visit.", "One final look."][step]}</h2><p>${["Share a few details so we can welcome you personally.", "Choose how you would like us to keep in touch.", "These questions help us welcome you meaningfully.", "Check your details and how we may contact you."][step]}</p><div class="public-step"><span style="width:${(step + 1) * 25}%"></span></div><form id="join-form" novalidate><div id="join-errors"></div>${step === 0 ? `<div class="form-grid">${field("join-surname", "Surname <span>*</span>", j.surname)}${field("join-other_names", "Other names <span>*</span>", j.other_names)}${field("join-visit_date", "Date of visit <span>*</span>", j.visit_date || "2026-10-08", "date")}${field("join-occupation", "Occupation", j.occupation)}${select("join-gender", "Gender", ["Prefer not to say", "Female", "Male"], j.gender || "Prefer not to say")}${select("join-age_range", "Age range", ["Prefer not to say", "Under 18", "18–25", "26–35", "36–45", "46–60", "Over 60"], j.age_range || "Prefer not to say")}${select("join-marital_status", "Marital status", ["Prefer not to say", "Single", "Married", "Other"], j.marital_status || "Prefer not to say")}</div>` : step === 1 ? `<div class="form-grid">${field("join-phone", "Mobile number <span>*</span>", j.phone, "tel", 'placeholder="08000000000"')}${field("join-email", "Email", j.email, "email", 'placeholder="you@example.com"')}<div class="span-two">${field("join-residential_address", "Residential address", j.residential_address)}</div>${field("join-birthday", "Birthday (optional)", j.birthday ? "2000-" + j.birthday : "", "date")}${j.marital_status === "Married" ? field("join-anniversary", "Wedding anniversary (optional)", j.anniversary ? "2000-" + j.anniversary : "", "date") : ""}</div><p class="hint">Only the month and day are used for celebrations. You may leave these dates blank.</p><h3 class="mt">Your preferred channels</h3>${check("join-emailOpt", "Email", j.emailOpt)}${check("join-smsOpt", "SMS / text messages", j.smsOpt)}<h3 class="mt">What would you like to receive?</h3>${check("join-celebrationOpt", "Birthday & anniversary greetings", j.celebrationOpt)}${check("join-programmeOpt", "Special programme invitations", j.programmeOpt)}${check("join-newsletterOpt", "Monthly church newsletter", j.newsletterOpt)}` : step === 2 ? `<div class="form-grid">${select("join-born_again", "Are you born again?", ["Prefer not to say", "Yes", "No", "I would like to know more"], j.born_again || "Prefer not to say")}${select("join-home_visit", "Would you like a home visit?", ["Prefer not to say", "Yes", "No"], j.home_visit || "Prefer not to say")}${select("join-discovery_source", "How did you hear about us?", ["Select an option", "A friend or family", "Social media", "Church website", "Passing by", "Other"], j.discovery_source || "Select an option")}${field("join-invited_by", "Who invited you?", j.invited_by)}<div class="span-two">${field("join-discovery_details", "Any other details?", j.discovery_details)}</div></div>` : `<dl class="detail-list"><div><dt>Name</dt><dd>${esc(j.other_names + " " + j.surname)}</dd></div><div><dt>Visit date</dt><dd>${dateLabel(j.visit_date)}</dd></div><div><dt>Mobile</dt><dd>${esc(j.phone)}</dd></div><div><dt>Email</dt><dd>${esc(j.email || "Not provided")}</dd></div><div><dt>Birthday</dt><dd>${celebrationDate(j.birthday)}</dd></div><div><dt>Anniversary</dt><dd>${celebrationDate(j.anniversary)}</dd></div><div class="span-two"><dt>Message choices</dt><dd>${[j.emailOpt ? "Email" : "", j.smsOpt ? "SMS" : ""].filter(Boolean).join(" & ") || "No message channels"} · ${[j.celebrationOpt ? "Celebrations" : "", j.programmeOpt ? "Programme invites" : "", j.newsletterOpt ? "Newsletter" : ""].filter(Boolean).join(", ") || "No message topics"}</dd></div></dl><div class="notice mt">You can update your message preferences later. Your details are used by the church to welcome you and follow up on your visit.</div>${check("join-contact_consent", 'I give Vine Branch Church permission to contact me about my visit. <span style="color:var(--required,var(--red))">*</span>', j.contact_consent)}`}<div class="button-row">${step ? btn("Back", "join-back") : link("Church office", "overview")}<button class="btn primary" type="submit">${step === 3 ? "Submit guest card" : "Continue"}</button></div></form>`}</section></div>`
    );
  }
  function focusJoinStep() {
    const heading = $(".public-form h2");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    $(".public-form").scrollIntoView?.({ block: "start", behavior: "instant" });
  }
  function captureJoin() {
    const j = state.join;
    $$("#join-form input,#join-form select").forEach((el) => {
      const k = el.id.replace("join-", "");
      j[k] =
        el.type === "checkbox"
          ? el.checked
          : ["birthday", "anniversary"].includes(k)
            ? el.value.slice(5)
            : el.value.trim();
    });
    if (j.marital_status !== "Married") j.anniversary = "";
  }
  function joinValidation() {
    const j = state.join;
    const errs = [];
    if (state.joinStep === 0) {
      for (const [key, label] of [
        ["surname", "surname"],
        ["other_names", "other names"],
        ["visit_date", "visit date"],
      ])
        if (!j[key]) errs.push("Enter your " + label + ".");
      if (j.visit_date > "2026-10-08")
        errs.push("Your visit date cannot be in the future.");
    }
    if (state.joinStep === 1) {
      if (!validPhone(j.phone || ""))
        errs.push("Enter a valid Nigerian mobile number, e.g. 08000000000.");
      if (j.email && !validEmail(j.email))
        errs.push("Enter a valid email address.");
      if (j.emailOpt && !j.email)
        errs.push("Add an email address to enable email messages.");
      if (!validMilestone(j.birthday) || !validMilestone(j.anniversary))
        errs.push("Check your celebration dates.");
    }
    if (state.joinStep === 3 && !j.contact_consent)
      errs.push(
        "Please give permission for the church to contact you about your visit.",
      );
    return errs;
  }
  function preferences(id) {
    const m = statusMember(id) || state.members[0];
    return (
      title(
        "Member message preferences",
        "Preview the link members open from their messages.",
      ) +
      `<section class="card preferences"><div class="card-pad"><div class="brand-inline"><img src="/assets/image-7d4e31b34082.png" alt="">Vine Branch Church</div><div class="eyebrow">You’re in control</div><h1>Stay connected,<br>your way.</h1><p class="muted mt" style="font-size:.875rem">Hi ${esc(m.first)}, choose the messages you’d like to receive.</p>${state.preferenceSaved ? '<div class="notice success" role="status">Your preferences have been updated in this prototype.</div>' : ""}<form id="preferences-form" data-id="${m.id}"><h3>Choose your channels</h3>${check("pref-emailOpt", "Email messages", m.emailOpt)}${check("pref-smsOpt", "SMS / text messages", m.smsOpt)}<h3 class="mt">Choose your messages</h3>${check("pref-celebrationOpt", "Birthday & anniversary greetings", m.celebrationOpt)}${check("pref-programmeOpt", "Special programme invitations", m.programmeOpt)}${check("pref-newsletterOpt", "Monthly church newsletter", m.newsletterOpt)}<div class="button-row"><button class="btn primary" type="submit">Save preferences</button>${btn("Unsubscribe from all", "unsubscribe", "danger", 'data-id="' + m.id + '"')}</div></form><p class="help-text">This sample preference link is for Tomi or the selected fictional member. Production links need a secure, individual token.</p></div></section>`
    );
  }
  function access(sub) {
    const recovery = sub === "recover";
    return (
      title("Team access", "Preview the staff sign-in and recovery screens.") +
      `<section class="card preferences"><div class="card-pad"><div class="brand-inline"><img src="/assets/image-7d4e31b34082.png" alt="">Vine Branch Church</div><h1>${recovery ? "Recover your access" : "Welcome back."}</h1><p class="muted mt" style="font-size:.875rem">${recovery ? "Enter your church team email to request a recovery link." : "Sign in to care for the church family."}</p><div class="notice">Design preview only. Use fictional details; this form does not authenticate or send email.</div><form id="access-form" data-recover="${recovery}" novalidate><div id="access-errors"></div>${field("access-email", "Team email <span>*</span>", "care.team@example.com", "email")}${!recovery ? field("access-password", "Password <span>*</span>", "demo-password", "password", 'autocomplete="off"') : ""}<button class="btn primary w100" type="submit">${recovery ? "Preview recovery confirmation" : "Enter demo dashboard"}</button></form><div class="mt" style="text-align:center"><a class="text-link" href="/access${recovery ? "" : "/recover"}" data-care-route="">${recovery ? "Return to sign in" : "Forgot your password?"}</a></div></div></section>`
    );
  }
  function newsletterRecipients() {
    return Array.from(
      new Map(
        state.members
          .filter((m) => m.newsletterOpt && m.emailOpt && m.email)
          .map((m) => [m.email.toLowerCase(), m]),
      ).values(),
    );
  }
  function calculateBudget() {
    const b = state.budget;
    const greetings = (b.members * (1 + b.married / 100)) / 12,
      invites = b.members * b.invites,
      newsletterEmails = b.members * b.newsletters;
    const smsMessages =
      ((b.smsMode === "greetings" ? greetings : greetings + invites) *
        b.smsAudience) /
      100;
    const sms = smsMessages * b.segments * b.smsRate;
    const usd = b.hosting + b.database + b.email;
    return {
      greetings,
      invites,
      newsletterEmails,
      emailVolume: greetings + invites + newsletterEmails,
      smsMessages,
      sms,
      smsVAT: sms * 0.075,
      usd,
      total: usd * b.fx + sms * 1.075,
    };
  }
  function budget() {
    const b = state.budget,
      c = calculateBudget();
    return (
      title(
        "Start lean. Grow with care.",
        "Netlify deployment plan · Prices checked 8 October 2026.",
        link("Review newsletter", "newsletters"),
      ) +
      `<div class="grid equal"><section class="card"><div class="card-head"><h2>Your monthly scenario</h2></div><form class="card-pad" id="budget-form"><div class="form-grid">${select(
        "budget-hosting",
        "Netlify hosting",
        [
          ["0", "Free · $0"],
          ["9", "Personal · $9"],
          ["20", "Pro · from $20"],
        ],
        String(b.hosting),
      )}${select(
        "budget-database",
        "Supabase database",
        [
          ["0", "Free · $0"],
          ["25", "Pro · from $25"],
        ],
        String(b.database),
      )}${field("budget-email", "Brevo plan allowance ($ / month)", b.email, "number", 'min="0" step="1"')}${field("budget-members", "Email-eligible members", b.members, "number", 'min="1" max="100000"')}${field("budget-married", "With an anniversary (%)", b.married, "number", 'min="0" max="100"')}${field("budget-invites", "Invitations / month", b.invites, "number", 'min="0" max="50"')}${field("budget-newsletters", "Newsletters / month", b.newsletters, "number", 'min="0" max="12"')}${field("budget-smsAudience", "SMS-eligible audience (%)", b.smsAudience, "number", 'min="0" max="100"')}${select(
        "budget-smsMode",
        "Use paid SMS for",
        [
          ["all", "Greetings & invitations"],
          ["greetings", "Greetings only"],
        ],
        b.smsMode,
      )}${field("budget-segments", "Average segments / SMS", b.segments, "number", 'min="1" max="10" step="1"')}${field("budget-smsRate", "SMS rate / segment (₦)", b.smsRate, "number", 'min="0" step="0.01"')}${field("budget-fx", "Planning conversion (₦ / $)", b.fx, "number", 'min="1"')}</div><p class="hint">₦1,600/$ is a planning assumption, not a live exchange rate. SMS rate is a published alternative-provider benchmark, not Termii pricing.</p><button class="btn navy" type="submit">Update estimate</button></form></section><section><div class="budget-total"><small>MONTHLY SERVICES ESTIMATE</small><strong>${money(c.total)} / month</strong><p>$${c.usd} hosting, database & email<br>+ ${money(c.sms * 1.075)} paid SMS including benchmark VAT</p></div><section class="card"><div class="card-pad"><h2>Volume & allowance</h2><div class="budget-line"><span>Birthday & anniversary average</span><strong>${Math.round(c.greetings)}/month</strong></div><div class="budget-line"><span>Programme invitations</span><strong>${c.invites.toLocaleString()}/month</strong></div><div class="budget-line"><span>Monthly newsletters</span><strong>${c.newsletterEmails.toLocaleString()}/month</strong></div><div class="budget-line"><span>Total estimated emails</span><strong>${Math.round(c.emailVolume).toLocaleString()}/month</strong></div><div class="budget-line"><span>Brevo Free daily email limit</span><strong>300/day</strong></div><div class="budget-line"><span>Newsletter window at 250/day</span><strong>${Math.ceil(b.members / 250)} days/issue</strong></div><div class="help-text">Monthly totals cannot replace the daily cap. Other email activity in the same Brevo account uses the same allowance. SMS is paid separately and newsletters are email only.</div></div></section><div class="notice mt">${b.email === 0 ? "Brevo Free: keep all email types together below 300 per day. Unused sends do not roll over. Newsletters larger than the available daily allowance need multiple batches." : b.members > 500 ? "Brevo’s $9 starting tier permits up to 500 stored contacts. Obtain a higher-tier quote for this audience and enter it above." : "Brevo Starter starts at $9/month with no daily sending cap; confirm the contact/send tier and actual invoice."}</div><div class="notice amber">Free hosting/database remain subject to quotas and availability: Supabase can pause after low activity over 7 days; Netlify credit exhaustion pauses the team’s projects. Paid SMS and development are additional.</div></section></div><div class="grid equal mt"><section class="card source-card"><a href="https://www.netlify.com/pricing/" target="_blank" rel="noopener">Netlify deployment</a><p>Current Free includes 300 usage credits/month, shared across the team. Traffic, compute and production deploys consume credits. Legacy accounts can have different limits. Scheduled Functions are available on all plans.</p></section><section class="card source-card"><a href="https://supabase.com/pricing" target="_blank" rel="noopener">Supabase Free</a><p>500 MB database, 1 GB file storage, 50,000 monthly active users and 500,000 Edge Function invocations/month. These are database/backend limits, not free email or SMS credits. Pro starts at $25/month.</p></section><section class="card source-card"><a href="https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan" target="_blank" rel="noopener">Brevo Free</a><p>300 emails/day, up to 100,000 contacts, Brevo branding and one provider-account user. Native campaigns above the cap require requeueing; production batching needs a compliant campaign workflow.</p></section><section class="card source-card"><a href="https://www.bulksmsnigeria.com/pricing" target="_blank" rel="noopener">Paid SMS benchmark</a><p>₦6.49 per segment excluding 7.5% VAT. Termii’s current SMS rate requires its own rate-card quote. Keeping email free does not make SMS free.</p></section></div><section class="card mt"><div class="card-head"><h2>Production build allowance</h2></div><div class="card-pad"><p class="hint">Original full-system planning allowance: 160–260 development hours, including the newsletter editor and shared daily-cap queue. At an illustrative ₦10,000/hour, ₦1.6m–₦2.6m. Refine after agreeing scope; this is not a contractor quote. Free service plans reduce recurring service fees, not implementation work.</p></div></section>`
    );
  }
  function guide() {
    return (
      title(
        "Review the whole experience",
        "Start with a visitor, then follow their record into the care desk.",
        link("Start visitor journey", "join", "primary"),
      ) +
      (options.memberDirectorySaved
        ? '<div class="notice mb"><strong>The Members directory now saves records.</strong><br>Members and UUID profiles save details, permissions with evidence, care notes and archive/restore changes. Visitor registration, CSV import, sample profiles and messaging remain previews; visitor submissions will be connected in a following stage.</div>'
        : "") +
      `<section class="card"><div class="guide-row"><span class="guide-number">01</span><div><a href="/join" data-care-route="">Register a fictional visitor</a><p>Use “Try fictional visitor”, move through all four steps and submit. The welcome message links to the new member record.</p></div></div><div class="guide-row"><span class="guide-number">02</span><div><a href="/members" data-care-route="">Review members and permissions</a><p>Search, filter, open a profile, edit milestone dates and inspect communication history. Try the CSV import with duplicates and invalid rows.</p></div></div><div class="guide-row"><span class="guide-number">03</span><div><a href="/automations" data-care-route="">Set up milestone greetings</a><p>Configure send time, channels, templates and the 29 February rule. Pause or resume a rule, then preview its greeting.</p></div></div><div class="guide-row"><span class="guide-number">04</span><div><a href="/compose" data-care-route="">Compose a programme invitation</a><p>Choose a programme, audience and channel; edit personalised messages; review eligible recipients, SMS segments and the schedule.</p></div></div><div class="guide-row"><span class="guide-number">05</span><div><a href="/delivery" data-care-route="">Inspect delivery and preferences</a><p>Open the failed anniversary email and simulate a retry. Review the member-facing preference and unsubscribe journey.</p></div></div><div class="guide-row"><span class="guide-number">06</span><div><a href="/budget" data-care-route="">Adjust your running costs</a><p>Compare SMS for every invitation against SMS for milestones only. Change the member count, rate, message length and FX planning assumption.</p></div></div></section><h2 class="mt mb">Screen inventory</h2><div class="review-map">${[
        [
          "access",
          "Sign-in & recovery",
          "Team sign-in, validation and recovery confirmation",
        ],
        [
          "overview",
          "Care overview",
          "Milestones, recent visitors, invitations and delivery issues",
        ],
        [
          "members",
          "Member directory",
          "Search, filters, selection and empty state",
        ],
        [
          "profile/m1",
          "Member profile",
          "Contacts, dates, notes, preferences and communication history",
        ],
        [
          "import",
          "CSV import",
          "Upload, mapping, duplicate review and completion",
        ],
        [
          "celebrations",
          "Milestone calendar",
          "Birthday and anniversary tabs, dates and greeting preview",
        ],
        ["programmes", "Programmes", "Programme cards and create/edit dialog"],
        [
          "compose",
          "Campaign composer",
          "Programme, channel, audience, message, review and success",
        ],
        ["campaigns", "Campaign list", "Drafts and scheduled invitations"],
        [
          "newsletters",
          "Monthly newsletters",
          "Graphic-rich issue editor, illustrated stories, programme schedule and daily-cap batch review",
        ],
        [
          "templates",
          "Email & SMS templates",
          "Original birthday, anniversary and invitation designs; editable artwork and mobile previews",
        ],
        [
          "automations",
          "Automation rules",
          "Enabled/paused states, channels, send time and leap dates",
        ],
        [
          "delivery",
          "Delivery reports",
          "Delivered, failed, queued, details and simulated retry",
        ],
        [
          "settings",
          "Church settings",
          "Sender identity, timezone and SMS planning limit",
        ],
        [
          "settings/providers",
          "Provider connections",
          "Production setup requirements for email, SMS and records",
        ],
        [
          "settings/team",
          "Team roles",
          "Administrator, editor, viewer and invitation preview",
        ],
        [
          "join",
          "Visitor registration",
          "Four-step form, validation, preferences and welcome message",
        ],
        [
          "preferences",
          "Member preferences",
          "Channel/topic choices and unsubscribe confirmation",
        ],
        [
          "budget",
          "Costs & sources",
          "Netlify, Supabase and Brevo free/paid scenarios; newsletter volume",
        ],
      ]
        .map(
          ([r, n, d]) =>
            `<a href="/${r}" data-care-route=""><strong>${n}</strong><small>${d}</small></a>`,
        )
        .join(
          "",
        )}</div><section class="card mt"><div class="card-head"><h2>Public UI references researched</h2></div><div class="card-pad"><p class="hint">Original Vine Branch screens informed by public product documentation. Reference screenshots were reviewed for interaction patterns; their visual designs and sample member records are not reused.</p><div class="grid equal mt"><div><a class="text-link" href="https://help.planningcenter.com/en/138555-utilize-the-overview-page.html" target="_blank" rel="noopener">Planning Center · People overview</a><p class="hint mt">At-a-glance care information and recent profiles.</p></div><div><a class="text-link" href="https://help.planningcenter.com/en/144367-view-communication-history-in-people.html" target="_blank" rel="noopener">Planning Center · Communication history</a><p class="hint mt">Profile-level history and visible delivery failures.</p></div><div><a class="text-link" href="https://support.churchsuite.com/article/425-communicating-to-individuals-and-groups-through-churchsuite" target="_blank" rel="noopener">ChurchSuite · Communication workflows</a><p class="hint mt">Messaging from member lists and respecting channel preferences.</p></div><div><a class="text-link" href="https://vinebranchchurch.org/" target="_blank" rel="noopener">Vine Branch · Existing identity</a><p class="hint mt">Navy #000956, red #ED1C24, Anton headings and Poppins body.</p></div></div><div class="notice mt no-margin">This prototype uses in-memory sample data. The production build needs database storage, staff authentication, a secure form endpoint and actual email/SMS integrations. The live church website has not been changed.</div></div></section><section class="card mt"><div class="card-head"><h2>Email design references</h2></div><div class="card-pad"><p class="hint">Original Vine Branch layouts informed by public email design examples. Sample celebration and stage artworks were generated for this prototype; the stage does not represent a real church programme.</p><div class="grid equal mt"><div><a class="text-link" href="https://beefree.io/blog/13-best-free-responsive-email-marketing-templates" target="_blank" rel="noopener">Beefree / RGE · Birthday and editorial layouts</a><p class="hint mt">Celebration banners, a personal greeting and illustrated newsletter sections.</p></div><div><a class="text-link" href="https://templates.mailchimp.com/design/layout-and-purpose/" target="_blank" rel="noopener">Mailchimp · Purpose-built email design</a><p class="hint mt">Clear programme details, readable text and a prominent next action.</p></div><div><a class="text-link" href="https://help.brevo.com/hc/en-us/articles/30252419144978-Insert-and-edit-images-in-your-email-designs" target="_blank" rel="noopener">Brevo · Images and alt text</a><p class="hint mt">Reusable hosted artwork, image descriptions and images-off review.</p></div></div></div></section>`
    );
  }
  function reportErrors(id, errors) {
    const box = $("#" + id);
    if (!box) return;
    box.innerHTML = errors.length
      ? `<div class="notice red" role="alert" tabindex="-1"><strong>Please check these details</strong><ul class="screen-list">${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`
      : "";
    if (errors.length) $(".notice", box).focus();
  }
  function saveDraft(schedule = false) {
    captureCampaign();
    const d = state.draft;
    d.name = d.name || "Untitled invitation";
    d.status = schedule ? "Demo scheduled" : "Draft";
    if (!d.id) d.id = "c" + Date.now();
    const i = state.campaigns.findIndex((c) => c.id === d.id);
    if (i < 0) state.campaigns.unshift(JSON.parse(JSON.stringify(d)));
    else state.campaigns[i] = JSON.parse(JSON.stringify(d));
    if (schedule) {
      state.campaignSuccess = true;
      render();
    } else {
      toast("Draft saved for this review session.");
      go("campaigns");
    }
  }
  function startCampaign(overrides = {}) {
    state.draft = { ...defaultDraft(), ...overrides };
    state.campaignStep = 0;
    state.campaignSuccess = false;
    go("compose");
  }
  listen(root, "click", (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action,
      id = b.dataset.id,
      v = b.dataset.value;
    if (b.disabled) return;
    const acts = {
      close: () => {
        modal.close();
        modal.classList.remove("email-modal");
      },
      "email-device": () => {
        captureEmailEditors();
        state.emailDevice = v;
        render();
      },
      "email-images": () => {
        captureEmailEditors();
        state.emailImages = !state.emailImages;
        render();
      },
      "email-full": () => emailFullPreview(),
      "email-image-reset": () => emailArtAction(a, b.dataset.prefix),
      "email-image-remove": () => emailArtAction(a, b.dataset.prefix),
      "choose-email-template": () => {
        captureTemplate();
        state.templateId = id;
        state.templateChannel = "email";
        render();
      },
      "new-newsletter": () => {
        captureNewsletter();
        const n = {
          ...JSON.parse(JSON.stringify(state.newsletters[0])),
          id: "n" + Date.now(),
          name: "New monthly newsletter",
          subject: "",
          body: "Dear {{first_name}},\n\n",
          status: "Draft",
        };
        state.newsletters.unshift(n);
        state.newsletterId = n.id;
        state.newsletterSuccess = false;
        render();
      },
      "open-newsletter": () => {
        captureNewsletter();
        state.newsletterId = id;
        state.newsletterSuccess = false;
        render();
      },
      "confirm-newsletter": () => {
        const n = state.newsletters.find((n) => n.id === id);
        if (!$("#newsletter-confirm")?.checked) {
          $("#newsletter-confirm-error").textContent =
            "Confirm that you have reviewed the content, recipients and batch plan.";
          return;
        }
        n.status = "Demo scheduled";
        state.newsletterSuccess = true;
        modal.close();
        render();
      },
      profile: () => {
        state.profileTab = "details";
        go("profile/" + id);
      },
      "add-member": () => memberDialog(),
      "edit-member": () => memberDialog(id),
      "start-import": () => {
        state.importStep = 0;
        go("import");
      },
      "sample-import": () => {
        try {
          loadCSV(sampleCSV);
        } catch (err) {
          reportErrors("import-errors", [err.message]);
        }
      },
      "download-csv": () => {
        const blob = new Blob([sampleCSV.split("\n")[0] + "\n"], {
            type: "text/csv",
          }),
          url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = "VBC_Member_Import_Template.csv";
        a.click();
        URL.revokeObjectURL(url);
      },
      "review-import": () => {
        Object.keys(state.importMapping).forEach(
          (k) => (state.importMapping[k] = Number($("#map-" + k).value)),
        );
        if (
          state.importMapping.first < 0 ||
          state.importMapping.last < 0 ||
          (state.importMapping.email < 0 && state.importMapping.phone < 0)
        ) {
          reportErrors("import-errors", [
            "Map first name, surname and at least one contact column.",
          ]);
          return;
        }
        state.importStep = 2;
        render();
      },
      "import-back": () => {
        state.importStep = 1;
        render();
      },
      "finish-import": () => {
        const ready = importPreview().filter((p) => !p.error);
        for (const { m } of ready)
          state.members.push({
            ...m,
            id: "m" + Date.now() + state.members.length,
            status: "Visitor",
            joined: "2026-10-08",
            emailOpt: false,
            smsOpt: false,
            celebrationOpt: false,
            programmeOpt: false,
            notes: "",
            address: "",
            occupation: "",
          });
        toast(ready.length + " records imported. Message permissions are off.");
        state.importStep = 0;
        go("members");
      },
      "reset-filters": () => {
        state.search = "";
        state.filter = "all";
        state.channelFilter = "all";
        render();
      },
      "clear-selection": () => {
        state.selected.clear();
        render();
      },
      "bulk-campaign": () =>
        startCampaign({ audience: "selected", selected: [...state.selected] }),
      "member-campaign": () =>
        startCampaign({ audience: "selected", selected: [id] }),
      "profile-tab": () => {
        state.profileTab = v;
        render();
      },
      "preview-preferences": () => {
        state.preferenceSaved = false;
        go("preferences/" + id);
      },
      "cal-type": () => {
        state.calType = v;
        render();
      },
      "cal-day": () => {
        state.calDay = Number(b.dataset.day);
        render();
      },
      "cal-month": () => {
        state.calMonth = (state.calMonth + Number(b.dataset.delta) + 12) % 12;
        state.calDay = 1;
        render();
      },
      "celebration-template": () => {
        state.templateId = id;
        go("templates");
      },
      "add-event": () => eventDialog(),
      "edit-event": () => eventDialog(id),
      "event-campaign": () =>
        startCampaign({
          event: id,
          name: state.events.find((e) => e.id === id).title + " invitation",
        }),
      "new-campaign": () => startCampaign(),
      "review-campaign": () => {
        state.draft = null;
        state.campaignSuccess = false;
        state.campaignStep = 0;
        go("compose/" + id);
      },
      "save-draft": () => saveDraft(),
      "campaign-back": () => {
        captureCampaign();
        state.campaignStep--;
        render();
      },
      "insert-token": () => {
        const el = $("#campaign-body") || $("#campaign-sms");
        if (!el) return;
        const start = el.selectionStart,
          end = el.selectionEnd;
        el.value =
          el.value.slice(0, start) +
          "{{" +
          b.dataset.token +
          "}}" +
          el.value.slice(end);
        el.focus();
        el.selectionStart = el.selectionEnd =
          start + b.dataset.token.length + 4;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      "template-channel": () => {
        captureTemplate();
        state.templateChannel = v;
        render();
      },
      "template-test": () => {
        const t = state.templates.find((t) => t.id === state.templateId);
        showModal(
          "Test preview",
          `<div class="notice success">The ${esc(t.name)} preview is ready.</div><p class="hint">This is a preview confirmation. No message was sent to an email address or phone number.</p>`,
          btn("Done", "close", "primary"),
        );
      },
      "toggle-automation": () => {
        const r = state.automations.find((a) => a.id === id);
        r.on = !r.on;
        render();
        toast(
          r.name + " " + (r.on ? "enabled" : "paused") + " in the prototype.",
        );
      },
      "configure-automation": () => automationDialog(id),
      "automation-preview": () => {
        state.templateId = state.automations.find((a) => a.id === id).template;
        go("templates");
      },
      "delivery-filter": () => {
        state.deliveryFilter = v;
        render();
      },
      "log-detail": () => logDialog(id),
      "retry-log": () => {
        const l = state.logs.find((l) => l.id === id);
        if (l.status !== "Failed") return;
        l.status = "Queued";
        l.error = "";
        modal.close();
        render();
        toast("Retry queued in the prototype. No message was sent.");
      },
      "settings-tab": () => {
        state.settingsTab = v;
        go("settings/" + v);
      },
      "provider-help": () =>
        showModal(
          "Production setup",
          v === "email"
            ? '<ol class="screen-list"><li>Create the church-owned email provider account and select the correct contact tier.</li><li>Approve the sender and add the provider’s domain-verification records.</li><li>Configure email delivery callbacks and member preference links.</li><li>Run a controlled delivery test before activating any campaigns.</li></ol>'
            : v === "sms"
              ? '<ol class="screen-list"><li>Choose the SMS provider and confirm Nigerian network routes.</li><li>Request the current segment rate and sender ID approval.</li><li>Configure provider-supported opt-out handling, delivery callbacks and a spend limit.</li><li>Fund a small test allowance and verify delivery to church-owned test phones.</li></ol>'
              : '<ol class="screen-list"><li>Create the church-owned database and staff authentication.</li><li>Apply role-based access, backups and member preference records.</li><li>Connect the Elementor form to a validated server endpoint.</li><li>Add scheduled jobs with duplicate-send prevention and delivery logs.</li></ol>',
          btn("Close", "close", "primary"),
        ),
      "team-invite": () =>
        showModal(
          "Invite a teammate",
          `<form id="team-form" novalidate><div id="team-errors"></div>${field("team-email", "Team email <span>*</span>", "", "email")}${select("team-role", "Role", ["Editor", "Viewer", "Administrator"], "Editor")}<p class="hint">Invitation preview only. No email or staff account is created.</p></form>`,
          btn("Cancel", "close") +
            '<button class="btn primary" type="submit" form="team-form">Preview invitation</button>',
        ),
      "sample-join": () => {
        state.join = {
          surname: "Ogunleye",
          other_names: "Kemi",
          visit_date: "2026-10-08",
          occupation: "Architect",
          gender: "Female",
          age_range: "26–35",
          marital_status: "Married",
          phone: "08000001100",
          email: "kemi.ogunleye@example.com",
          residential_address: "Ibadan, Oyo State",
          birthday: "05-19",
          anniversary: "11-12",
          emailOpt: true,
          smsOpt: true,
          celebrationOpt: true,
          programmeOpt: true,
          newsletterOpt: true,
          born_again: "Yes",
          home_visit: "Yes",
          discovery_source: "A friend or family",
          invited_by: "Tomi Adeyemi",
          discovery_details: "",
          contact_consent: false,
        };
        state.joinStep = 0;
        state.joinDone = false;
        render();
        focusJoinStep();
      },
      "join-back": () => {
        captureJoin();
        state.joinStep--;
        render();
        focusJoinStep();
      },
      "restart-join": () => {
        state.join = {};
        state.joinStep = 0;
        state.joinDone = false;
        render();
        focusJoinStep();
      },
      unsubscribe: () =>
        showModal(
          "Unsubscribe from all messages",
          '<p>Turn off email, SMS, milestone greetings, programme invitations and newsletters for this fictional member?</p><p class="hint">You can turn them back on from the preference page.</p>',
          btn("Keep preferences", "close") +
            btn(
              "Confirm unsubscribe",
              "confirm-unsubscribe",
              "primary",
              'data-id="' + id + '"',
            ),
        ),
      "confirm-unsubscribe": () => {
        const m = statusMember(id);
        for (const k of [
          "emailOpt",
          "smsOpt",
          "celebrationOpt",
          "programmeOpt",
          "newsletterOpt",
        ])
          m[k] = false;
        state.preferenceSaved = true;
        modal.close();
        render();
        toast("All message preferences turned off.");
      },
    };
    if (acts[a]) acts[a]();
  });
  listen(root, "submit", (e) => {
    const f = e.target;
    if (!f.id) return;
    e.preventDefault();
    if (f.id === "newsletter-form") {
      captureNewsletter();
      const n = state.newsletters.find((n) => n.id === f.dataset.id);
      const x = {
        name: $("#newsletter-name").value.trim(),
        month: $("#newsletter-month").value,
        subject: $("#newsletter-subject").value.trim(),
        body: $("#newsletter-body").value.trim(),
        schedule: $("#newsletter-schedule").value,
        batch: Number($("#newsletter-batch").value),
        reserve: Number($("#newsletter-reserve").value),
      };
      const errs = designErrors(n);
      const newsletterText = [
        x.subject,
        x.body,
        n.design.headline,
        n.design.preheader,
        n.design.quote,
        ...n.stories.flatMap((s) => [s.title, s.body]),
      ].join(" ");
      if (
        [...newsletterText.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].some(
          (m) => m[1] !== "first_name",
        )
      )
        errs.push(
          "Use {{first_name}} as the newsletter personalisation field.",
        );
      if (!x.name || !x.month || !x.subject || !x.body)
        errs.push("Enter an issue name, month, subject and message.");
      if (!x.schedule || x.schedule <= "2026-10-08T10:00")
        errs.push("Choose a future start time.");
      if (
        x.batch < 1 ||
        x.batch > 300 ||
        x.reserve < 0 ||
        x.reserve > 299 ||
        x.batch + x.reserve > 300
      )
        errs.push(
          "Batch size plus the reserved daily allowance must not exceed 300.",
        );
      if (!newsletterRecipients().length)
        errs.push("No members have enabled email and newsletter preferences.");
      if (
        [...(x.subject + " " + x.body).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].some(
          (m) => m[1] !== "first_name",
        )
      )
        errs.push(
          "Use {{first_name}} as the newsletter personalisation field.",
        );
      if (errs.length) {
        reportErrors("newsletter-errors", errs);
        return;
      }
      Object.assign(n, x);
      const total = newsletterRecipients().length;
      showModal(
        "Review newsletter",
        `<dl class="detail-list mb"><div><dt>Issue</dt><dd>${esc(n.name)}</dd></div><div><dt>Email recipients</dt><dd>${total}</dd></div><div><dt>Batch size</dt><dd>Up to ${n.batch}/day</dd></div><div><dt>Minimum sending days</dt><dd>${Math.ceil(total / n.batch)}</dd></div><div><dt>Daily priority reserve</dt><dd>${n.reserve} emails</dd></div><div><dt>Starts · Lagos</dt><dd>${dateLabel(n.schedule.slice(0, 10))} · ${n.schedule.slice(11)}</dd></div></dl><div class="notice">The production worker sends due greetings first and checks the account-wide remaining allowance before each batch. Other campaigns can extend the sending window.</div>${check("newsletter-confirm", "I have reviewed the newsletter, preferences and daily allowance.")}<p id="newsletter-confirm-error" class="error" role="alert"></p>`,
        btn("Keep editing", "close") +
          btn(
            "Simulate schedule",
            "confirm-newsletter",
            "primary",
            'data-id="' + n.id + '"',
          ),
      );
    }
    if (f.id === "member-form") {
      const old = statusMember(f.dataset.id);
      const value = (k) => $("#member-" + k).value.trim();
      const m = {
        first: value("first"),
        last: value("last"),
        email: value("email"),
        phone: value("phone"),
        status: value("type"),
        occupation: value("occupation"),
        address: value("address"),
        birthday: value("birthday").slice(5),
        anniversary: value("anniversary").slice(5),
      };
      for (const k of [
        "emailOpt",
        "smsOpt",
        "celebrationOpt",
        "programmeOpt",
        "newsletterOpt",
      ])
        m[k] = $("#member-" + k).checked;
      const errs = [];
      if (!m.first || !m.last)
        errs.push("Enter the member’s first name and surname.");
      if (!m.email && !m.phone) errs.push("Add at least one contact method.");
      if (m.email && !validEmail(m.email))
        errs.push("Enter a valid email address.");
      if (m.phone && !validPhone(m.phone))
        errs.push("Enter a valid Nigerian mobile number.");
      if (m.emailOpt && !m.email)
        errs.push("Email permission requires an email address.");
      if (m.smsOpt && !m.phone)
        errs.push("SMS permission requires a mobile number.");
      if (!validMilestone(m.birthday) || !validMilestone(m.anniversary))
        errs.push("Check the milestone dates.");
      if (
        state.members.some(
          (x) =>
            x.id !== old?.id &&
            ((m.email && x.email.toLowerCase() === m.email.toLowerCase()) ||
              (m.phone && normalizePhone(x.phone) === normalizePhone(m.phone))),
        )
      )
        errs.push("This email or phone already belongs to another member.");
      if (errs.length) {
        reportErrors("member-errors", errs);
        return;
      }
      if (old) Object.assign(old, m);
      else
        state.members.unshift({
          ...m,
          id: "m" + Date.now(),
          joined: "2026-10-08",
          notes: "",
        });
      modal.close();
      render();
      toast("Member saved for this review session.");
    }
    if (f.id === "event-form") {
      const value = (k) => $("#event-" + k).value.trim();
      const data = {
        title: value("title"),
        date: value("date"),
        time: value("time"),
        venue: value("venue"),
        description: value("description"),
        link: value("link"),
      };
      const errs = [];
      if (!data.title || !data.date || !data.time || !data.venue)
        errs.push("Enter a name, date, time and venue.");
      if (data.link && !/^https?:\/\//.test(data.link))
        errs.push("Use a complete http or https information link.");
      if (errs.length) {
        reportErrors("event-errors", errs);
        return;
      }
      const old = state.events.find((x) => x.id === f.dataset.id);
      if (old) Object.assign(old, data);
      else state.events.unshift({ ...data, id: "e" + Date.now() });
      modal.close();
      render();
      toast("Programme saved in the prototype.");
    }
    if (f.id === "note-form") {
      statusMember(f.dataset.id).notes = $("#care-note").value.trim();
      toast("Care note saved for this review session.");
    }
    if (f.id === "campaign-form") {
      captureCampaign();
      const errs = validateCampaign(state.campaignStep);
      if (errs.length) {
        reportErrors("campaign-errors", errs);
        return;
      }
      if (state.campaignStep === 3) saveDraft(true);
      else {
        state.campaignStep++;
        render();
      }
    }
    if (f.id === "template-form") {
      captureTemplate();
      const t = state.templates.find((t) => t.id === f.dataset.id),
        sms = state.templateChannel === "sms",
        errs = [];
      if (!(sms ? t.sms : t.body).trim() || (!sms && !t.subject.trim()))
        errs.push("Enter a message and, for email, a subject.");
      if (!sms) errs.push(...designErrors(t));
      const copy = [
          sms ? t.sms : t.body,
          !sms ? t.subject : "",
          !sms ? t.design.headline : "",
          !sms ? t.design.preheader : "",
          !sms ? t.design.quote : "",
        ].join(" "),
        allowed =
          t.kind === "Invitation"
            ? ["first_name", "programme", "date", "time", "venue"]
            : ["first_name"];
      if (
        [...copy.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].some(
          (m) => !allowed.includes(m[1]),
        )
      )
        errs.push("Use only the supported personalisation fields.");
      if (errs.length) {
        reportErrors("template-errors", errs);
        return;
      }
      toast("Template saved for this review session.");
      render();
    }
    if (f.id === "automation-form") {
      const a = state.automations.find((a) => a.id === f.dataset.id);
      a.time = $("#automation-time").value;
      a.channel = $("#automation-channel").value;
      a.template = $("#automation-template").value;
      a.leap = $("#automation-leap").value;
      modal.close();
      render();
      toast("Greeting rule updated in the prototype.");
    }
    if (f.id === "settings-form") {
      const errs = [];
      const value = (k) => $("#settings-" + k).value.trim();
      if (!value("sender")) errs.push("Enter a sender display name.");
      if (!validEmail(value("email"))) errs.push("Enter a valid sender email.");
      if (!/^[A-Za-z][A-Za-z0-9]{2,10}$/.test(value("smsSender")))
        errs.push(
          "Use a sender ID of 3–11 letters or digits, beginning with a letter.",
        );
      if (Number(value("budget")) < 0)
        errs.push("The SMS planning limit cannot be negative.");
      if (errs.length) {
        reportErrors("settings-errors", errs);
        return;
      }
      for (const k of ["sender", "email", "smsSender", "timeZone"])
        state.settings[k] = value(k);
      state.settings.budget = Number(value("budget"));
      toast("Settings saved for this review session.");
    }
    if (f.id === "team-form") {
      if (!validEmail($("#team-email").value.trim())) {
        reportErrors("team-errors", ["Enter a valid team email."]);
        return;
      }
      showModal(
        "Invitation preview ready",
        '<div class="notice success">The teammate invitation confirmation has been previewed.</div><p class="hint">No email was sent and no account was created.</p>',
        btn("Done", "close", "primary"),
      );
    }
    if (f.id === "join-form") {
      captureJoin();
      const errs = joinValidation();
      if (errs.length) {
        reportErrors("join-errors", errs);
        return;
      }
      if (state.joinStep < 3) {
        state.joinStep++;
        render();
        focusJoinStep();
      } else {
        const j = state.join;
        const existing = state.members.find(
          (m) =>
            normalizePhone(m.phone) === normalizePhone(j.phone) ||
            (j.email && m.email.toLowerCase() === j.email.toLowerCase()),
        );
        if (existing) {
          reportErrors("join-errors", [
            "This contact already has a sample record. Use another fictional email and mobile number to review a new registration.",
          ]);
          return;
        }
        j.memberId = "m" + Date.now();
        state.members.unshift({
          id: j.memberId,
          first: j.other_names,
          last: j.surname,
          status: "Visitor",
          birthday: j.birthday || "",
          anniversary: j.anniversary || "",
          email: j.email || "",
          phone: j.phone,
          joined: j.visit_date,
          address: j.residential_address || "",
          occupation: j.occupation || "",
          notes: "",
          emailOpt: !!j.emailOpt,
          smsOpt: !!j.smsOpt,
          celebrationOpt: !!j.celebrationOpt,
          programmeOpt: !!j.programmeOpt,
          newsletterOpt: !!j.newsletterOpt,
        });
        state.joinDone = true;
        render();
        focusJoinStep();
      }
    }
    if (f.id === "preferences-form") {
      const m = statusMember(f.dataset.id);
      for (const k of [
        "emailOpt",
        "smsOpt",
        "celebrationOpt",
        "programmeOpt",
        "newsletterOpt",
      ])
        m[k] = $("#pref-" + k).checked;
      state.preferenceSaved = true;
      render();
    }
    if (f.id === "access-form") {
      const errs = [];
      if (!validEmail($("#access-email").value.trim()))
        errs.push("Enter a valid team email.");
      if (f.dataset.recover === "false" && !$("#access-password").value)
        errs.push("Enter a password for the sign-in preview.");
      if (errs.length) {
        reportErrors("access-errors", errs);
        return;
      }
      if (f.dataset.recover === "true")
        showModal(
          "Recovery confirmation",
          '<p>If this email has a staff account, a recovery link will be sent in production.</p><div class="notice">This prototype has sent no email.</div>',
          btn("Done", "close", "primary"),
        );
      else go("overview");
    }
    if (f.id === "budget-form") {
      const b = state.budget;
      for (const k of Object.keys(b)) {
        const el = $("#budget-" + k);
        if (!el) continue;
        b[k] = k === "smsMode" ? el.value : Number(el.value);
      }
      render();
    }
  });
  listen(root, "input", (e) => {
    const el = e.target;
    if (el.id === "member-search") {
      const pos = el.selectionStart;
      state.search = el.value;
      render();
      $("#member-search").focus();
      $("#member-search").setSelectionRange(pos, pos);
    }
    if (el.id.startsWith("campaign-") && state.draft) {
      captureCampaign();
      const d = state.draft,
        r = recipients(d),
        m = r.email[0] || r.sms[0] || state.members[0];
      if ($("#preview-subject"))
        $("#preview-subject").textContent = personalise(d.subject, m, d.event);
      if ($("#preview-body"))
        $("#preview-body").textContent = personalise(d.body, m, d.event);
      if ($("#sms-preview"))
        $("#sms-preview").textContent = personalise(d.sms, m, d.event);
      if (d.channel === "sms" && $(".phone-preview .sms-bubble"))
        $(".phone-preview .sms-bubble").textContent = personalise(
          d.sms,
          m,
          d.event,
        );
      if ($("#sms-count")) {
        const s = smsInfo(personalise(d.sms, m, d.event));
        $("#sms-count").textContent =
          s.units +
          " units · " +
          s.encoding +
          " · " +
          s.segments +
          " segments for sample recipient";
      }
    }
    if (
      el.id === "template-message" &&
      state.templateChannel === "sms" &&
      $("#template-preview-body")
    )
      $("#template-preview-body").textContent = personalise(el.value);
    if (
      el.closest("#template-form") ||
      el.closest("#newsletter-form") ||
      el.dataset.emailVisual ||
      el.dataset.newsletterStory
    ) {
      captureEmailEditors();
      updateEmailPreview();
    }
    if (el.closest("#campaign-form")) updateEmailPreview();
    if (el.id.endsWith("-image-url")) {
      const prefix = el.dataset.emailVisual;
      if (prefix) {
        captureDesign(activeEmailTarget(prefix), prefix);
        const error = $("#" + prefix + "-image-error");
        if (error)
          error.textContent =
            el.value && !safeEmailLink(el.value)
              ? "Use a complete HTTPS image URL."
              : "";
        updateEmailPreview();
      }
    }
  });
  listen(root, "change", (e) => {
    const el = e.target;
    if (el.dataset.emailUpload) {
      emailUpload(el);
      return;
    }
    if (el.dataset.newsletterEvent) {
      captureNewsletter();
      updateEmailPreview();
      return;
    }
    if (el.id === "newsletter-month") {
      captureNewsletter();
      updateEmailPreview();
    }
    if (el.id === "member-status") {
      state.filter = el.value;
      render();
    }
    if (el.id === "member-channel") {
      state.channelFilter = el.value;
      render();
    }
    if (el.dataset.memberSelect) {
      if (el.checked) state.selected.add(el.dataset.memberSelect);
      else state.selected.delete(el.dataset.memberSelect);
      render();
    }
    if (el.id === "select-all") {
      filteredMembers().forEach((m) =>
        el.checked ? state.selected.add(m.id) : state.selected.delete(m.id),
      );
      render();
    }
    if (el.id === "template-select") {
      captureTemplate();
      state.templateId = el.value;
      render();
    }
    if (
      el.id === "campaign-audience" ||
      el.name === "campaign-channel" ||
      el.id === "campaign-event"
    ) {
      captureCampaign();
      render();
    }
    if (el.id === "csv-upload" && el.files[0]) {
      const file = el.files[0];
      if (file.size > 1000000) {
        reportErrors("import-errors", ["Choose a CSV smaller than 1 MB."]);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          loadCSV(String(reader.result));
        } catch (err) {
          reportErrors("import-errors", [err.message]);
        }
      };
      reader.onerror = () =>
        reportErrors("import-errors", [
          "The file could not be read. Try a new CSV.",
        ]);
      reader.readAsText(file);
    }
  });
  listen($("#menu-toggle"), "click", () => {
    const open = $("#sidebar").classList.toggle("open");
    $("#menu-toggle").setAttribute("aria-expanded", String(open));
    $("#menu-toggle").setAttribute(
      "aria-label",
      open ? "Close navigation" : "Open navigation",
    );
  });
  listen(root, "keydown", (e) => {
    if (e.key === "Escape") {
      $("#sidebar").classList.remove("open");
      $("#menu-toggle").setAttribute("aria-expanded", "false");
    }
  });
  listen(window, "popstate", afterNavigation);
  listen(window, "hashchange", () => {
    if (location.protocol === "file:") afterNavigation();
    else if (location.hash && location.hash !== "#main")
      go(location.hash.slice(1));
  });

  listen(root, "click", (e) => {
    const anchor = e.target.closest("a[data-care-route]");
    if (
      !anchor ||
      e.defaultPrevented ||
      e.button !== 0 ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    e.preventDefault();
    go(anchor.getAttribute("href").slice(1));
  });
  if (
    location.protocol !== "file:" &&
    location.hash &&
    location.hash !== "#main"
  ) {
    window.history.replaceState(null, "", "/" + location.hash.slice(1));
  }
  render();
  return () => {
    disposeTheme();
    lifecycle.abort();
    clearTimeout(toast.timer);
    if (modal.open) modal.close();
  };
}
