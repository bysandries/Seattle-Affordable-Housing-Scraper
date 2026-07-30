import { NextResponse } from 'next/server'
import { getPropertyById } from '@/lib/db'

// Reads the SQLite file off disk, so this must run on Node, not Edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req, { params }) {
  const property = await getPropertyById(params.id)
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(property)
}
