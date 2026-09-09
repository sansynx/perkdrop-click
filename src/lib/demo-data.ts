export type Drop = {
  slug: string
  provider: string
  providerMark: string
  logoUrl: string
  title: string
  description: string
  value: string
  category: string
  resourceType: string
  eligibility: string
  region: string
  source: string
  sourceType: string
  ago: string
  claimed: string
  confirmed: string
  expires?: string
  requiresCard?: boolean
}

export const drops: Drop[] = [
  { slug: 'cursor-hackathon-credits', provider: 'Cursor', providerMark: 'C', logoUrl: 'https://cdn.simpleicons.org/cursor/1B1B19', title: '$50 Cursor credits for hackathon builders', description: 'A small credit drop for builders who are actively shipping in a registered hackathon.', value: '$50', category: 'Developer Tools', resourceType: 'Hackathon perk', eligibility: 'Hackathon participants', region: 'Worldwide', source: '@buildspace', sourceType: 'X', ago: '2h ago', claimed: '42 claimed', confirmed: '8 confirmed this week', expires: 'Ends in 6 days' },
  { slug: 'cloudflare-workers-startup-program', provider: 'Cloudflare', providerMark: 'CF', logoUrl: 'https://cdn.simpleicons.org/cloudflare/1B1B19', title: 'Workers credits for early-stage startups', description: 'Cloud credits and platform support for startups with a working product and a clear use case.', value: '$5,000', category: 'Cloud & Hosting', resourceType: 'Startup program', eligibility: 'Startups', region: 'Worldwide', source: 'Cloudflare for Startups', sourceType: 'Official site', ago: '4h ago', claimed: '118 claimed', confirmed: '21 confirmed this week', requiresCard: false },
  { slug: 'github-student-developer-pack', provider: 'GitHub', providerMark: 'GH', logoUrl: 'https://cdn.simpleicons.org/github/1B1B19', title: 'Student Developer Pack', description: 'A collection of useful developer tools, learning resources and credits for verified students.', value: '20+ perks', category: 'Education', resourceType: 'Student perk', eligibility: 'Students', region: 'Worldwide', source: 'GitHub Education', sourceType: 'Official site', ago: '7h ago', claimed: '2.4k claimed', confirmed: '94 confirmed this week' },
  { slug: 'resend-open-source-program', provider: 'Resend', providerMark: 'R', logoUrl: 'https://cdn.simpleicons.org/resend/1B1B19', title: 'Free email sending for open-source projects', description: 'A generous free sending allowance for public projects maintained in the open.', value: 'Free forever', category: 'Open Source', resourceType: 'OSS program', eligibility: 'OSS maintainers', region: 'Worldwide', source: 'Resend OSS', sourceType: 'Official site', ago: '1d ago', claimed: '76 claimed', confirmed: '14 confirmed this week', requiresCard: false },
  { slug: 'namecheap-student-domain', provider: 'Namecheap', providerMark: 'N', logoUrl: 'https://cdn.simpleicons.org/namecheap/1B1B19', title: 'Free .me domain for students', description: 'A personal domain for your portfolio, side project or next small internet experiment.', value: '1 year free', category: 'Domains', resourceType: 'Domain', eligibility: 'Students', region: 'Worldwide', source: 'Namecheap Student', sourceType: 'Official site', ago: '1d ago', claimed: '391 claimed', confirmed: '33 confirmed this week', expires: 'Ends in 12 days' },
  { slug: 'modal-api-credits', provider: 'Modal', providerMark: 'M', logoUrl: 'https://cdn.simpleicons.org/modal/1B1B19', title: '$30 in serverless GPU credits', description: 'Try GPU workloads without a commitment. Useful for demos, experiments and small research jobs.', value: '$30', category: 'AI & APIs', resourceType: 'Credits', eligibility: 'Everyone', region: 'Worldwide', source: 'Modal docs', sourceType: 'Documentation', ago: '2d ago', claimed: '204 claimed', confirmed: '28 confirmed this week', requiresCard: false },
  { slug: 'frontend-masters-free-course', provider: 'Frontend Masters', providerMark: 'FM', logoUrl: 'https://cdn.simpleicons.org/frontendmasters/1B1B19', title: 'Free course: Build a web app from scratch', description: 'A practical course covering the route from blank folder to a shipped web experience.', value: 'Free course', category: 'Education', resourceType: 'Course', eligibility: 'Everyone', region: 'Worldwide', source: 'Frontend Masters', sourceType: 'Official site', ago: '3d ago', claimed: '84 claimed', confirmed: '12 confirmed this week' },
  { slug: 'vercel-oss-sponsorship', provider: 'Vercel', providerMark: 'V', logoUrl: 'https://cdn.simpleicons.org/vercel/1B1B19', title: 'Hosting credits for open-source maintainers', description: 'Hosting support for projects with a public repository and a visible community.', value: 'Up to $300', category: 'Open Source', resourceType: 'OSS program', eligibility: 'OSS maintainers', region: 'Worldwide', source: 'Vercel OSS', sourceType: 'Official site', ago: '4d ago', claimed: '57 claimed', confirmed: '9 confirmed this week' },
]

export const categories = ['Everything', 'AI & APIs', 'Cloud & Hosting', 'Developer Tools', 'Domains', 'Education', 'Open Source', 'Startup']
export const audiences = ['Everyone', 'Students', 'Developers', 'Startups', 'OSS', 'Hackathons', 'Creators', 'Researchers']
export const sortOptions = ['Trending', 'New', 'Ending Soon', 'Most Claimed', 'Recently Confirmed']
export function getDrop(slug: string) { return drops.find((drop) => drop.slug === slug) }
