import sqlite3
from contextlib import contextmanager
from typing import Generator

from config import DB_PATH
from models import Property, UnitListing


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


def init_db() -> None:
    with db_conn() as conn:
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
                property_description TEXT,
                amenities TEXT,
                source_url TEXT,
                scraped_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_units_property_id ON units(property_id);
            CREATE INDEX IF NOT EXISTS idx_units_scraped_at ON units(scraped_at);
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


def insert_units(conn: sqlite3.Connection, listings: list[UnitListing]) -> None:
    conn.executemany(
        """
        INSERT INTO units (
            property_id, unit_type, sqft, rent_min, rent_max,
            available_count, available_from, property_description,
            amenities, source_url, scraped_at
        ) VALUES (
            :property_id, :unit_type, :sqft, :rent_min, :rent_max,
            :available_count, :available_from, :property_description,
            :amenities, :source_url, :scraped_at
        )
        """,
        [
            {
                "property_id": u.property_id,
                "unit_type": u.unit_type,
                "sqft": u.sqft,
                "rent_min": u.rent_min,
                "rent_max": u.rent_max,
                "available_count": u.available_count,
                "available_from": u.available_from,
                "property_description": u.property_description,
                "amenities": u.amenities,
                "source_url": u.source_url,
                "scraped_at": u.scraped_at,
            }
            for u in listings
        ],
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
