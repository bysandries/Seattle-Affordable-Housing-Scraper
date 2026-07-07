import path from 'path'
import fs from 'fs'
import initSqlJs from 'sql.js'

let _db = null

async function getDb() {
  if (!_db) {
    const wasmPath = path.join(
      process.cwd(),
      'node_modules',
      'sql.js',
      'dist',
      'sql-wasm.wasm'
    )
    const SQL = await initSqlJs({
      locateFile: () => wasmPath,
    })
    const dbPath = path.join(process.cwd(), 'data', 'seattle_housing.db')
    const fileBuffer = fs.readFileSync(dbPath)
    _db = new SQL.Database(fileBuffer)
  }
  return _db
}

/**
 * Execute a SELECT query and return all rows as plain objects.
 */
function execQuery(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

/**
 * Execute a SELECT query expected to return a single row.
 */
function execQueryOne(db, sql, params = []) {
  const rows = execQuery(db, sql, params)
  return rows[0] ?? null
}

export async function getProperties({
  search = '',
  neighborhood = '',
  program = '',
  maxRent = 0,
  hasListings = false,
  bedroom = '',
  page = 1,
  limit = 48,
}) {
  const db = await getDb()
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
  const rows = execQuery(db, sql, dataParams)
  const countRow = execQueryOne(db, countSql, params)
  const total = countRow ? Number(countRow.total) : 0

  return { properties: rows, total }
}

export async function getMapProperties() {
  const db = await getDb()
  return execQuery(
    db,
    `SELECT id, building_name, address, neighborhood, program, lat, long,
      (SELECT COUNT(*) FROM units WHERE property_id = properties.id AND rent_min IS NOT NULL) AS listing_count
     FROM properties WHERE lat != 0 AND long != 0`
  )
}

export async function getPropertyById(id) {
  const db = await getDb()
  const property = execQueryOne(db, 'SELECT * FROM properties WHERE id = ?', [Number(id)])
  if (!property) return null
  const units = execQuery(
    db,
    'SELECT * FROM units WHERE property_id = ? ORDER BY unit_type, rent_min',
    [Number(id)]
  )
  return { ...property, units }
}

export async function getNeighborhoods() {
  const db = await getDb()
  const rows = execQuery(
    db,
    "SELECT DISTINCT neighborhood FROM properties WHERE neighborhood != '' ORDER BY neighborhood"
  )
  return rows.map((r) => r.neighborhood)
}
