// Google dorks for finding public bug bounty / disclosure programs.
// Merged from the community lists in bugbounty_public_program_list.md and
// dorks.txt, de-duplicated, and rewritten into syntax Google actually honours
// (no "r=h:", "insite:", spaced "inurl : /", or "and" operators).
const DORK_GROUPS = [
  {
    name: "Program pages (URL)",
    dorks: [
      "inurl:responsible-disclosure",
      "inurl:responsible-disclosure reward",
      "inurl:responsible-disclosure bounty",
      "inurl:responsible-disclosure swag",
      "inurl:responsible-disclosure hoodie",
      'inurl:responsible-disclosure "$50"',
      "inurl:responsible-disclosure-policy",
      "inurl:vulnerability-disclosure-policy reward",
      "inurl:vulnerability-disclosure-program",
      "inurl:bug-bounty",
      'inurl:bug-bounty "$50"',
      "inurl:bugbounty reward program",
      "inurl:private bugbountyprogram",
      "inurl:security intext:reward",
      "inurl:security intext:bounty",
      'inurl:security "bug bounty" "€"',
      'inurl:security "bug bounty" "$"',
      'inurl:security "bug bounty" "INR"',
      "inurl:reporting-security-issues",
      "inurl:report-a-vulnerability",
      'inurl:"security-report"',
      'inurl:support intext:"security report" reward'
    ]
  },
  {
    name: "Phrases on the page",
    dorks: [
      '"responsible disclosure" bounty',
      '"responsible disclosure" "hall of fame"',
      '"responsible disclosure" "white hat"',
      '"white hat program"',
      '"responsible disclosure" "you may be eligible for monetary compensation"',
      '"submit vulnerability report"',
      '"vulnerability reporting policy"',
      '"if you believe you\'ve found a security vulnerability"',
      '"if you find a security issue" reward',
      'intext:"we offer a bounty"',
      'intext:"security report" monetary inurl:security',
      'intext:"security report" reward inurl:report',
      '"bug bounty" BTC reward',
      'buy bitcoins "bug bounty"',
      'cms "bug bounty"',
      '"responsible disclosure" university',
      "inurl:responsible-disclosure university"
    ]
  },
  {
    name: "Hosted on a bounty platform",
    dorks: [
      '"powered by bugcrowd" -site:bugcrowd.com',
      '"submission form powered by bugcrowd" -site:bugcrowd.com',
      '"powered by hackerone" "submit vulnerability report"',
      '"powered by synack"',
      "site:responsibledisclosure.com"
    ]
  },
  {
    name: "security.txt",
    dorks: [
      "inurl:/.well-known/security.txt",
      "inurl:/.well-known/security.txt intext:hackerone",
      "inurl:/.well-known/security.txt -hackerone -bugcrowd -synack -openbugbounty",
      'inurl:security.txt "mailto" -site:github.com -site:wikipedia.org -site:portswigger.net',
      "inurl:security-policy.txt",
      'inurl:security ext:txt "contact"'
    ]
  },
  {
    name: "By country / TLD",
    dorks: [
      'site:.eu "responsible disclosure"',
      'site:.eu "responsible disclosure" bounty',
      'site:.eu "responsible disclosure" reward',
      'site:.eu intext:"vulnerability disclosure"',
      'site:.nl "responsible disclosure"',
      'site:.nl "responsible disclosure" reward',
      'site:.nl "responsible disclosure" swag',
      'site:.nl intext:"security report" reward',
      'site:.nl intext:"vulnerability disclosure"',
      'site:.nl "van de melding met een minimum van een" -site:responsibledisclosure.nl',
      '"responsible disclosure" -site:.nl',
      'site:.uk "responsible disclosure" reward',
      'site:.uk "responsible disclosure" swag',
      'site:.uk intext:"security report" reward',
      'site:.com "responsible disclosure" swag',
      "site:.de inurl:bug inurl:bounty",
      'site:.cn intext:"security report" reward',
      'site:.at "responsible disclosure"',
      'site:.au "responsible disclosure"',
      'site:.be "responsible disclosure"',
      'site:.br "responsible disclosure"',
      'site:.in "responsible disclosure"',
      'site:.edu intext:"security report" vulnerability',
      'site:.gov "responsible disclosure"'
    ]
  },
  {
    name: "Social",
    dorks: [
      'site:twitter.com "bug bounty" swag',
      'site:x.com "bug bounty" swag'
    ]
  }
];

function dorkSearchUrl(dork) {
  return "https://www.google.com/search?q=" + encodeURIComponent(dork);
}
