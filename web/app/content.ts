import scholar from "./scholar.json";

// Content provenance is recorded in docs/project-sources.md.

export const profile = {
  name: "Sunghoo Jung",
  summary:
    "Computer science and mathematics student at Rutgers University working on machine learning interpretability, systems, and reverse engineering.",
  email: "sunghoojungg@gmail.com",
  photo: {
    src: "/images/sunghoo-jung.webp",
    width: 308,
    height: 308,
  },
  links: [
    { icon: "github", label: "GitHub", href: "https://github.com/sunghoojung" },
    {
      icon: "linkedin",
      label: "LinkedIn",
      href: "https://www.linkedin.com/in/sunghoo-jung",
    },
    { icon: "x", label: "X", href: "https://x.com/sunny17347" },
    { icon: "scholar", label: "Google Scholar", href: scholar.profileUrl },
  ],
} as const;

export const scholarProfile = {
  url: scholar.profileUrl,
  savedAt: scholar.savedAt,
  // A script-free copy written by `npm run scholar:snapshot`.
  embedPath: "/scholar/profile.html",
};

// Author order, volume, and pages follow the Crossref record for each DOI.
export const publications = [
  {
    authorsBefore: "J. Cevallos, E. Eubanks, ",
    authorsAfter: ", Y. Huang, E. Guadagno, N. Jaber, Y. Xia, et al.",
    title:
      "Lipid droplets promote aberrant liquid-liquid phase separation of alpha-synuclein impairing energy homeostasis",
    journal: "EMBO Reports",
    reference: "27(15), 4299–4331",
    year: 2026,
    href: "https://doi.org/10.1038/s44319-026-00856-8",
  },
  {
    authorsBefore: "B. Sacks, J. Mody, Y. Huang, ",
    authorsAfter: ", R. Kimelman, E. Eubanks, E. Guadagno, et al.",
    title:
      "Protocol for automated analysis of biological images using Python code",
    journal: "STAR Protocols",
    reference: "7(1), 104368",
    year: 2026,
    href: "https://doi.org/10.1016/j.xpro.2026.104368",
  },
];

export type Project = {
  id: string;
  title: string;
  // A short phrase that keeps the whole entry on one line.
  summary: string;
  // Shown before the title, as [devpost] [github].
  links: { label: "devpost" | "github"; href: string }[];
};

export const projects: Project[] = [
  {
    id: "reverse-engineering-browser",
    title: "Reverse Engineering Browser",
    summary: "A Brave build and Mac app that trace requests to their code",
    links: [
      {
        label: "github",
        href: "https://github.com/sunghoojung/reverse-engineering-browser",
      },
    ],
  },
  {
    id: "astra",
    title: "Astra NFT Bot",
    summary: "An NFT purchasing bot from a team of six; I wrote the Go backend",
    links: [],
  },
  {
    id: "lifesaver",
    title: "LifeSaver",
    summary:
      "A surgical training simulator with AI voice guidance, 2nd at YHack 2026",
    links: [
      {
        label: "devpost",
        href: "https://devpost.com/software/lifesaver-lnm0tz",
      },
      { label: "github", href: "https://github.com/akhilm2223/yale" },
    ],
  },
  {
    id: "microscopy",
    title: "Alpha-synuclein Analysis",
    summary:
      "A microscopy pipeline that segments and classifies cell inclusions",
    links: [
      {
        label: "github",
        href: "https://github.com/sunghoojung/segment-classify-pipeline",
      },
    ],
  },
  {
    id: "crime-tracker",
    title: "New Brunswick Crime Tracker",
    summary: "A crime map with safe walking routes, won at HackRU",
    links: [
      {
        label: "devpost",
        href: "https://devpost.com/software/new-brunswick-crime-tracker",
      },
      {
        label: "github",
        href: "https://github.com/sunghoojung/crime_lookup_nb",
      },
    ],
  },
  {
    id: "opensea-monitor",
    title: "OpenSea Monitor",
    summary:
      "A cache bypass I found let it see listings faster and made me $100,000",
    links: [
      {
        label: "github",
        href: "https://github.com/sunghoojung/openseamonitor",
      },
    ],
  },
];
