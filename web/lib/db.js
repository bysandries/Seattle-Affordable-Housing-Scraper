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

/** Today as YYYY-MM-DD in local time, for comparing against available_date. */
function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * SQL predicate for "available now": scraped as immediately available, or a
 * published date that has since arrived. `alias` is the units table alias.
 * The date is generated here, never user input, so inlining it is safe.
 */
function availableNowSql(alias) {
  return `(${alias}.availability_status = 'now'
    OR (${alias}.available_date IS NOT NULL AND ${alias}.available_date <= '${todayIso()}'))`
}

export async function getProperties({
  search = '',
  neighborhood = '',
  program = '',
  maxRent = 0,
  hasListings = false,
  availableNow = false,
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
  if (availableNow) havingParts.push('available_now_count > 0')
  if (maxRent > 0) havingParts.push(`(min_rent IS NULL OR min_rent <= ${Number(maxRent)})`)
  const having = havingParts.length ? 'HAVING ' + havingParts.join(' AND ') : ''

  const availNowCount = `COUNT(DISTINCT CASE WHEN ${availableNowSql('u')} THEN u.id END) AS available_now_count`

  const sql = `
    SELECT
      p.id, p.building_name, p.address, p.neighborhood, p.program,
      p.amis, p.br_types, p.total_units, p.income_restricted_units,
      p.expiration_date, p.website, p.phone, p.lat, p.long,
      p.owner_management,
      MIN(CASE WHEN u.rent_min > 0 THEN u.rent_min END) AS min_rent,
      MAX(u.rent_max) AS max_rent,
      GROUP_CONCAT(DISTINCT NULLIF(u.unit_type, 'unknown')) AS available_types,
      COUNT(DISTINCT u.id) AS listing_count,
      MIN(CASE WHEN u.available_date IS NOT NULL THEN u.available_date END) AS next_available_date,
      ${availNowCount}
    FROM properties p
    LEFT JOIN units u ON p.id = u.property_id AND u.is_current = 1 AND u.rent_min IS NOT NULL AND (u.available_count IS NULL OR u.available_count > 0)
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
        ${availNowCount},
        MIN(CASE WHEN u.rent_min > 0 THEN u.rent_min END) AS min_rent
      FROM properties p
      LEFT JOIN units u ON p.id = u.property_id AND u.is_current = 1 AND u.rent_min IS NOT NULL AND (u.available_count IS NULL OR u.available_count > 0)
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
    `SELECT id, building_name, address, neighborhood, program, br_types, lat, long,
      (SELECT COUNT(*) FROM units u WHERE u.property_id = properties.id AND u.is_current = 1
         AND u.rent_min IS NOT NULL AND (u.available_count IS NULL OR u.available_count > 0)
         AND ${availableNowSql('u')}) AS available_now_count,
      (SELECT MIN(available_date) FROM units WHERE property_id = properties.id AND is_current = 1
         AND rent_min IS NOT NULL AND (available_count IS NULL OR available_count > 0)
         AND available_date IS NOT NULL) AS next_available_date,
      (SELECT COUNT(*) FROM units WHERE property_id = properties.id AND is_current = 1
         AND rent_min IS NOT NULL
         AND (available_count IS NULL OR available_count > 0)) AS listing_count,
      (SELECT MIN(rent_min) FROM units WHERE property_id = properties.id AND is_current = 1
         AND rent_min > 0
         AND (available_count IS NULL OR available_count > 0)) AS min_rent
     FROM properties WHERE lat != 0 AND long != 0`
  )
}

/** Like execQuery but returns [] when the table doesn't exist yet (older DB files). */
function tryQuery(db, sql, params = []) {
  try {
    return execQuery(db, sql, params)
  } catch {
    return []
  }
}

export async function getPropertyById(id) {
  const db = await getDb()
  const property = execQueryOne(db, 'SELECT * FROM properties WHERE id = ?', [Number(id)])
  if (!property) return null
  // Only the newest scrape of each source; soonest-available first.
  const units = execQuery(
    db,
    `SELECT * FROM units WHERE property_id = ? AND is_current = 1
     ORDER BY
       CASE availability_status WHEN 'now' THEN 0 WHEN 'future' THEN 1 ELSE 2 END,
       available_date, unit_type, rent_min`,
    [Number(id)]
  )
  const affordable = tryQuery(
    db,
    'SELECT * FROM affordable_buildings WHERE property_id = ?',
    [Number(id)]
  )[0] ?? null
  const qualifications = tryQuery(
    db,
    `SELECT bedroom, program, rent_schedule, ami_pct, max_rent,
            income_limit_1, income_limit_2, income_limit_3, income_limit_4
     FROM unit_qualifications WHERE property_id = ?
     ORDER BY
       CASE bedroom
         WHEN 'Micro' THEN 0 WHEN 'Studio' THEN 1 WHEN '1-Bedroom' THEN 2
         WHEN '2-Bedroom' THEN 3 ELSE 4
       END,
       ami_pct, program`,
    [Number(id)]
  )
  const pageInfo = tryQuery(
    db,
    'SELECT * FROM affordable_page_info WHERE property_id = ?',
    [Number(id)]
  )[0] ?? null
  return { ...property, units, affordable, qualifications, pageInfo }
}

export async function getNeighborhoods() {
  const db = await getDb()
  const rows = execQuery(
    db,
    "SELECT DISTINCT neighborhood FROM properties WHERE neighborhood != '' ORDER BY neighborhood"
  )
  return rows.map((r) => r.neighborhood)
}
