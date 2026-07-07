import { NextResponse } from 'next/server'
import { getPropertyById } from '@/lib/db'

export function GET(_req, { params }) {
  const property = getPropertyById(params.id)
  if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(property)
}
