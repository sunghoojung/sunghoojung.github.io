import scholar from "./scholar.json";

// Content provenance is recorded in docs/project-sources.md.

export const profile = {
  name: "Sunghoo Jung",
  summary:
    "Computer science and mathematics student working on machine learning research, systems, and reverse engineering.",
  email: "sunghoojungg@gmail.com",
  links: [
    { label: "GitHub", href: "https://github.com/sunghoojung" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/sunghoo-jung" },
    { label: "Google Scholar", href: scholar.profileUrl },
  ],
};

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
  context: string;
  description: string;
  stack: string[];
  links: { label: string; href: string }[];
};

export const projects: Project[] = [
  {
    id: "reverse-engineering-browser",
    title: "Reverse Engineering Browser",
    context: "Independent project, Aug 2026 – present",
    description:
      "A custom Brave browser and native macOS workspace for tracing how web applications work, from a network request back to the code and browser events behind it. C++ probes write to bounded shared memory, and authenticated Unix sockets carry versioned records into the desktop app without JavaScript hooks or blocking the renderer.",
    stack: ["C++20", "Chromium", "Mojo", "Unix IPC", "Swift"],
    links: [
      {
        label: "Repository",
        href: "https://github.com/sunghoojung/reverse-engineering-browser",
      },
    ],
  },
  {
    id: "ai-video-detector",
    title: "AI Video Detector",
    context: "Independent research prototype",
    description:
      "A web application that analyzes short video clips and estimates whether they may be AI-generated. Uploads are routed through a web API to a separate inference worker. The model is experimental: validation found false positives on real footage, so results are presented as research signals, not proof of AI authorship.",
    stack: ["TypeScript", "Go", "SQLite", "Python", "XCLIP", "XGBoost"],
    links: [
      {
        label: "Website",
        href: "https://ai-video-detector-sunny.up.railway.app",
      },
    ],
  },
  {
    id: "astra",
    title: "Astra NFT Bot",
    context: "Go backend, team of six engineers",
    description:
      "An automatic NFT purchasing bot built with five other engineers. I developed the Go backend, coordinating wallets through goroutines and an Ethereum RPC hosted by our team. Detection to mempool took about 2 seconds, versus 10 seconds manually, across roughly $5M in purchases over two years.",
    stack: ["Go", "Ethereum", "OpenSea", "RPC"],
    links: [],
  },
  {
    id: "lifesaver",
    title: "LifeSaver",
    context: "Team project, YHack 2026 · 2nd overall and Most Creative Hack",
    description:
      "A browser-based surgical training simulator with an interactive operating room, anatomy exploration, and AI voice guidance, built to make hands-on practice accessible from a laptop.",
    stack: ["React", "Three.js", "Gemini", "ElevenLabs", "MongoDB"],
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
    context: "Research assistant, Rutgers Neurodegenerative Diseases Lab",
    description:
      "A microscopy pipeline that segments cellular inclusions in 16-bit images and classifies their morphology. MicroSAM and medicoSAM were fine-tuned on 500+ annotated images and ResNet101 on 10,000+ classification images, raising morphology classification accuracy from 75% to 95%.",
    stack: ["MicroSAM", "medicoSAM", "ResNet101", "PyTorch"],
    links: [
      {
        label: "Repository",
        href: "https://github.com/sunghoojung/segment-classify-pipeline",
      },
    ],
  },
  {
    id: "neo-seoul",
    title: "Neo Seoul",
    context: "Personal project",
    description:
      "An interactive 3D room that served as the previous version of this website. The scene was built in Blender with Astra and Blender MCP, exported as an optimized GLB, and rendered in the browser with instanced city geometry and frame-rate-adaptive quality.",
    stack: ["Blender", "Blender MCP", "React Three Fiber", "TypeScript"],
    links: [],
  },
  {
    id: "prosthetic-hand",
    title: "Prosthetic Hand",
    context: "Capstone project",
    description:
      "A sensor glove that maps finger bends to a prosthetic hand. Two Arduino boards exchange movement data over HC-05 Bluetooth modules, with five flex sensors driving five servos.",
    stack: ["Arduino", "C++", "HC-05 Bluetooth"],
    links: [
      {
        label: "Repository",
        href: "https://github.com/sunghoojung/Prosethic-Hand",
      },
    ],
  },
];
