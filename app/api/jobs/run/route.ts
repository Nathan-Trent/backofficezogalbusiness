import { NextResponse } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { runDueJobs } from '@/lib/jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The job runner. Two callers:
 *   - QStash, every minute (schedule created once with the curl in BUILD_LOG),
 *     verified by its signature.
 *   - Our own server right after an enqueue ("kick"), verified by JOBS_SECRET.
 */
export async function POST(req: Request) {
  const body = await req.text()
  const auth = req.headers.get('authorization')
  const secret = process.env.JOBS_SECRET
  let ok = !!secret && auth === `Bearer ${secret}`
  if (!ok && process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY) {
    const r = new Receiver({ currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY, nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY })
    ok = await r.verify({ signature: req.headers.get('upstash-signature') ?? '', body, url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ops.business.zogal.app'}/api/jobs/run` }).catch(() => false)
  }
  if (!ok) return NextResponse.json({ error: 'not allowed' }, { status: 401 })
  const result = await runDueJobs()
  return NextResponse.json(result)
}
