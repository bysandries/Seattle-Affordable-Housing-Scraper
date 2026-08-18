import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'
import initSqlJs from 'sql.js'
import { bedroomAliases } from '@/lib/bedrooms'
import { addressKey } from '@/lib/addresses'
import { tokenizeQuery } from '@/lib/searchQuery'

let _db = null

/**
 * Resolve a bundled asset. Serverless builds do not guarantee that
 * process.cwd() is the project root, so try each plausible location and fail
 * with the full list rather than a bare ENOENT.
 */
function resolveAsset(candidates, label) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  throw new Error(
    `Could not locate ${label}. Looked in:\n  ${candidates.filter(Boolean).join('\n  ')}\n` +
      `cwd=${process.cwd()}. Ensure next.config.mjs traces this file into the function bundle.`
  )
}

function wasmPath() {
  const require = createRequire(import.meta.url)
  let fromPackage = null
  try {
    // Follows the actual install location, including hoisted node_modules.
    fromPackage = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
  } catch {
    // fall through to the path-based candidates
  }
  return resolveAsset(
    [
      fromPackage,
      path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      path.join(process.cwd(), 'web', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    ],
    'sql-wasm.wasm'
  )
}

function dbPath() {
  return resolveAsset(
    [
      process.env.SEATTLE_HOUSING_DB,
      path.join(process.cwd(), 'data', 'seattle_housing.db'),
      path.join(process.cwd(), 'web', 'data', 'seattle_housing.db'),
    ],
    'seattle_housing.db'
  )
}

async function getDb() {
  if (!_db) {
    const wasm = wasmPath()
    const SQL = await initSqlJs({ locateFile: () => wasm })
    _db = new SQL.Database(fs.readFileSync(dbPath()))
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

/**
 * Older DB files predate the affordable_buildings table. Probe once so the
 * incentive-program columns and filters can be skipped rather than throwing and
 * taking the whole listing query down with them.
 */
let _hasAffordable = null
function hasAffordableTable(db) {
  if (_hasAffordable === null) {
    _hasAffordable =
      execQuery(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='affordable_buildings'")
        .length > 0
  }
  return _hasAffordable
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

/**
 * Incentive-program filters, keyed by the value the client sends. A property
 * can be matched to more than one affordable_buildings row, so these are
 * EXISTS subqueries rather than a join — a join would fan out the unit
 * aggregates. `none` covers both "no matched row" and "matched but in none of
 * the three programs", i.e. buildings affordable through LIHTC, project-based
 * Section 8 or city funding instead of a market-rate incentive.
 */
const INCENTIVE_SQL = {
  mfte: 'EXISTS (SELECT 1 FROM affordable_buildings a WHERE a.property_id = p.id AND a.has_mfte = 1)',
  iz: 'EXISTS (SELECT 1 FROM affordable_buildings a WHERE a.property_id = p.id AND a.has_iz = 1)',
  mha: 'EXISTS (SELECT 1 FROM affordable_buildings a WHERE a.property_id = p.id AND a.has_mha = 1)',
  none: `NOT EXISTS (SELECT 1 FROM affordable_buildings a WHERE a.property_id = p.id
    AND (a.has_mfte = 1 OR a.has_iz = 1 OR a.has_mha = 1))`,
}

/** Per-property incentive flags, as scalar subqueries to avoid the same fan-out. */
const INCENTIVE_FLAGS_SQL = ['mfte', 'iz', 'mha']
  .map(
    (k) =>
      `COALESCE((SELECT MAX(a.has_${k}) FROM affordable_buildings a
         WHERE a.property_id = p.id), 0) AS has_${k}`
  )
  .join(',\n      ')

export async function getProperties({
  search = '',
  neighborhood = '',
  city = '',
  county = '',
  program = '',
  incentive = '',
  maxRent = 0,
  hasListings = false,
  availableNow = false,
  bedroom = '',
  ids = null,
  page = 1,
  limit = 48,
}) {
  const db = await getDb()
  const offset = (page - 1) * limit

  // Coordinates are not required to be listed. Some statewide records have no
  // geocode, and dropping them would hide real affordable housing; they simply
  // do not get a map pin. getMapProperties still requires a location.
  const whereParts = []
  const params = []

  // Keyword search, not phrase search: "rent in seattle" must match Seattle.
  // Filler words are dropped and each remaining keyword independently needs a
  // hit in some field (AND across keywords, OR across fields). Mirrored
  // client-side in page.js's visibleMapProperties — keep the field lists equal.
  for (const token of tokenizeQuery(search)) {
    whereParts.push(
      '(p.building_name LIKE ? OR p.address LIKE ? OR p.neighborhood LIKE ? OR p.city LIKE ? OR p.county LIKE ?)'
    )
    const like = `%${token}%`
    params.push(like, like, like, like, like)
  }
  if (neighborhood) {
    whereParts.push('p.neighborhood = ?')
    params.push(neighborhood)
  }
  if (city) {
    whereParts.push('p.city = ?')
    params.push(city)
  }
  if (county) {
    whereParts.push('p.county = ?')
    params.push(county)
  }
  // Favorites are held client-side, so the browser sends the id set. A present
  // but empty list means "saved nothing yet" — match nothing, not everything.
  if (ids !== null) {
    const numeric = ids.map(Number).filter(Number.isFinite)
    if (!numeric.length) {
      whereParts.push('0 = 1')
    } else {
      whereParts.push(`p.id IN (${numeric.map(() => '?').join(',')})`)
      params.push(...numeric)
    }
  }
  if (program) {
    whereParts.push('p.program = ?')
    params.push(program)
  }
  if (bedroom) {
    const aliases = bedroomAliases(bedroom)
    whereParts.push('(' + aliases.map(() => 'p.br_types LIKE ?').join(' OR ') + ')')
    for (const a of aliases) params.push(`%${a}%`)
  }
  // Looked up by key, so an unknown value is ignored rather than interpolated.
  const withAffordable = hasAffordableTable(db)
  if (incentive && withAffordable && INCENTIVE_SQL[incentive]) {
    whereParts.push(INCENTIVE_SQL[incentive])
  }

  const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : ''

  // Unit-level filters describe a single apartment, so one unit has to satisfy
  // all of them at once. Checking them independently advertised a $2,800
  // one-bedroom as a "1 Bed under $1,500" whenever another unit in the same
  // building happened to be cheap. Mirrored in lib/unitFilter.js for the map
  // and the details panel.
  const unitPredicates = []
  if (bedroom) {
    // Inlined rather than bound: this predicate is written into the statement
    // more than once (the match count and min_rent), which would misalign
    // positional parameters. Stripped to [a-z0-9-] so nothing else can ride in.
    const aliases = bedroomAliases(bedroom)
      .map((a) => String(a).toLowerCase().replace(/[^a-z0-9-]/g, ''))
      .filter(Boolean)
    if (aliases.length) {
      unitPredicates.push(`LOWER(u.unit_type) IN (${aliases.map((a) => `'${a}'`).join(',')})`)
    }
  }
  if (maxRent > 0) unitPredicates.push(`u.rent_min <= ${Number(maxRent)}`)
  if (availableNow) unitPredicates.push(availableNowSql('u'))
  const unitMatch = unitPredicates.join(' AND ')

  const havingParts = []
  if (hasListings) havingParts.push('listing_count > 0')
  if (unitPredicates.length) {
    // A building that publishes no live pricing cannot be judged unit by unit,
    // so it falls back to its published metadata (the br_types match above) —
    // unless the filter itself demands live data.
    havingParts.push(
      availableNow || hasListings
        ? 'matching_unit_count > 0'
        : '(listing_count = 0 OR matching_unit_count > 0)'
    )
  }
  const having = havingParts.length ? 'HAVING ' + havingParts.join(' AND ') : ''

  // Counted and priced over the matching units only, so the card's "from $X"
  // is the cheapest unit the visitor actually filtered for.
  const matchingCount = unitPredicates.length
    ? `COUNT(DISTINCT CASE WHEN ${unitMatch} THEN u.id END) AS matching_unit_count`
    : 'COUNT(DISTINCT u.id) AS matching_unit_count'
  const minRent = `MIN(CASE WHEN u.rent_min > 0${
    unitPredicates.length ? ` AND ${unitMatch}` : ''
  } THEN u.rent_min END) AS min_rent`

  const availNowCount = `COUNT(DISTINCT CASE WHEN ${availableNowSql('u')} THEN u.id END) AS available_now_count`

  const sql = `
    SELECT
      p.id, p.building_name, p.address, p.neighborhood, p.program,
      p.amis, p.br_types, p.total_units, p.income_restricted_units,
      p.expiration_date, p.website, p.phone, p.lat, p.long,
      p.owner_management, p.city, p.state, p.county, p.data_source,
      ${withAffordable ? INCENTIVE_FLAGS_SQL + ',' : ''}
      ${minRent},
      ${matchingCount},
      MAX(u.rent_max) AS max_rent,
      GROUP_CONCAT(DISTINCT NULLIF(u.unit_type, 'unknown')) AS available_types,
      COUNT(DISTINCT u.id) AS listing_count,
      MIN(CASE WHEN u.available_date IS NOT NULL THEN u.available_date END) AS next_available_date,
      MAX(u.image_url) AS image_url,
      ${availNowCount}
    FROM properties p
    LEFT JOIN units u ON p.id = u.property_id AND u.is_current = 1 AND u.rent_min IS NOT NULL AND (u.available_count IS NULL OR u.available_count > 0)
    ${where}
    GROUP BY p.id
    ${having}
    ORDER BY
      CASE WHEN COUNT(DISTINCT u.id) > 0 THEN 0 ELSE 1 END,
      -- Curated affordable stock leads; statewide market-rate rows are
      -- supplementary and are reached through the city / Market Rate filters.
      CASE WHEN IFNULL(p.data_source, 'seattle_oh') = 'appfolio' THEN 1 ELSE 0 END,
      p.building_name
    LIMIT ? OFFSET ?
  `

  const countSql = `
    SELECT COUNT(*) AS total FROM (
      SELECT p.id,
        COUNT(DISTINCT u.id) AS listing_count,
        ${availNowCount},
        ${matchingCount},
        ${minRent}
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
  const withAffordable = hasAffordableTable(db)
  return execQuery(
    db,
    `SELECT p.id, p.building_name, p.address, p.neighborhood, p.program, p.br_types,
      p.lat, p.long, p.city, p.county, p.data_source,
      ${withAffordable ? INCENTIVE_FLAGS_SQL + ',' : ''}
      (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.is_current = 1
         AND u.rent_min IS NOT NULL AND (u.available_count IS NULL OR u.available_count > 0)
         AND ${availableNowSql('u')}) AS available_now_count,
      (SELECT MIN(available_date) FROM units WHERE property_id = p.id AND is_current = 1
         AND rent_min IS NOT NULL AND (available_count IS NULL OR available_count > 0)
         AND available_date IS NOT NULL) AS next_available_date,
      (SELECT COUNT(*) FROM units WHERE property_id = p.id AND is_current = 1
         AND rent_min IS NOT NULL
         AND (available_count IS NULL OR available_count > 0)) AS listing_count,
      (SELECT MIN(rent_min) FROM units WHERE property_id = p.id AND is_current = 1
         AND rent_min > 0
         AND (available_count IS NULL OR available_count > 0)) AS min_rent,
      -- Each live unit as "type:rent:availableNow", so the client-side mirror
      -- can apply the same per-unit filter rule as the list query without
      -- refetching. Parsed by parseUnitSummary in lib/unitFilter.js.
      (SELECT GROUP_CONCAT(u.unit_type || ':' || IFNULL(u.rent_min, '') || ':' ||
           (CASE WHEN ${availableNowSql('u')} THEN 1 ELSE 0 END), '|')
         FROM units u WHERE u.property_id = p.id AND u.is_current = 1
         AND u.rent_min IS NOT NULL
         AND (u.available_count IS NULL OR u.available_count > 0)) AS unit_summary
     FROM properties p WHERE p.lat != 0 AND p.long != 0`
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

/**
 * When the newest unit listing was indexed — the honest "data as of" date for
 * the site banner. ISO string, or null on an empty/older database.
 */
export async function getLastIndexedAt() {
  const db = await getDb()
  const rows = tryQuery(db, 'SELECT MAX(scraped_at) AS at FROM units')
  return rows[0]?.at ?? null
}

export async function getNeighborhoods() {
  const db = await getDb()
  // Seattle-dataset neighbourhoods only; statewide rows carry their city here
  // instead, and are selected through the separate city filter.
  const rows = execQuery(
    db,
    `SELECT DISTINCT neighborhood FROM properties
     WHERE neighborhood != '' AND IFNULL(data_source, 'seattle_oh') != 'appfolio'
     ORDER BY neighborhood`
  )
  return rows.map((r) => r.neighborhood)
}

/**
 * Map normalized address keys to current property ids.
 *
 * Scraped buildings take their id from a hash of the normalized address, so a
 * change to that normalization reissues the id and orphans anything holding the
 * old one. Shared links carry the raw address for exactly this reason: it is
 * re-normalized here, against whatever the rules are now, and finds the
 * building again.
 */
export async function resolveAddressKeys(keys) {
  const wanted = new Set(keys)
  if (!wanted.size) return {}
  const db = await getDb()
  const rows = execQuery(
    db,
    `SELECT id, address, city FROM properties WHERE address IS NOT NULL AND address != ''`
  )
  const found = {}
  for (const row of rows) {
    const key = addressKey(row.address, row.city)
    // First writer wins, so a stable dataset id is preferred over a scraped
    // duplicate at the same address.
    if (wanted.has(key) && found[key] === undefined) found[key] = row.id
  }
  return found
}

export async function getCounties() {
  const db = await getDb()
  const rows = tryQuery(
    db,
    `SELECT county, COUNT(*) AS n FROM properties
     WHERE county IS NOT NULL AND county != ''
     GROUP BY county ORDER BY county`
  )
  return rows.map((r) => r.county)
}

export async function getCities() {
  const db = await getDb()
  const rows = tryQuery(
    db,
    `SELECT city, COUNT(*) AS n FROM properties
     WHERE city IS NOT NULL AND city != ''
     GROUP BY city ORDER BY n DESC, city`
  )
  return rows.map((r) => r.city)
}
