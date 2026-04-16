# Dashboard Enhancement Design Spec

**Date:** 2026-04-16
**Status:** Approved
**Principle:** Additive only. Keep existing two-tab layout, card-based UI, dark theme. No features removed. All new features live inside expanded job cards or as lightweight badges on collapsed cards.

---

## 1. Enhanced Multi-Dimension Scoring

**Current state:** Keyword-count scoring (base 20 + title/skill/word/bigram bonuses, capped at 98). Free and instant.

**Enhancement:** Add new scoring dimensions to the existing algorithm in `server.js POST /api/find-jobs`. No AI API calls.

### New Scoring Dimensions

| Dimension | Signal | Points | Cap |
|-----------|--------|--------|-----|
| Skill match | Existing keyword overlap | +5 per match | 30 |
| Title relevance | Existing title similarity | +15 per match | 25 |
| Word frequency | Existing word/bigram counts | +2/+1/+4 | 23 |
| **Posting freshness** | Days since posted | +10 (< 7d), +5 (< 14d), +0 (< 30d), -5 (> 30d) | 10 |
| **Salary alignment** | When salary data available, compare to market range | +5 (within range), +0 (no data) | 5 |
| **Remote/location fit** | Stronger weighting for exact location match vs "remote" vs "anywhere" | +5 (exact match), +3 (remote), +0 (other) | 5 |

**Total possible:** Still capped at 98. Base score adjusted to 15 to accommodate new dimensions.

### Data Requirements
- Posting date: Already available from RemoteOK, Arbeitnow, Jobicy, Remotive, The Muse APIs
- Salary data: Already available from RemoteOK (salary_min/max), Jobicy (salaryMin/Max), partially from others
- Location data: Already available from all sources

### Implementation Notes
- Modify the scoring function in `server.js` to include new dimensions
- Normalize posting dates across all API sources to a consistent format
- Salary comparison needs a baseline — extract from resume keywords or use a sensible default range

---

## 2. Smart ATS Portal Scanning

**What:** Scan Greenhouse, Ashby, and Lever public APIs for job listings at ~40-50 pre-configured companies. Auto-select which companies to scan based on the user's resume keywords.

### Public APIs (no auth required)

| Platform | URL Pattern | Response |
|----------|-------------|----------|
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs` | JSON array of jobs |
| Ashby | `https://api.ashbyhq.com/posting-api/job-board/{slug}` | JSON job board |
| Lever | `https://api.lever.co/v0/postings/{slug}` | JSON array of postings |

### Company List Structure

Stored in `server.js` as a static array. Each entry:

```javascript
{
  slug: "airbnb",
  name: "Airbnb",
  platform: "greenhouse",  // or "ashby" or "lever"
  tags: ["hospitality", "community", "product", "growth", "travel"]
}
```

~40-50 companies covering: tech, hospitality, community platforms, marketplaces, SaaS, consumer products, real estate tech, etc.

### Smart Selection Algorithm

1. Extract keywords from user's resume (existing keyword extraction logic)
2. Match keywords against company tags
3. Select top 15-20 companies with highest tag overlap
4. Fetch jobs from selected companies in parallel (10 concurrent, 10s timeout each)
5. Filter results by title keywords (positive matches from resume)
6. Merge into existing job results, deduplicate by normalized title+company
7. Cache results for 30 minutes (same as existing API cache)

### Integration with Existing Flow
- ATS results merge seamlessly into the same job list
- Same scoring algorithm applies
- Same fit ring visualization
- A small badge on the job card indicates the source (e.g., "via Greenhouse")

---

## 3. Ghost Job Detection

**What:** Three signals displayed as badges/icons on job cards. Visible on collapsed cards. More detail when expanded.

### Signal A: Posting Age Badge

- Shown on every job card (collapsed and expanded)
- Format: "Posted X days ago"
- Color coding:
  - Green: 0-7 days (fresh)
  - Default/grey: 8-30 days
  - Amber: 31-45 days
  - Red: 46+ days (stale warning)
- Data source: posting date from API responses (already available)

### Signal B: Repost Detection

- Flag when the same company + similar role title appears multiple times in results
- Shown as a small icon/badge: "Reposted" with tooltip "This role has been posted multiple times"
- Detection: normalize title+company, group duplicates, flag any group with 2+ entries
- Only shown when duplicates found

### Signal C: Layoff Signal

- Small warning icon if company appears on a recent layoffs list
- Static list stored in `server.js`, updated periodically
- Format: caution icon with tooltip "Recent layoffs reported at {company}"
- Data source: curated static array of company names with layoff dates
  ```javascript
  const RECENT_LAYOFFS = [
    { company: "example", date: "2026-03", source: "layoffs.fyi" },
    // ...
  ];
  ```
- Match by normalized company name
- Only show if layoff date is within last 6 months

### Ghost Score (internal)
- Combine signals into a ghost risk level: "low" / "medium" / "high"
- Low: fresh post, no repost, no layoffs
- Medium: 1 signal triggered
- High: 2+ signals triggered
- Shown as a subtle indicator inside the expanded job card, not on the collapsed view (to avoid clutter)

---

## 4. Pipeline Follow-Up Tracker

**What:** When a job moves to "Applied" stage in the pipeline, a countdown badge appears on the job card.

### Behavior

1. User drags/selects a job to "Applied" status
2. System records `appliedDate = Date.now()` in the job's localStorage entry
3. A badge appears on the job card: "Follow up in X days"
4. Countdown:
   - 7-4 days remaining: default style
   - 3-1 days remaining: amber badge
   - 0 or overdue: red badge, text changes to "Follow up overdue (X days)"
5. Badge disappears when:
   - Job moves to "Interview", "Offer", or "Rejected" stage
   - User clicks a dismiss/snooze button on the badge (resets to 7 days)

### Data Storage
- Add `appliedDate` and `followUpDismissed` fields to the job object in localStorage
- No server-side storage needed

### UI Placement
- Badge appears inside the job card, near the pipeline stage dropdown
- Small, non-intrusive — same style as the existing fit tier badges (hot match/strong fit/good fit)

---

## 5. Interview Prep Panel

**What:** When a job is in "Interview" stage, an expandable section appears inside the job card with company facts and STAR story prompts.

### 5A: Company Quick-Facts

Displayed as a compact info card inside the expanded job card.

| Field | Source | Fallback |
|-------|--------|----------|
| Company size | Static lookup table | "Unknown" |
| Funding stage | Static lookup table | Hidden |
| Glassdoor rating | Static lookup table | Hidden |
| Recent news | Static lookup table (updated periodically) | Hidden |
| Industry | From job API data or company tags | "Technology" |

**Data source:** A static `COMPANY_INFO` object in `server.js` or a JSON file. For companies not in the lookup, show only what's available from the job API data (company name, location, job count).

**No external API calls** — this stays free and instant. The lookup table covers the ~40-50 companies from the ATS portal list, plus any commonly appearing companies from the existing job APIs.

### 5B: STAR Story Prompts

Generated client-side by matching JD keywords against resume keywords.

**Algorithm:**
1. Extract top 5-8 skill/domain keywords from the job description
2. Match each against the user's resume text
3. For matched keywords, generate a prompt: "Be ready to talk about: {keyword}"
4. For unmatched keywords (gaps), generate: "Prepare examples for: {keyword} (not in your resume)"
5. Display as a simple bulleted list inside the job card

**Example output:**
```
Prepare to discuss:
  * Community building (strong in your resume)
  * Cross-functional leadership (strong in your resume)
  * Revenue growth (in your resume)
  * Python/SQL (gap - prepare examples)
  * Enterprise sales (gap - prepare examples)
```

### UI Placement
- Appears as a collapsible section inside the expanded job card
- Header: "Interview Prep" with a small icon
- Only visible when job is in "Interview" pipeline stage
- Same card styling as existing expandable sections

---

## 6. Unchanged Features

Everything below remains exactly as-is:

- Two tabs: "My Board" + "Example - Kyle's Board"
- Fit Distribution donut chart (green/blue/amber)
- Sources of Me card (upload, LinkedIn, freeform notes)
- Top 5 Matches list
- Fit ring SVG visualization with stroke animation
- Job card expand/collapse pattern
- Pipeline tracker (Saved -> Applied -> Interview -> Offer -> Rejected)
- Command palette (Ctrl+K)
- Stats grid with animated counters
- Clearbit logo fallback
- All existing styling: dark theme, Inter/Rubik/IBM Plex Mono fonts, card borders, color variables
- Kyle's Example Board with 18 pre-tailored resumes
- Resume tailoring endpoint (`/api/tailor-resume`)
- Hunter.io email finder
- Server-Sent Events progress updates

---

## 7. File Changes Summary

| File | Changes |
|------|---------|
| `server.js` | Enhanced scoring function, ATS scanning endpoints, company list, ghost detection data, company info lookup |
| `public/index.html` | Ghost badges on job cards, follow-up countdown, interview prep panel, source badges, updated scoring display |

No new files required. No new dependencies. No new tabs or pages.
