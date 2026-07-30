import sqlite3
from contextlib import contextmanager
from typing import Generator

from config import APPFOLIO_MASTER_URLS, DB_PATH
from models import (
    AffordableBuilding,
    AffordablePageInfo,
    IncomeLimit,
    Property,
    RentLimit,
    UnitListing,
    UnitQualification,
)


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


@contextmanager
def db_conn() -> Generator[sqlite3.Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _migrate_units_columns(conn: sqlite3.Connection) -> None:
    """Add normalized-availability and snapshot columns to an existing units table.

    `is_current` marks the newest scrape of each property so history is retained
    while queries can still ask for just the live listings. Currency is scoped
    per (property_id, source) because two ingest paths write units for the same
    property — the per-site scraper and the bulk AppFolio portal scraper — and a
    fresh run of one must not demote the other's still-valid rows.
    """
    if not conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='units'"
    ).fetchone():
        return

    existing = {r["name"] for r in conn.execute("PRAGMA table_info(units)")}
    added = []
    for col, decl in (
        ("available_date", "TEXT"),
        ("availability_status", "TEXT"),
        ("is_current", "INTEGER DEFAULT 1"),
        ("source", "TEXT"),
    ):
        if col not in existing:
            conn.execute(f"ALTER TABLE units ADD COLUMN {col} {decl}")
            added.append(col)

    if "source" in added:
        placeholders = ",".join("?" * len(APPFOLIO_MASTER_URLS))
        conn.execute(
            f"UPDATE units SET source = CASE WHEN source_url IN ({placeholders}) "
            f"THEN 'appfolio-master' ELSE 'site' END",
            list(APPFOLIO_MASTER_URLS),
        )
        recompute_current_flags(conn)


def recompute_current_flags(conn: sqlite3.Connection) -> None:
    """Mark the newest scrape of each (property_id, source) pair as current."""
    conn.execute(
        """
        UPDATE units SET is_current = CASE WHEN scraped_at = (
            SELECT MAX(u2.scraped_at) FROM units u2
            WHERE u2.property_id = units.property_id
              AND IFNULL(u2.source, 'site') = IFNULL(units.source, 'site')
        ) THEN 1 ELSE 0 END
        """
    )


def init_db() -> None:
    with db_conn() as conn:
        # Older databases named this table mfte_properties even though it holds
        # all three incentive programs (MFTE / IZ / MHA).
        legacy = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='mfte_properties'"
        ).fetchone()
        if legacy:
            conn.execute("ALTER TABLE mfte_properties RENAME TO affordable_buildings")
            conn.execute("DROP INDEX IF EXISTS idx_mfte_property_id")

        _migrate_units_columns(conn)
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS properties (
                id INTEGER PRIMARY KEY,
                building_name TEXT,
                address TEXT,
                neighborhood TEXT,
                program TEXT,
                owner_management TEXT,
                phone TEXT,
                website TEXT,
                website_discovered TEXT,
                website_status TEXT,
                total_units INTEGER,
                income_restricted_units INTEGER,
                amis TEXT,
                br_types TEXT,
                expiration_date TEXT,
                lat REAL,
                long REAL,
                last_fetched_at TEXT
            );

            CREATE TABLE IF NOT EXISTS units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                property_id INTEGER REFERENCES properties(id),
                unit_type TEXT,
                sqft INTEGER,
                rent_min INTEGER,
                rent_max INTEGER,
                available_count INTEGER,
                available_from TEXT,
                available_date TEXT,
                availability_status TEXT,
                is_current INTEGER DEFAULT 1,
                source TEXT,
                property_description TEXT,
                amenities TEXT,
                source_url TEXT,
                scraped_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_units_property_id ON units(property_id);
            CREATE INDEX IF NOT EXISTS idx_units_scraped_at ON units(scraped_at);
            CREATE INDEX IF NOT EXISTS idx_units_current ON units(property_id, is_current);
            CREATE INDEX IF NOT EXISTS idx_units_available_date ON units(available_date);

            CREATE TABLE IF NOT EXISTS affordable_buildings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                building_name TEXT,
                address TEXT,
                neighborhood TEXT,
                phone TEXT,
                website TEXT,
                total_units INTEGER,
                total_mfte_units INTEGER,
                total_iz_units INTEGER,
                total_mha_units INTEGER,
                total_affordable_units INTEGER,
                expiration_date TEXT,
                micro_ami TEXT,
                studio_ami TEXT,
                one_br_ami TEXT,
                two_br_ami TEXT,
                three_br_ami TEXT,
                amis TEXT,
                br_types TEXT,
                has_mfte INTEGER,
                has_iz INTEGER,
                has_mha INTEGER,
                lat REAL,
                long REAL,
                property_id INTEGER REFERENCES properties(id),
                last_fetched_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_affordable_property_id ON affordable_buildings(property_id);

            CREATE TABLE IF NOT EXISTS unit_qualifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                building_id INTEGER REFERENCES affordable_buildings(id),
                property_id INTEGER REFERENCES properties(id),
                building_name TEXT,
                bedroom TEXT,
                program TEXT,
                rent_schedule TEXT,
                ami_pct INTEGER,
                max_rent INTEGER,
                income_limit_1 INTEGER,
                income_limit_2 INTEGER,
                income_limit_3 INTEGER,
                income_limit_4 INTEGER,
                computed_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_qual_property_id ON unit_qualifications(property_id);

            CREATE TABLE IF NOT EXISTS affordable_page_info (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                building_id INTEGER REFERENCES affordable_buildings(id),
                property_id INTEGER REFERENCES properties(id),
                building_name TEXT,
                website TEXT,
                pages_checked INTEGER,
                mentions_mfte INTEGER,
                mentions_mha INTEGER,
                mentions_affordable INTEGER,
                has_waitlist_mention INTEGER,
                ami_mentions TEXT,
                info_url TEXT,
                snippet TEXT,
                status TEXT,
                scraped_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_pageinfo_property_id ON affordable_page_info(property_id);

            CREATE TABLE IF NOT EXISTS rent_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                program TEXT,
                unit_size TEXT,
                ami_pct INTEGER,
                max_rent INTEGER,
                effective_date TEXT,
                source_url TEXT,
                fetched_at TEXT,
                UNIQUE(program, unit_size, ami_pct)
            );

            CREATE TABLE IF NOT EXISTS income_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                program TEXT,
                family_size INTEGER,
                ami_pct INTEGER,
                max_income INTEGER,
                effective_date TEXT,
                source_url TEXT,
                fetched_at TEXT,
                UNIQUE(program, family_size, ami_pct)
            );
        """)


def upsert_property(conn: sqlite3.Connection, p: Property) -> None:
    conn.execute(
        """
        INSERT INTO properties (
            id, building_name, address, neighborhood, program, owner_management,
            phone, website, total_units, income_restricted_units, amis, br_types,
            expiration_date, lat, long, last_fetched_at
        ) VALUES (
            :id, :building_name, :address, :neighborhood, :program, :owner_management,
            :phone, :website, :total_units, :income_restricted_units, :amis, :br_types,
            :expiration_date, :lat, :long, :last_fetched_at
        )
        ON CONFLICT(id) DO UPDATE SET
            building_name=excluded.building_name,
            address=excluded.address,
            neighborhood=excluded.neighborhood,
            program=excluded.program,
            owner_management=excluded.owner_management,
            phone=excluded.phone,
            website=excluded.website,
            total_units=excluded.total_units,
            income_restricted_units=excluded.income_restricted_units,
            amis=excluded.amis,
            br_types=excluded.br_types,
            expiration_date=excluded.expiration_date,
            lat=excluded.lat,
            long=excluded.long,
            last_fetched_at=excluded.last_fetched_at
        """,
        {
            "id": p.id,
            "building_name": p.building_name,
            "address": p.address,
            "neighborhood": p.neighborhood,
            "program": p.program,
            "owner_management": p.owner_management,
            "phone": p.phone,
            "website": p.website,
            "total_units": p.total_units,
            "income_restricted_units": p.income_restricted_units,
            "amis": p.amis,
            "br_types": p.br_types,
            "expiration_date": p.expiration_date,
            "lat": p.lat,
            "long": p.long,
            "last_fetched_at": p.last_fetched_at,
        },
    )


def update_website_discovery(
    conn: sqlite3.Connection,
    property_id: int,
    discovered: str | None,
    status: str,
) -> None:
    conn.execute(
        "UPDATE properties SET website_discovered=?, website_status=? WHERE id=?",
        (discovered, status, property_id),
    )


def _unit_params(u: UnitListing, source: str = "site") -> dict:
    return {
        "source": source,
        "property_id": u.property_id,
        "unit_type": u.unit_type,
        "sqft": u.sqft,
        "rent_min": u.rent_min,
        "rent_max": u.rent_max,
        "available_count": u.available_count,
        "available_from": u.available_from,
        "available_date": u.available_date,
        "availability_status": u.availability_status,
        "property_description": u.property_description,
        "amenities": u.amenities,
        "source_url": u.source_url,
        "scraped_at": u.scraped_at,
    }


_INSERT_UNIT_SQL = """
    INSERT INTO units (
        property_id, unit_type, sqft, rent_min, rent_max,
        available_count, available_from, available_date, availability_status,
        is_current, source, property_description, amenities, source_url, scraped_at
    ) VALUES (
        :property_id, :unit_type, :sqft, :rent_min, :rent_max,
        :available_count, :available_from, :available_date, :availability_status,
        1, :source, :property_description, :amenities, :source_url, :scraped_at
    )
"""


def insert_units(
    conn: sqlite3.Connection, listings: list[UnitListing], source: str = "site"
) -> None:
    conn.executemany(_INSERT_UNIT_SQL, [_unit_params(u, source) for u in listings])


def _dedupe_listings(listings: list[UnitListing]) -> list[UnitListing]:
    deduped: list[UnitListing] = []
    seen: set[tuple] = set()
    for u in listings:
        key = (u.unit_type, u.sqft, u.rent_min, u.rent_max, u.available_from)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(u)
    return deduped


def insert_units_snapshot(
    conn: sqlite3.Connection,
    property_id: int,
    listings: list[UnitListing],
    source: str = "site",
) -> int:
    """Insert a property's freshly scraped listings as its current snapshot.

    Prior rows from the same source are retained for history but demoted to
    is_current=0, so queries for live availability never mix in listings from an
    earlier scrape. Exact duplicates within the incoming batch are collapsed.
    """
    deduped = _dedupe_listings(listings)
    conn.execute(
        "UPDATE units SET is_current = 0 WHERE property_id = ? AND IFNULL(source,'site') = ?",
        (property_id, source),
    )
    conn.executemany(_INSERT_UNIT_SQL, [_unit_params(u, source) for u in deduped])
    return len(deduped)


def replace_affordable_buildings(conn: sqlite3.Connection, props: list[AffordableBuilding]) -> None:
    """The source layer is a point-in-time snapshot with no stable id, so replace wholesale."""
    conn.execute("DELETE FROM affordable_buildings")
    conn.executemany(
        """
        INSERT INTO affordable_buildings (
            building_name, address, neighborhood, phone, website,
            total_units, total_mfte_units, total_iz_units, total_mha_units,
            total_affordable_units, expiration_date, micro_ami, studio_ami,
            one_br_ami, two_br_ami, three_br_ami, amis, br_types,
            has_mfte, has_iz, has_mha, lat, long, property_id, last_fetched_at
        ) VALUES (
            :building_name, :address, :neighborhood, :phone, :website,
            :total_units, :total_mfte_units, :total_iz_units, :total_mha_units,
            :total_affordable_units, :expiration_date, :micro_ami, :studio_ami,
            :one_br_ami, :two_br_ami, :three_br_ami, :amis, :br_types,
            :has_mfte, :has_iz, :has_mha, :lat, :long, :property_id, :last_fetched_at
        )
        """,
        [
            {
                "building_name": p.building_name,
                "address": p.address,
                "neighborhood": p.neighborhood,
                "phone": p.phone,
                "website": p.website,
                "total_units": p.total_units,
                "total_mfte_units": p.total_mfte_units,
                "total_iz_units": p.total_iz_units,
                "total_mha_units": p.total_mha_units,
                "total_affordable_units": p.total_affordable_units,
                "expiration_date": p.expiration_date,
                "micro_ami": p.micro_ami,
                "studio_ami": p.studio_ami,
                "one_br_ami": p.one_br_ami,
                "two_br_ami": p.two_br_ami,
                "three_br_ami": p.three_br_ami,
                "amis": p.amis,
                "br_types": p.br_types,
                "has_mfte": int(p.has_mfte),
                "has_iz": int(p.has_iz),
                "has_mha": int(p.has_mha),
                "lat": p.lat,
                "long": p.long,
                "property_id": p.property_id,
                "last_fetched_at": p.last_fetched_at,
            }
            for p in props
        ],
    )


def replace_unit_qualifications(conn: sqlite3.Connection, quals: list[UnitQualification]) -> None:
    """Recomputed wholesale after each affordable-buildings or rent-limits fetch."""
    conn.execute("DELETE FROM unit_qualifications")
    conn.executemany(
        """
        INSERT INTO unit_qualifications (
            building_id, property_id, building_name, bedroom, program,
            rent_schedule, ami_pct, max_rent,
            income_limit_1, income_limit_2, income_limit_3, income_limit_4,
            computed_at
        ) VALUES (
            :building_id, :property_id, :building_name, :bedroom, :program,
            :rent_schedule, :ami_pct, :max_rent,
            :income_limit_1, :income_limit_2, :income_limit_3, :income_limit_4,
            :computed_at
        )
        """,
        [vars(q) for q in quals],
    )


def replace_affordable_page_info(conn: sqlite3.Connection, rows: list[AffordablePageInfo]) -> None:
    conn.execute("DELETE FROM affordable_page_info")
    conn.executemany(
        """
        INSERT INTO affordable_page_info (
            building_id, property_id, building_name, website, pages_checked,
            mentions_mfte, mentions_mha, mentions_affordable, has_waitlist_mention,
            ami_mentions, info_url, snippet, status, scraped_at
        ) VALUES (
            :building_id, :property_id, :building_name, :website, :pages_checked,
            :mentions_mfte, :mentions_mha, :mentions_affordable, :has_waitlist_mention,
            :ami_mentions, :info_url, :snippet, :status, :scraped_at
        )
        """,
        [
            {**vars(r),
             "mentions_mfte": int(r.mentions_mfte),
             "mentions_mha": int(r.mentions_mha),
             "mentions_affordable": int(r.mentions_affordable),
             "has_waitlist_mention": int(r.has_waitlist_mention)}
            for r in rows
        ],
    )


def upsert_rent_limits(conn: sqlite3.Connection, limits: list[RentLimit]) -> None:
    conn.executemany(
        """
        INSERT INTO rent_limits (
            program, unit_size, ami_pct, max_rent, effective_date, source_url, fetched_at
        ) VALUES (
            :program, :unit_size, :ami_pct, :max_rent, :effective_date, :source_url, :fetched_at
        )
        ON CONFLICT(program, unit_size, ami_pct) DO UPDATE SET
            max_rent=excluded.max_rent,
            effective_date=excluded.effective_date,
            source_url=excluded.source_url,
            fetched_at=excluded.fetched_at
        """,
        [vars(l) for l in limits],
    )


def upsert_income_limits(conn: sqlite3.Connection, limits: list[IncomeLimit]) -> None:
    conn.executemany(
        """
        INSERT INTO income_limits (
            program, family_size, ami_pct, max_income, effective_date, source_url, fetched_at
        ) VALUES (
            :program, :family_size, :ami_pct, :max_income, :effective_date, :source_url, :fetched_at
        )
        ON CONFLICT(program, family_size, ami_pct) DO UPDATE SET
            max_income=excluded.max_income,
            effective_date=excluded.effective_date,
            source_url=excluded.source_url,
            fetched_at=excluded.fetched_at
        """,
        [vars(l) for l in limits],
    )


def get_all_properties(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM properties ORDER BY id").fetchall()


def get_properties_needing_discovery(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM properties WHERE (website IS NULL OR website = '') "
        "AND website_status IS NULL ORDER BY id"
    ).fetchall()


def get_properties_to_scrape(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT * FROM properties
        WHERE website_status != 'unreachable'
          AND (website IS NOT NULL AND website != '')
          OR (website_discovered IS NOT NULL AND website_discovered != '')
        ORDER BY id
        """
    ).fetchall()
