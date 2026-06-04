import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const username = process.env.GITHUB_REPOSITORY_OWNER || "sunzrnobug";

if (!token) {
  throw new Error("GITHUB_TOKEN or GH_TOKEN is required");
}

const query = `
query ProfileCards($login: String!) {
  user(login: $login) {
    followers {
      totalCount
    }
    repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
      totalCount
      nodes {
        stargazerCount
        forkCount
        primaryLanguage {
          name
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            date
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

const user = payload.data.user;
const repos = user.repositories.nodes;
const calendar = user.contributionsCollection.contributionCalendar;
const days = calendar.weeks.flatMap((week) => week.contributionDays);
const activeDays = days.filter((day) => day.contributionCount > 0).length;
const totalStars = repos.reduce((sum, repo) => sum + repo.stargazerCount, 0);
const totalForks = repos.reduce((sum, repo) => sum + repo.forkCount, 0);

const languageCounts = new Map();
for (const repo of repos) {
  const name = repo.primaryLanguage?.name;
  if (!name) continue;
  languageCounts.set(name, (languageCounts.get(name) || 0) + 1);
}

const topLanguages = [...languageCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 4);

const streaks = getStreaks(days);

await mkdir("dist", { recursive: true });
await writeFile(
  "dist/github-profile-stats.svg",
  renderStatsCard({
    username,
    totalContributions: calendar.totalContributions,
    totalCommits: user.contributionsCollection.totalCommitContributions,
    publicRepos: user.repositories.totalCount,
    followers: user.followers.totalCount,
    totalStars,
    totalForks,
    topLanguages,
  }),
);

await writeFile(
  "dist/github-streak.svg",
  renderStreakCard({
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    activeDays,
    totalContributions: calendar.totalContributions,
    recentDays: days.slice(-56),
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

function renderStatsCard(stats) {
  const languageLabels = stats.topLanguages.length
    ? stats.topLanguages
        .map(([name, count], index) => {
          const y = 220 + index * 24;
          return `<text x="52" y="${y}" class="tiny muted">${escapeXml(name)}</text><rect x="170" y="${y - 12}" width="${Math.min(190, count * 34)}" height="8" rx="4" fill="${["#22d3ee", "#10b981", "#a855f7", "#f59e0b"][index]}" opacity="0.85" />`;
        })
        .join("")
    : `<text x="52" y="228" class="tiny muted">No public language data yet</text>`;

  return wrapSvg(
    "GitHub Stats",
    `
    <text x="40" y="72" class="label prompt">sunzrnobug@github</text>
    <text x="40" y="103" class="title">profile.stats()</text>

    ${metric(52, 146, "Contributions", stats.totalContributions)}
    ${metric(256, 146, "Commits", stats.totalCommits)}
    ${metric(460, 146, "Public repos", stats.publicRepos)}
    ${metric(52, 190, "Followers", stats.followers)}
    ${metric(256, 190, "Stars", stats.totalStars)}
    ${metric(460, 190, "Forks", stats.totalForks)}

    <text x="52" y="252" class="label accent">language.signal</text>
    ${languageLabels}
  `,
  );
}

function renderStreakCard(stats) {
  const max = Math.max(...stats.recentDays.map((day) => day.contributionCount), 1);
  const bars = stats.recentDays
    .map((day, index) => {
      const height = Math.max(4, Math.round((day.contributionCount / max) * 56));
      const x = 52 + index * 10;
      const y = 246 - height;
      const color = day.contributionCount > 0 ? "#22d3ee" : "#1e293b";
      return `<rect x="${x}" y="${y}" width="6" height="${height}" rx="3" fill="${color}" opacity="${day.contributionCount > 0 ? "0.9" : "0.55"}" />`;
    })
    .join("");

  return wrapSvg(
    "Commit Streak",
    `
    <text x="40" y="72" class="label prompt">commit@pulse</text>
    <text x="40" y="103" class="title">streak.scan()</text>

    ${metric(52, 154, "Current streak", `${stats.currentStreak}d`)}
    ${metric(256, 154, "Longest streak", `${stats.longestStreak}d`)}
    ${metric(460, 154, "Active days", stats.activeDays)}

    <text x="52" y="194" class="label accent">last_56_days</text>
    ${bars}
    <text x="52" y="276" class="tiny muted">${stats.totalContributions} contributions in the latest GitHub calendar window</text>
  `,
  );
}

function metric(x, y, label, value) {
  return `
    <text x="${x}" y="${y - 18}" class="tiny muted">${escapeXml(label)}</text>
    <text x="${x}" y="${y}" class="value">${escapeXml(String(value))}</text>
  `;
}

function wrapSvg(title, body) {
  return `<svg width="640" height="300" viewBox="0 0 640 300" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="border" x1="20" y1="20" x2="620" y2="280" gradientUnits="userSpaceOnUse">
      <stop stop-color="#22d3ee" />
      <stop offset="0.55" stop-color="#0f766e" />
      <stop offset="1" stop-color="#a855f7" />
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(320 150) rotate(90) scale(210 380)">
      <stop stop-color="#22d3ee" stop-opacity="0.2" />
      <stop offset="1" stop-color="#020617" stop-opacity="0" />
    </radialGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M28 0H0V28" stroke="#22d3ee" stroke-opacity="0.08" />
    </pattern>
    <style>
      .title { font: 700 26px Consolas, 'JetBrains Mono', monospace; fill: #f8fafc; letter-spacing: 0; }
      .value { font: 700 25px Consolas, 'JetBrains Mono', monospace; fill: #d1fae5; letter-spacing: 0; }
      .label { font: 600 15px Consolas, 'JetBrains Mono', monospace; letter-spacing: 0; }
      .tiny { font: 500 13px Consolas, 'JetBrains Mono', monospace; letter-spacing: 0; }
      .prompt { fill: #22d3ee; }
      .accent { fill: #a7f3d0; }
      .muted { fill: #94a3b8; }
    </style>
  </defs>
  <rect width="640" height="300" rx="18" fill="#020617" />
  <rect width="640" height="300" fill="url(#grid)" />
  <rect width="640" height="300" fill="url(#glow)" />
  <rect x="20" y="20" width="600" height="260" rx="16" fill="#020617" fill-opacity="0.82" stroke="url(#border)" stroke-width="1.4" />
  <circle cx="44" cy="42" r="5" fill="#ef4444" />
  <circle cx="62" cy="42" r="5" fill="#f59e0b" />
  <circle cx="80" cy="42" r="5" fill="#10b981" />
  ${body}
</svg>`;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
