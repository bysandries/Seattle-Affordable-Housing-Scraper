import os
import tempfile
import unittest

import db
from models import UnitListing


def listing(
    property_id: int,
    listing_url: str,
    scraped_at: str,
    rent: int = 1500,
    source_url: str = "https://manager.appfolio.com/listings/",
) -> UnitListing:
    return UnitListing(
        property_id=property_id,
        unit_type="1br",
        sqft=600,
        rent_min=rent,
        rent_max=rent,
        available_count=1,
        available_from="Now",
        property_description=None,
        amenities=None,
        source_url=source_url,
        listing_url=listing_url,
        scraped_at=scraped_at,
        availability_status="now",
    )


class ArchivedListingsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = db.DB_PATH
        db.DB_PATH = os.path.join(self.temp_dir.name, "housing.db")
        db.init_db()
        self.conn = db.get_connection()
        self.conn.execute(
            """
            INSERT INTO properties (
                id, building_name, address, neighborhood, city, state, county,
                data_source, lat, long
            ) VALUES (1, 'Example Court', '100 Main St', 'Downtown', 'Seattle',
                      'WA', 'King', 'appfolio', 47.6, -122.3)
            """
        )

    def tearDown(self) -> None:
        self.conn.close()
        db.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_refresh_keeps_same_listing_out_of_archive(self) -> None:
        db.insert_units_snapshot(
            self.conn,
            1,
            [listing(1, "https://example.test/unit/1", "2026-09-01T00:00:00+00:00")],
            source="appfolio-statewide",
        )
        db.insert_units_snapshot(
            self.conn,
            1,
            [listing(1, "https://example.test/unit/1", "2026-09-10T00:00:00+00:00", 1600)],
            source="appfolio-statewide",
        )

        archived = self.conn.execute("SELECT COUNT(*) FROM archived_listings").fetchone()[0]
        current = self.conn.execute("SELECT COUNT(*) FROM units WHERE is_current = 1").fetchone()[0]
        self.assertEqual(archived, 0)
        self.assertEqual(current, 1)

    def test_removed_listing_is_archived_with_price_and_location(self) -> None:
        db.insert_units_snapshot(
            self.conn,
            1,
            [listing(1, "https://example.test/unit/1", "2026-09-01T00:00:00+00:00")],
            source="appfolio-statewide",
        )
        db.insert_units_snapshot(
            self.conn,
            1,
            [listing(1, "https://example.test/unit/2", "2026-09-10T00:00:00+00:00", 1700)],
            source="appfolio-statewide",
        )

        row = self.conn.execute("SELECT * FROM archived_listings").fetchone()
        self.assertEqual(row["building_name"], "Example Court")
        self.assertEqual(row["city"], "Seattle")
        self.assertEqual(row["rent_min"], 1500)
        self.assertEqual(row["archive_reason"], "no_longer_listed")

    def test_property_removal_keeps_denormalized_archive(self) -> None:
        db.insert_units_snapshot(
            self.conn,
            1,
            [listing(1, "https://example.test/unit/1", "2026-09-01T00:00:00+00:00")],
            source="appfolio-statewide",
        )
        db.insert_units_snapshot(
            self.conn,
            1,
            [listing(1, "https://example.test/unit/1", "2026-09-05T00:00:00+00:00", 1600)],
            source="appfolio-statewide",
        )
        db.replace_appfolio_properties(
            self.conn,
            [],
            archived_at="2026-09-10T00:00:00+00:00",
            source_urls=["https://manager.appfolio.com/listings/"],
        )

        self.assertIsNone(self.conn.execute("SELECT id FROM properties WHERE id = 1").fetchone())
        rows = self.conn.execute(
            "SELECT * FROM archived_listings ORDER BY last_seen_at"
        ).fetchall()
        self.assertEqual(len(rows), 2)
        row = rows[-1]
        self.assertEqual(row["address"], "100 Main St")
        self.assertEqual(row["rent_min"], 1600)
        self.assertEqual(row["archive_reason"], "property_no_longer_listed")

    def test_failed_portal_scope_is_not_demoted(self) -> None:
        db.insert_units_snapshot(
            self.conn,
            1,
            [listing(1, "https://example.test/unit/1", "2026-09-01T00:00:00+00:00")],
            source="appfolio-statewide",
        )
        demoted = db.demote_stale_units(
            self.conn,
            "appfolio-statewide",
            "2026-09-10T00:00:00+00:00",
            source_urls=["https://different-manager.appfolio.com/listings/"],
        )

        self.assertEqual(demoted, 0)
        self.assertEqual(
            self.conn.execute("SELECT is_current FROM units").fetchone()["is_current"],
            1,
        )


if __name__ == "__main__":
    unittest.main()
