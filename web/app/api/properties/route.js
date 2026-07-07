import { NextResponse } from 'next/server'
import { getProperties, getMapProperties, getNeighborhoods } from '@/lib/db'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (type === 'map') {
    return NextResponse.json(await getMapProperties())
  }

  if (type === 'neighborhoods') {
    return NextResponse.json(await getNeighborhoods())
  }

  const result = await getProperties({
    search: searchParams.get('search') || '',
    neighborhood: searchParams.get('neighborhood') || '',
    program: searchParams.get('program') || '',
    bedroom: searchParams.get('bedroom') || '',
    maxRent: Number(searchParams.get('maxRent')) || 0,
    hasListings: searchParams.get('hasListings') === 'true',
    page: Number(searchParams.get('page')) || 1,
    limit: 48,
  })

  return NextResponse.json(result)
}
