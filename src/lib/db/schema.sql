-- Normalized "disposition core" for ab-land. One row per agreement-tract.
-- See CLAUDE.md §5. All geometry is stored as WGS84 (EPSG:4326) GeoJSON.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dispositions (
  id                   INTEGER PRIMARY KEY,
  source               TEXT NOT NULL,            -- 'geoview' | 'altalis'
  family               TEXT NOT NULL,            -- png | oil_sands | coal | minerals | brine | geothermal | carbon_seq | pore_space | surface
  source_layer         TEXT,                     -- service/layer the row came from
  agreement_type       TEXT,
  agreement_number     TEXT NOT NULL,
  tract                TEXT,
  status               TEXT,
  holder_desrep        TEXT,                     -- designated representative (primary holder)
  holder_desrep_id     TEXT,
  participants         TEXT,                     -- JSON array of participant names
  holder_norm          TEXT,                     -- normalized holder key for company search
  term_date            TEXT,                     -- ISO-8601
  current_expiry_date  TEXT,
  continuation_date    TEXT,
  cancel_date          TEXT,
  zone_desc            TEXT,
  target_substance     TEXT,                     -- minerals/brine TargetSubstance, or coal CoalCategory
  area_ha              REAL,
  centroid_lon         REAL,
  centroid_lat         REAL,
  bbox_minx            REAL,
  bbox_miny            REAL,
  bbox_maxx            REAL,
  bbox_maxy            REAL,
  geometry_geojson     TEXT,                     -- GeoJSON Polygon/MultiPolygon (WGS84)
  geometry_simplified_geojson TEXT,              -- map-simplified copy (~10 m DP); NULL -> serve geometry_geojson
  ingested_at          TEXT NOT NULL,
  UNIQUE (source, agreement_number, tract)
);

CREATE INDEX IF NOT EXISTS idx_disp_holder_norm ON dispositions (holder_norm);
CREATE INDEX IF NOT EXISTS idx_disp_agreement   ON dispositions (agreement_number);
CREATE INDEX IF NOT EXISTS idx_disp_family      ON dispositions (family);
CREATE INDEX IF NOT EXISTS idx_disp_bbox        ON dispositions (bbox_minx, bbox_miny, bbox_maxx, bbox_maxy);

-- Full-text search over holder + participants + agreement number + substance
-- (external content). target_substance lets users find e.g. "uranium" leases.
CREATE VIRTUAL TABLE IF NOT EXISTS dispositions_fts USING fts5 (
  holder_desrep, participants, agreement_number, target_substance,
  content = 'dispositions', content_rowid = 'id'
);

-- Keep the FTS index in sync with the base table.
CREATE TRIGGER IF NOT EXISTS disp_ai AFTER INSERT ON dispositions BEGIN
  INSERT INTO dispositions_fts (rowid, holder_desrep, participants, agreement_number, target_substance)
  VALUES (new.id, new.holder_desrep, new.participants, new.agreement_number, new.target_substance);
END;

CREATE TRIGGER IF NOT EXISTS disp_ad AFTER DELETE ON dispositions BEGIN
  INSERT INTO dispositions_fts (dispositions_fts, rowid, holder_desrep, participants, agreement_number, target_substance)
  VALUES ('delete', old.id, old.holder_desrep, old.participants, old.agreement_number, old.target_substance);
END;

CREATE TRIGGER IF NOT EXISTS disp_au AFTER UPDATE ON dispositions BEGIN
  INSERT INTO dispositions_fts (dispositions_fts, rowid, holder_desrep, participants, agreement_number, target_substance)
  VALUES ('delete', old.id, old.holder_desrep, old.participants, old.agreement_number, old.target_substance);
  INSERT INTO dispositions_fts (rowid, holder_desrep, participants, agreement_number, target_substance)
  VALUES (new.id, new.holder_desrep, new.participants, new.agreement_number, new.target_substance);
END;

-- Spatial index over parcel bounding boxes, for fast map-viewport queries.
-- Mirrors the FTS trigger trio above so it stays in sync with the base table.
-- The INSERT…SELECT…WHERE (rather than a trigger-level WHEN) is deliberate: the
-- AFTER UPDATE trigger must ALWAYS delete the stale rtree row, but only re-insert
-- when the new bbox is non-null. Upsert keeps the same id, so AFTER UPDATE fires
-- on re-ingest and the index stays correct.
CREATE VIRTUAL TABLE IF NOT EXISTS dispositions_rtree USING rtree(id, minx, maxx, miny, maxy);

CREATE TRIGGER IF NOT EXISTS disp_rtree_ai AFTER INSERT ON dispositions BEGIN
  INSERT INTO dispositions_rtree (id, minx, maxx, miny, maxy)
  SELECT new.id, new.bbox_minx, new.bbox_maxx, new.bbox_miny, new.bbox_maxy WHERE new.bbox_minx IS NOT NULL;
END;

CREATE TRIGGER IF NOT EXISTS disp_rtree_ad AFTER DELETE ON dispositions BEGIN
  DELETE FROM dispositions_rtree WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS disp_rtree_au AFTER UPDATE ON dispositions BEGIN
  DELETE FROM dispositions_rtree WHERE id = old.id;
  INSERT INTO dispositions_rtree (id, minx, maxx, miny, maxy)
  SELECT new.id, new.bbox_minx, new.bbox_maxx, new.bbox_miny, new.bbox_maxy WHERE new.bbox_minx IS NOT NULL;
END;

-- Tracks each ingest run for observability.
CREATE TABLE IF NOT EXISTS ingest_runs (
  id          INTEGER PRIMARY KEY,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  source      TEXT,
  family      TEXT,
  rows_upserted INTEGER DEFAULT 0,
  status      TEXT,                              -- 'ok' | 'error'
  message     TEXT
);
