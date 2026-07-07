import Database from 'better-sqlite3'
import path from 'path'

let _db = null

function getDb() {
  if (!_db) {
    const dbPath = path.join(process.cwd(), '..', 'data', 'seattle_housing.db')
    _db = new Database(dbPath, { readonly: true })
  }
  return _db
}

export function getProperties({
  search = '',
  neighborhood = '',
  program = '',
  maxRent = 0,
  hasListings = false,
  bedroom = '',
  page = 1,
  limit = 48,
}) {
  const db = getDb()
  const offset = (page - 1) * limit
  const like = `%${search}%`

  const whereParts = ['p.lat != 0', 'p.long != 0']
  const params = []

  if (search) {
    whereParts.push('(p.building_name LIKE ? OR p.address LIKE ? OR p.neighborhood LIKE ?)')
    params.push(like, like, like)
  }
  if (neighborhood) {
    whereParts.push('p.neighborhood = ?')
    params.push(neighborhood)
  }
  if (program) {
    whereParts.push('p.program = ?')
    params.push(program)
  }
  if (bedroom) {
    whereParts.push('p.br_types LIKE ?')
    params.push(`%${bedroom}%`)
  }

  const where = 'WHERE ' + whereParts.join(' AND ')

  const havingParts = []
  if (hasListings) havingParts.push('listing_count > 0')
  if (maxRent > 0) havingParts.push(`(min_rent IS NULL OR min_rent <= ${Number(maxRent)})`)
  const having = havingParts.length ? 'HAVING ' + havingParts.join(' AND ') : ''

  const sql = `
    SELECT
      p.id, p.building_name, p.address, p.neighborhood, p.program,
      p.amis, p.br_types, p.total_units, p.income_restricted_units,
      p.expiration_date, p.website, p.phone, p.lat, p.long,
      p.owner_management,
      MIN(CASE WHEN u.rent_min > 0 THEN u.rent_min END) AS min_rent,
      MAX(u.rent_max) AS max_rent,
      GROUP_CONCAT(DISTINCT NULLIF(u.unit_type, 'unknown')) AS available_types,
      COUNT(DISTINCT u.id) AS listing_count
    FROM properties p
    LEFT JOIN units u ON p.id = u.property_id AND u.rent_min IS NOT NULL AND (u.available_count IS NULL OR u.available_count > 0)
    ${where}
    GROUP BY p.id
    ${having}
    ORDER BY
      CASE WHEN COUNT(DISTINCT u.id) > 0 THEN 0 ELSE 1 END,
      p.building_name
    LIMIT ? OFFSET ?
  `

  const countSql = `
    SELECT COUNT(*) AS total FROM (
      SELECT p.id,
        COUNT(DISTINCT u.id) AS listing_count,
        MIN(CASE WHEN u.rent_min > 0 THEN u.rent_min END) AS min_rent
      FROM properties p
      LEFT JOIN units u ON p.id = u.property_id AND u.rent_min IS NOT NULL AND (u.available_count IS NULL OR u.available_count > 0)
      ${where}
      GROUP BY p.id
      ${having}
    )
  `

  const dataParams = [...params, limit, offset]
  const rows = db.prepare(sql).all(...dataParams)
  const { total } = db.prepare(countSql).get(...params)

  return { properties: rows, total }
}

export function getMapProperties() {
  const db = getDb()
  return db
    .prepare(
      `SELECT id, building_name, address, neighborhood, program, lat, long,
        (SELECT COUNT(*) FROM units WHERE property_id = properties.id AND rent_min IS NOT NULL) AS listing_count
       FROM properties WHERE lat != 0 AND long != 0`
    )
    .all()
}

export function getPropertyById(id) {
  const db = getDb()
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(Number(id))
  if (!property) return null
  const units = db
    .prepare('SELECT * FROM units WHERE property_id = ? ORDER BY unit_type, rent_min')
    .all(Number(id))
  return { ...property, units }
}

export function getNeighborhoods() {
  const db = getDb()
  return db
    .prepare("SELECT DISTINCT neighborhood FROM properties WHERE neighborhood != '' ORDER BY neighborhood")
    .all()
    .map((r) => r.neighborhood)
}
