export function createDemoState(defaultEmailDesign) {
  const initialNames = [
    ["Tomi", "Adeyemi", "New member", "10-08", "06-14", true, true],
    ["David", "Okafor", "Member", "10-08", "11-18", true, false],
    ["Bisi", "Akinola", "Member", "03-12", "10-08", true, true],
    ["Emmanuel", "Bello", "Visitor", "10-12", "", false, true],
    ["Grace", "Olawale", "New member", "10-15", "04-21", true, true],
    ["Daniel", "Eze", "Member", "10-18", "", true, true],
    ["Funke", "Adesina", "Visitor", "11-07", "", true, false],
    ["Samuel", "Balogun", "New member", "10-22", "10-25", true, true],
    ["Joy", "Ibrahim", "Member", "09-09", "", false, true],
    ["Peter", "Ojo", "Member", "10-27", "03-15", true, true],
    ["Esther", "Nwosu", "Visitor", "", "", false, false],
    ["Taiwo", "Adeleke", "Member", "10-31", "12-03", true, true],
  ];
  const state = {
    members: initialNames.map((x, i) => ({
      id: "m" + (i + 1),
      first: x[0],
      last: x[1],
      status: x[2],
      birthday: x[3],
      anniversary: x[4],
      emailOpt: x[5],
      smsOpt: x[6],
      email:
        i === 10
          ? ""
          : x[0].toLowerCase() + "." + x[1].toLowerCase() + "@example.com",
      phone: i === 10 ? "" : "0800000" + String(i + 1).padStart(4, "0"),
      joined: "2026-10-04",
      occupation: ["Teacher", "Entrepreneur", "Designer", "Engineer"][i % 4],
      address: "Ibadan, Oyo State",
      gender: i % 2 ? "Male" : "Female",
      notes: "",
      celebrationOpt: i !== 10,
      programmeOpt: i !== 10,
    })),
    events: [
      {
        id: "e1",
        title: "Family & Friends Sunday",
        date: "2026-10-18",
        time: "09:00",
        venue: "Vine Branch Church, Ibadan",
        description: "A Sunday to worship together and bring someone you love.",
        link: "https://vinebranchchurch.org/",
      },
      {
        id: "e2",
        title: "An Evening of Worship",
        date: "2026-10-25",
        time: "17:00",
        venue: "Main auditorium",
        description: "Make room for an evening of prayer, praise and worship.",
        link: "https://vinebranchchurch.org/",
      },
      {
        id: "e3",
        title: "New Members Welcome",
        date: "2026-11-01",
        time: "12:00",
        venue: "Welcome lounge",
        description:
          "Meet the team, ask questions and find your place in the family.",
        link: "https://vinebranchchurch.org/",
      },
    ],
    campaigns: [
      {
        id: "c1",
        name: "Family & Friends invitation",
        event: "e1",
        channel: "both",
        audience: "all",
        subject: "There is a place for you this Sunday",
        body: "Hi {{first_name}},\n\nYou are warmly invited to {{programme}} on {{date}} at {{time}}. Join us at {{venue}}. We would love to see you!\n\nVine Branch Church",
        sms: "Hi {{first_name}}, join us for {{programme}} on {{date}}, {{time}} at {{venue}}. Vine Branch Church.",
        schedule: "2026-10-15T09:00",
        status: "Scheduled",
      },
      {
        id: "c2",
        name: "Welcome lunch follow-up",
        event: "e3",
        channel: "email",
        audience: "new",
        subject: "Welcome to the family",
        body: "Hi {{first_name}},\n\nWe are glad you joined us. Come and meet the team at {{programme}}.\n\nWith love,\nVine Branch Church",
        sms: "",
        schedule: "",
        status: "Draft",
      },
    ],
    templates: [
      {
        id: "t1",
        name: "Birthday blessing",
        kind: "Birthday",
        subject: "Happy birthday, {{first_name}}!",
        body: "Dear {{first_name}},\n\nHappy birthday! May this new year of your life be filled with God's grace, joy and purpose. We celebrate you and thank God for you.\n\nWith love,\nYour Vine Branch Church family",
        sms: "Happy birthday, {{first_name}}! May God fill your year with grace, joy and purpose. With love, your Vine Branch Church family.",
      },
      {
        id: "t2",
        name: "Anniversary blessing",
        kind: "Anniversary",
        subject: "Celebrating your wedding anniversary",
        body: "Dear {{first_name}},\n\nHappy wedding anniversary! May your home continue to flourish in love, peace and the grace of God. We celebrate this beautiful milestone with you.\n\nWith love,\nYour Vine Branch Church family",
        sms: "Happy wedding anniversary, {{first_name}}! May your home flourish in love, peace and grace. Your Vine Branch Church family celebrates you.",
      },
      {
        id: "t3",
        name: "Programme invitation",
        kind: "Invitation",
        subject: "You are invited: {{programme}}",
        body: "Hi {{first_name}},\n\nJoin us for {{programme}} on {{date}} at {{time}}.\nVenue: {{venue}}\n\nThere is a place for you. We look forward to seeing you!\n\nVine Branch Church",
        sms: "Hi {{first_name}}, join us for {{programme}}, {{date}} at {{time}}. Venue: {{venue}}. Vine Branch Church.",
      },
    ],
    automations: [
      {
        id: "birthday",
        name: "Birthday greetings",
        template: "t1",
        on: true,
        time: "08:00",
        channel: "both",
        leap: "February 28",
      },
      {
        id: "anniversary",
        name: "Wedding anniversaries",
        template: "t2",
        on: true,
        time: "08:30",
        channel: "both",
        leap: "February 28",
      },
    ],
    logs: [
      {
        id: "l1",
        member: "m1",
        label: "Birthday greeting",
        channel: "Email",
        status: "Delivered",
        time: "08 Oct, 08:00",
        error: "",
      },
      {
        id: "l2",
        member: "m1",
        label: "Birthday greeting",
        channel: "SMS",
        status: "Delivered",
        time: "08 Oct, 08:01",
        error: "",
      },
      {
        id: "l3",
        member: "m2",
        label: "Birthday greeting",
        channel: "Email",
        status: "Delivered",
        time: "08 Oct, 08:00",
        error: "",
      },
      {
        id: "l4",
        member: "m3",
        label: "Anniversary greeting",
        channel: "Email",
        status: "Failed",
        time: "08 Oct, 08:30",
        error:
          "Temporary provider timeout. Safe to retry after checking the connection.",
      },
      {
        id: "l5",
        member: "m3",
        label: "Anniversary greeting",
        channel: "SMS",
        status: "Delivered",
        time: "08 Oct, 08:31",
        error: "",
      },
      {
        id: "l6",
        member: "m5",
        label: "Welcome message",
        channel: "Email",
        status: "Delivered",
        time: "04 Oct, 13:20",
        error: "",
      },
    ],
    search: "",
    filter: "all",
    channelFilter: "all",
    selected: new Set(),
    calType: "birthday",
    calDay: 8,
    calMonth: 9,
    profileTab: "details",
    templateId: "t1",
    templateChannel: "email",
    deliveryFilter: "all",
    settingsTab: "general",
    importStep: 0,
    importRows: [],
    importHeaders: [],
    importMapping: {},
    joinStep: 0,
    join: { emailOpt: true, smsOpt: true },
    joinDone: false,
    preferenceSaved: false,
    campaignStep: 0,
    draft: null,
    campaignSuccess: false,
    settings: {
      sender: "Vine Branch Church",
      email: "care@vinebranchchurch.org",
      smsSender: "VineBranch",
      timeZone: "Africa/Lagos",
      budget: 15000,
    },
    budget: {
      members: 500,
      married: 30,
      invites: 2,
      smsAudience: 0,
      smsRate: 6.49,
      fx: 1600,
      email: 0,
      hosting: 0,
      database: 0,
      newsletters: 1,
      smsMode: "greetings",
      segments: 1,
    },
  };
  state.members.forEach((m) => (m.newsletterOpt = m.programmeOpt));
  state.newsletters = [
    {
      id: "n1",
      name: "October church family update",
      month: "2026-10",
      subject: "October at Vine Branch: a note for the family",
      body: "Dear {{first_name}},\n\nWelcome to our October church family update.\n\nA WORD FOR THE MONTH\nMay we keep growing together in faith, love and service.\n\nCOMING TOGETHER\nJoin us for Family & Friends Sunday on 18 October. Invite someone you love.\n\nSTAY CONNECTED\nVisit vinebranchchurch.org for updates, devotionals and sermons.\n\nWith love,\nThe Vine Branch Church Family",
      schedule: "2026-10-10T09:00",
      batch: 250,
      reserve: 50,
      status: "Draft",
    },
  ];
  state.newsletterId = "n1";
  state.newsletterSuccess = false;
  state.emailDevice = "desktop";
  state.emailImages = true;
  state.templates.forEach((t) => (t.design = defaultEmailDesign(t.kind)));
  state.templates[0].body =
    "Dear {{first_name}},\n\nToday, we thank God for the gift of your life. May His grace guide your steps, His joy strengthen your heart, and His purpose unfold beautifully in this new year.\n\nYou are loved and celebrated by your church family.";
  state.templates[1].body =
    "Dear {{first_name}},\n\nHappy wedding anniversary! May God continue to bless your home with love, peace and the joy of walking through life together.\n\nWe celebrate this beautiful milestone with you and pray for many more grace-filled years.";
  state.campaigns.forEach((c) => {
    c.kind = "Invitation";
    c.design = defaultEmailDesign("Invitation");
  });
  state.newsletters.forEach((n) => {
    n.kind = "Newsletter";
    n.design = defaultEmailDesign("Newsletter");
    n.body =
      "Dear {{first_name}},\n\nThere is something beautiful about growing together. Here is a little encouragement for the month, a glimpse of life in our church family, and a few dates to look forward to.";
    n.stories = [
      {
        category: "A WORD FOR THE MONTH",
        title: "Make room for what matters.",
        body: "Faith grows in the everyday moments: a prayer, a kind word, a step of obedience. This month, let us make room for God and for one another.",
        image: "/assets/image-1135145c76a9.jpg",
        originalImage: "/assets/image-1135145c76a9.jpg",
        imageUrl: "",
        alt: "The church family worshipping together",
        label: "Explore our devotionals",
        url: "https://vinebranchchurch.org/",
      },
      {
        category: "LIFE IN THE FAMILY",
        title: "Your gifts have a place here.",
        body: "Every act of service helps someone feel at home. Find a place to connect, share your gifts and serve alongside the church family.",
        image: "/assets/image-2846286d294e.jpg",
        originalImage: "/assets/image-2846286d294e.jpg",
        imageUrl: "",
        alt: "A member of the church media team operating a camera",
        label: "Find your place",
        url: "https://vinebranchchurch.org/",
      },
    ];
    n.eventIds = ["e1", "e2", "e3"];
  });

  return state;
}
