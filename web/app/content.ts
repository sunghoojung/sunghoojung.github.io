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
  // One line, at a high level.
  summary: string;
  image: {
    src: string;
    alt: string;
    width: number;
    height: number;
    // Which part of the image stays in view when it is cropped to the card.
    position?: string;
  };
  links: { label: string; href: string }[];
};

export const projects: Project[] = [
  {
    id: "reverse-engineering-browser",
    title: "Reverse Engineering Browser",
    summary:
      "A custom Brave browser and macOS app that traces how a web application works, from a network request back to the code behind it.",
    image: {
      src: "/images/projects/browser-app.webp",
      alt: "Origin Trace desktop app showing a captured request to example.com with its timeline and details.",
      width: 1200,
      height: 754,
    },
    links: [
      {
        label: "Repository",
        href: "https://github.com/sunghoojung/reverse-engineering-browser",
      },
    ],
  },
  {
    id: "astra",
    title: "Astra NFT Bot",
    summary:
      "An automated NFT purchasing bot built by a team of six, for which I wrote the Go backend.",
    image: {
      src: "/images/projects/astra-dashboard.webp",
      alt: "Astra NFT Sniper desktop dashboard showing its task list and controls.",
      width: 1200,
      height: 664,
    },
    links: [],
  },
  {
    id: "lifesaver",
    title: "LifeSaver",
    summary:
      "A browser-based surgical training simulator with AI voice guidance, placed 2nd overall at YHack 2026.",
    image: {
      src: "/images/projects/lifesaver.webp",
      alt: "LifeSaver's 3D operating room with a patient model, surgical instruments, and a virtual doctor.",
      width: 1200,
      height: 573,
    },
    links: [
      {
        label: "Devpost",
        href: "https://devpost.com/software/lifesaver-lnm0tz",
      },
      { label: "Repository", href: "https://github.com/akhilm2223/yale" },
    ],
  },
  {
    id: "microscopy",
    title: "Alpha-synuclein Analysis",
    summary:
      "A microscopy pipeline that segments inclusions inside cells and classifies their shape.",
    image: {
      src: "/images/projects/microscopy.webp",
      alt: "Microscopy image of a cell with four inclusions marked red and one marked green.",
      width: 766,
      height: 766,
      position: "center 68%",
    },
    links: [
      {
        label: "Repository",
        href: "https://github.com/sunghoojung/segment-classify-pipeline",
      },
    ],
  },
];
