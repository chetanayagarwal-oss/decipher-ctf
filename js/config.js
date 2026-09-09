/* ============================================================
   DECIPHER — EVENT CONFIG
   The only file you need to edit. Everything on both pages
   reads from here.
   ============================================================ */

const DECIPHER = {
  /* ---- EVENT ---- */
  eventDateISO: "2026-09-10T10:30:00+05:30",
  eventDateLabel: "10 SEPT 2026",
  venue: "TBA",                       // TODO: your venue
  organizer: "Cybersecurity Club",    // TODO: your club name

  /* ---- REGISTRATION (placeholder — swap the URL when ready) ---- */
  registerUrl: "https://decipher2026.tech/register",  // registration page
  registerLabel: "REGISTER",

  /* ---- WHAT IS A CTF ----
     Shown on the cabinet screen and on the museum's first exhibit.
     Keep each line short — it's rendered on a CRT. */
  whatIsCTF: [
    "A CTF is a hacking competition made of puzzles.",
    "Every challenge hides a secret string — a FLAG — inside a website, a file, a cipher, or a program.",
    "Find the flag. Submit it. Score points.",
    "Most points when the clock stops wins.",
    "No experience needed. Decipher starts you from zero."
  ],

  /* A flag looks like this — shown as an example on screen. */
  flagExample: "DECIPHER{y0ur_f1rst_fl4g}",

  /* ---- RULES (placeholder text — replace with your final rules) ---- */
  rules: [
    { head: "NO ATTACKS", body: "Do not attack the CTF infrastructure, players, or organizers." },
    { head: "FLAG SHARING", body: "Keep flags confidential. Do not share them under any circumstances." },
    { head: "PROMPT SUBMISSION", body: "Submit flags immediately upon discovery to secure your points." },
    { head: "NO COLLABORATION", body: "Collaborating with individuals outside your team is prohibited." },
    { head: "NO BRUTE FORCE", body: "Do not brute-force the scoreboard. Focus on intended methods." },
    { head: "NO SCANNERS", body: "Automated scanners generating excessive traffic are banned." }
  ]
};

if (typeof window !== "undefined") window.DECIPHER = DECIPHER;
