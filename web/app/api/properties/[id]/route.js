import { NextResponse } from 'next/server'
import { getPropertyById } from '@/lib/db'

export async function GET(_req, { params }) {
  const property = await getPropertyById(params.id)
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(property)
}
