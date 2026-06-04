import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const username = process.env.GITHUB_REPOSITORY_OWNER || "sunzrnobug";

if (!token) {
  throw new Error("GITHUB_TOKEN or GH_TOKEN is required");
}

const query = `
query ContributionArena($login: String!) {
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
const pathDays = activeDays.length ? activeDays : days.slice(-12);
const path = buildSnakePath(pathDays);
const highlightedDays = [...activeDays]
  .sort((a, b) => b.contributionCount - a.contributionCount)
  .slice(0, 12);

await mkdir("dist", { recursive: true });
await writeFile(
  "dist/contribution-snake-arena.svg",
  renderArena({
    username,
    weeks,
    days,
    path,
    highlightedDays,
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

function buildSnakePath(days) {
  const points = days.map((day) => pointFor(day));
  if (points.length === 1) {
    const [x, y] = points[0];
    points.push([x + 1, y + 1]);
  }

  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
}

function pointFor(day) {
  const cell = 11;
  const gap = 4;
  const gridX = 72;
  const gridY = 142;
  return [
    gridX + day.weekIndex * (cell + gap) + cell / 2,
    gridY + day.weekday * (cell + gap) + cell / 2,
  ];
}

function renderArena(stats) {
  return `<svg width="920" height="360" viewBox="0 0 920 360" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Contribution Snake Arena</title>
  <desc id="desc">A cyber snake arena generated from ${escapeXml(stats.username)}'s GitHub contribution calendar.</desc>

  <defs>
    <linearGradient id="frame" x1="36" y1="26" x2="884" y2="334" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22d3ee" />
      <stop offset="0.42" stop-color="#8b5cf6" />
      <stop offset="1" stop-color="#10b981" />
    </linearGradient>

    <linearGradient id="snake" x1="72" y1="112" x2="860" y2="220" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22d3ee" />
      <stop offset="0.5" stop-color="#a78bfa" />
      <stop offset="1" stop-color="#86efac" />
    </linearGradient>

    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(460 180) rotate(90) scale(260 520)">
      <stop stop-color="#22d3ee" stop-opacity="0.2" />
      <stop offset="1" stop-color="#020617" stop-opacity="0" />
    </radialGradient>

    <filter id="neon" x="-30%" y="-50%" width="160%" height="200%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#22d3ee" flood-opacity="0.75" />
      <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#8b5cf6" flood-opacity="0.35" />
    </filter>

    <filter id="cellGlow" x="-60%" y="-60%" width="220%" height="220%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#22d3ee" flood-opacity="0.45" />
    </filter>

    <pattern id="gridBg" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" stroke="#22d3ee" stroke-opacity="0.065" />
    </pattern>

    <pattern id="scanline" width="920" height="8" patternUnits="userSpaceOnUse">
      <rect width="920" height="1.2" fill="#ffffff" opacity="0.055" />
    </pattern>

    <style>
      .mono { font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace; letter-spacing: 0; }
      .title { font-size: 22px; font-weight: 800; fill: #f8fafc; }
      .label { font-size: 12px; font-weight: 600; fill: #94a3b8; }
      .metric { font-size: 18px; font-weight: 800; fill: #d1fae5; }
      .cyan { fill: #22d3ee; }
      .green { fill: #86efac; }
      .violet { fill: #c084fc; }
      .muted { fill: #94a3b8; }
      .scan { animation: drift 7s linear infinite; }
      .pulse { animation: pulse 2.4s ease-in-out infinite; }
      .snakePath {
        stroke-dasharray: 1200;
        stroke-dashoffset: 1200;
        animation: trace 7s ease-in-out infinite;
      }
      @keyframes trace {
        0% { stroke-dashoffset: 1200; opacity: 0.2; }
        18% { opacity: 1; }
        70% { stroke-dashoffset: 0; opacity: 1; }
        100% { stroke-dashoffset: -1200; opacity: 0.15; }
      }
      @keyframes drift {
        from { transform: translateY(-18px); }
        to { transform: translateY(18px); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.42; }
        50% { opacity: 1; }
      }
    </style>
  </defs>

  <rect width="920" height="360" rx="20" fill="#020617" />
  <rect width="920" height="360" fill="url(#gridBg)" />
  <rect width="920" height="360" fill="url(#glow)" />
  <g class="scan">
    <rect width="920" height="360" fill="url(#scanline)" />
  </g>

  <rect x="36" y="26" width="848" height="308" rx="18" fill="#020617" fill-opacity="0.86" stroke="url(#frame)" stroke-width="1.5" />
  <rect x="37" y="27" width="846" height="52" rx="17" fill="#07111f" fill-opacity="0.95" />
  <line x1="37" y1="79" x2="883" y2="79" stroke="#22d3ee" stroke-opacity="0.2" />

  <circle cx="62" cy="53" r="6" fill="#ef4444" />
  <circle cx="84" cy="53" r="6" fill="#f59e0b" />
  <circle cx="106" cy="53" r="6" fill="#10b981" />

  <text x="132" y="58" class="mono title">contribution-snake.arena()</text>
  <text x="835" y="58" text-anchor="end" class="mono label cyan pulse">LIVE CALENDAR FEED</text>

  <g>
    ${renderMetrics(stats)}
  </g>

  <g>
    ${renderContributionGrid(stats.weeks, stats.maxContribution)}
  </g>

  <path d="${stats.path}" class="snakePath" stroke="url(#snake)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" filter="url(#neon)" />
  <path d="${stats.path}" stroke="#ffffff" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.18" />

  <circle r="8" fill="#22d3ee" filter="url(#neon)">
    <animateMotion dur="7s" repeatCount="indefinite" path="${stats.path}" rotate="auto" />
  </circle>

  <circle r="3" fill="#f8fafc">
    <animateMotion dur="7s" repeatCount="indefinite" path="${stats.path}" rotate="auto" />
  </circle>

  ${renderPellets(stats.highlightedDays)}

  <text x="72" y="300" class="mono label">
    <tspan class="green">snake.mode</tspan><tspan class="muted"> = </tspan><tspan fill="#d1fae5">eating real contribution cells</tspan>
    <tspan class="muted"> // </tspan><tspan class="violet">${escapeXml(new Date().toISOString().slice(0, 10))}</tspan>
  </text>
</svg>`;
}

function renderMetrics(stats) {
  const metrics = [
    ["total", stats.totalContributions],
    ["active_days", stats.activeDays],
    ["current", `${stats.currentStreak}d`],
    ["longest", `${stats.longestStreak}d`],
  ];

  return metrics
    .map(([label, value], index) => {
      const x = 72 + index * 150;
      return `
        <text x="${x}" y="96" class="mono label">${escapeXml(label)}</text>
        <text x="${x}" y="122" class="mono metric">${escapeXml(String(value))}</text>
      `;
    })
    .join("");
}

function renderContributionGrid(weeks, maxContribution) {
  const cell = 11;
  const gap = 4;
  const gridX = 72;
  const gridY = 142;

  return weeks
    .flatMap((week, weekIndex) =>
      week.contributionDays.map((day) => {
        const x = gridX + weekIndex * (cell + gap);
        const y = gridY + day.weekday * (cell + gap);
        const color = colorFor(day.contributionCount, maxContribution);
        const opacity = day.contributionCount > 0 ? "0.96" : "0.38";
        const glow = day.contributionCount > 0 ? ' filter="url(#cellGlow)"' : "";
        return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${color}" opacity="${opacity}"${glow} />`;
      }),
    )
    .join("");
}

function renderPellets(days) {
  return days
    .map((day, index) => {
      const [x, y] = pointFor(day);
      const delay = (index * 0.18).toFixed(2);
      return `<circle cx="${x}" cy="${y}" r="3.4" fill="#f8fafc" opacity="0.9" filter="url(#neon)">
        <animate attributeName="r" values="2.2;4.6;2.2" dur="2.4s" begin="${delay}s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;1;0.35" dur="2.4s" begin="${delay}s" repeatCount="indefinite" />
      </circle>`;
    })
    .join("");
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
