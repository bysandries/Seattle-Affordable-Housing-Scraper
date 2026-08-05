import { NextResponse } from 'next/server'
import { getProperties, getMapProperties, getNeighborhoods, getCities } from '@/lib/db'

// Reads the SQLite file off disk, so this must run on Node, not Edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (type === 'map') {
    return NextResponse.json(await getMapProperties())
  }

  if (type === 'neighborhoods') {
    return NextResponse.json(await getNeighborhoods())
  }

  if (type === 'cities') {
    return NextResponse.json(await getCities())
  }

  // Present-but-empty must stay an empty array, not null: it means the visitor
  // has no favorites yet, which should match nothing.
  const rawIds = searchParams.get('ids')
  const ids = rawIds === null ? null : rawIds.split(',').filter(Boolean)

  const result = await getProperties({
    search: searchParams.get('search') || '',
    neighborhood: searchParams.get('neighborhood') || '',
    city: searchParams.get('city') || '',
    program: searchParams.get('program') || '',
    incentive: searchParams.get('incentive') || '',
    bedroom: searchParams.get('bedroom') || '',
    ids,
    maxRent: Number(searchParams.get('maxRent')) || 0,
    hasListings: searchParams.get('hasListings') === 'true',
    availableNow: searchParams.get('availableNow') === 'true',
    page: Number(searchParams.get('page')) || 1,
    limit: 48,
  })

  return NextResponse.json(result)
}
