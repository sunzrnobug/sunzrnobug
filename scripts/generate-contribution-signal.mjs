import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const username = process.env.GITHUB_REPOSITORY_OWNER || "sunzrnobug";

if (!token) {
  throw new Error("GITHUB_TOKEN or GH_TOKEN is required");
}

const query = `
query ContributionSignal($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
            weekday
          }
        }
      }
    }
  }
}
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query, variables: { login: username } }),
});

if (!response.ok) {
  throw new Error(`GitHub API returned ${response.status}`);
}

const payload = await response.json();

if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const calendar = payload.data.user.contributionsCollection.contributionCalendar;
const weeks = calendar.weeks.slice(-53);
const days = weeks.flatMap((week, weekIndex) =>
  week.contributionDays.map((day) => ({ ...day, weekIndex })),
);
const activeDays = days.filter((day) => day.contributionCount > 0);
const maxContribution = Math.max(...days.map((day) => day.contributionCount), 1);
const streaks = getStreaks(days);
const recentDays = days.slice(-70);

await mkdir("dist", { recursive: true });
await writeFile(
  "dist/contribution-signal.svg",
  renderSignal({
    username,
    weeks,
    recentDays,
    totalContributions: calendar.totalContributions,
    activeDays: activeDays.length,
    maxContribution,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
  }),
);

function getStreaks(days) {
  let longest = 0;
  let running = 0;

  for (const day of days) {
    if (day.contributionCount > 0) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  let current = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].contributionCount === 0) break;
    current += 1;
  }

  return { current, longest };
}

function renderSignal(stats) {
  return `<svg width="920" height="340" viewBox="0 0 920 340" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Contribution Signal</title>
  <desc id="desc">A quiet contribution signal panel generated from ${escapeXml(stats.username)}'s GitHub contribution calendar.</desc>

  <defs>
    <linearGradient id="frame" x1="38" y1="28" x2="882" y2="312" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22d3ee" />
      <stop offset="0.58" stop-color="#0f766e" />
      <stop offset="1" stop-color="#475569" />
    </linearGradient>
    <linearGradient id="line" x1="72" y1="236" x2="846" y2="236" gradientUnits="userSpaceOnUse">
      <stop stop-color="#155e75" />
      <stop offset="0.5" stop-color="#22d3ee" />
      <stop offset="1" stop-color="#86efac" />
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(460 170) rotate(90) scale(240 520)">
      <stop stop-color="#22d3ee" stop-opacity="0.14" />
      <stop offset="1" stop-color="#020617" stop-opacity="0" />
    </radialGradient>
    <filter id="softGlow" x="-40%" y="-60%" width="180%" height="220%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#22d3ee" flood-opacity="0.48" />
    </filter>
    <pattern id="gridBg" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" stroke="#22d3ee" stroke-opacity="0.05" />
    </pattern>
    <style>
      .mono { font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace; letter-spacing: 0; }
      .title { font-size: 22px; font-weight: 800; fill: #f8fafc; }
      .label { font-size: 12px; font-weight: 600; fill: #94a3b8; }
      .metric { font-size: 18px; font-weight: 800; fill: #d1fae5; }
      .cyan { fill: #22d3ee; }
      .green { fill: #86efac; }
      .muted { fill: #94a3b8; }
      .scan {
        animation: sweep 6s ease-in-out infinite;
      }
      .signalLine {
        stroke-dasharray: 980;
        animation: flow 6s linear infinite;
      }
      @keyframes sweep {
        0% { transform: translateX(-110px); opacity: 0; }
        16%, 78% { opacity: 0.9; }
        100% { transform: translateX(770px); opacity: 0; }
      }
      @keyframes flow {
        from { stroke-dashoffset: 980; }
        to { stroke-dashoffset: 0; }
      }
    </style>
  </defs>

  <rect width="920" height="340" rx="20" fill="#020617" />
  <rect width="920" height="340" fill="url(#gridBg)" />
  <rect width="920" height="340" fill="url(#glow)" />
  <rect x="38" y="28" width="844" height="284" rx="18" fill="#020617" fill-opacity="0.88" stroke="url(#frame)" stroke-width="1.4" />
  <rect x="39" y="29" width="842" height="50" rx="17" fill="#07111f" fill-opacity="0.93" />
  <line x1="39" y1="79" x2="881" y2="79" stroke="#22d3ee" stroke-opacity="0.16" />

  <circle cx="62" cy="54" r="5.8" fill="#ef4444" />
  <circle cx="83" cy="54" r="5.8" fill="#f59e0b" />
  <circle cx="104" cy="54" r="5.8" fill="#10b981" />
  <text x="132" y="60" class="mono title">contribution.signal()</text>
  <text x="835" y="60" text-anchor="end" class="mono label">calendar window</text>

  ${renderMetrics(stats)}
  ${renderHeatmap(stats.weeks, stats.maxContribution)}
  ${renderRecentSignal(stats.recentDays, stats.maxContribution)}

  <rect x="72" y="108" width="1.5" height="106" fill="#22d3ee" opacity="0.45" class="scan" filter="url(#softGlow)" />

  <text x="72" y="286" class="mono label">
    <tspan class="green">readout</tspan><tspan class="muted"> = </tspan><tspan fill="#d1fae5">steady work, visible rhythm, no theatrics</tspan>
  </text>
</svg>`;
}

function renderMetrics(stats) {
  const metrics = [
    ["total", stats.totalContributions],
    ["active", stats.activeDays],
    ["current", `${stats.currentStreak}d`],
    ["longest", `${stats.longestStreak}d`],
  ];

  return metrics
    .map(([label, value], index) => {
      const x = 650 + (index % 2) * 92;
      const y = 118 + Math.floor(index / 2) * 52;
      return `
        <text x="${x}" y="${y}" class="mono label">${escapeXml(label)}</text>
        <text x="${x}" y="${y + 24}" class="mono metric">${escapeXml(String(value))}</text>
      `;
    })
    .join("");
}

function renderHeatmap(weeks, maxContribution) {
  const cell = 10;
  const gap = 4;
  const gridX = 72;
  const gridY = 108;

  return weeks
    .flatMap((week, weekIndex) =>
      week.contributionDays.map((day) => {
        const x = gridX + weekIndex * (cell + gap);
        const y = gridY + day.weekday * (cell + gap);
        const color = colorFor(day.contributionCount, maxContribution);
        return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" fill="${color}" opacity="${day.contributionCount > 0 ? "0.9" : "0.36"}" />`;
      }),
    )
    .join("");
}

function renderRecentSignal(days, maxContribution) {
  const startX = 72;
  const startY = 248;
  const width = 774;
  const height = 58;
  const step = width / Math.max(days.length - 1, 1);
  const points = days
    .map((day, index) => {
      const ratio = day.contributionCount / maxContribution;
      const x = startX + index * step;
      const y = startY - Math.max(2, ratio * height);
      return [x.toFixed(1), y.toFixed(1)];
    })
    .map(([x, y]) => `${x},${y}`)
    .join(" ");

  const bars = days
    .map((day, index) => {
      const ratio = day.contributionCount / maxContribution;
      const x = startX + index * step;
      const h = Math.max(3, ratio * 42);
      return `<rect x="${(x - 2).toFixed(1)}" y="${(startY - h).toFixed(1)}" width="4" height="${h.toFixed(1)}" rx="2" fill="#22d3ee" opacity="${day.contributionCount > 0 ? "0.42" : "0.14"}" />`;
    })
    .join("");

  return `
    <text x="72" y="234" class="mono label">recent activity signal</text>
    ${bars}
    <polyline class="signalLine" points="${points}" fill="none" stroke="url(#line)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#softGlow)" />
  `;
}

function colorFor(count, maxContribution) {
  if (count === 0) return "#111827";
  const ratio = count / maxContribution;
  if (ratio > 0.75) return "#22d3ee";
  if (ratio > 0.5) return "#14b8a6";
  if (ratio > 0.25) return "#10b981";
  return "#155e75";
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
