PRAGMA foreign_keys = ON;
PRAGMA user_version = 2;

CREATE TABLE build_metadata (key TEXT PRIMARY KEY, value_json TEXT NOT NULL CHECK(json_valid(value_json))) STRICT;
CREATE TABLE source_documents (
  kind TEXT PRIMARY KEY CHECK(kind IN ('characters', 'classes', 'paralogues')),
  filename TEXT NOT NULL, sha256 TEXT NOT NULL, schema_version TEXT NOT NULL,
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json))
) STRICT;
CREATE TABLE routes (id TEXT PRIMARY KEY, name TEXT NOT NULL, act INTEGER NOT NULL) STRICT;
CREATE TABLE stats (id TEXT PRIMARY KEY, display_order INTEGER NOT NULL UNIQUE) STRICT;
CREATE TABLE skills (id TEXT PRIMARY KEY) STRICT;
CREATE TABLE certification_tiers (id TEXT PRIMARY KEY, raw_json TEXT NOT NULL CHECK(json_valid(raw_json))) STRICT;

CREATE TABLE classes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tier_id TEXT NOT NULL REFERENCES certification_tiers(id),
  playable INTEGER NOT NULL CHECK(playable IN (0,1)),
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json))
) STRICT;
CREATE INDEX classes_by_name ON classes(name COLLATE NOCASE, id);
CREATE TABLE characters (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, availability_category TEXT NOT NULL,
  starting_level INTEGER, starting_class_id TEXT REFERENCES classes(id),
  boons_known INTEGER NOT NULL CHECK(boons_known IN (0,1)),
  banes_known INTEGER NOT NULL CHECK(banes_known IN (0,1)),
  proficiencies_verified INTEGER NOT NULL CHECK(proficiencies_verified IN (0,1)),
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json))
) STRICT;
CREATE INDEX characters_by_name ON characters(name COLLATE NOCASE, id);
CREATE TABLE character_growths (
  character_id TEXT NOT NULL REFERENCES characters(id), stat_id TEXT NOT NULL REFERENCES stats(id),
  personal REAL, effective_personal REAL, PRIMARY KEY(character_id, stat_id)
) STRICT;
CREATE INDEX characters_by_growth ON character_growths(stat_id, personal, character_id);
CREATE TABLE character_affinities (
  character_id TEXT NOT NULL REFERENCES characters(id), skill_id TEXT NOT NULL REFERENCES skills(id),
  affinity TEXT NOT NULL CHECK(affinity IN ('boon','bane')), PRIMARY KEY(character_id, skill_id)
) STRICT;
CREATE INDEX characters_by_affinity ON character_affinities(skill_id, affinity, character_id);
CREATE TABLE recruitment (
  character_id TEXT NOT NULL REFERENCES characters(id), route_id TEXT NOT NULL REFERENCES routes(id),
  status TEXT NOT NULL CHECK(status IN ('recruitable','automatic','mandatory_tutorial','not_available_in_part_1_recruitment_table','unavailable','unknown')),
  earliest_chapter INTEGER, min_renown INTEGER, min_support INTEGER,
  missable INTEGER CHECK(missable IN (0,1)), source TEXT,
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json)), PRIMARY KEY(character_id, route_id)
) STRICT;
CREATE INDEX recruitment_by_route ON recruitment(route_id, status, character_id);
CREATE TABLE recruitment_requirements (
  character_id TEXT NOT NULL, route_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
  type TEXT NOT NULL, raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
  PRIMARY KEY(character_id, route_id, ordinal),
  FOREIGN KEY(character_id, route_id) REFERENCES recruitment(character_id, route_id)
) STRICT;
CREATE TABLE personal_abilities (
  character_id TEXT NOT NULL REFERENCES characters(id), ordinal INTEGER NOT NULL,
  name TEXT NOT NULL, effect TEXT, rank INTEGER NOT NULL, acquisition_type TEXT NOT NULL,
  acquisition_level INTEGER, upgrade_of TEXT, source TEXT NOT NULL,
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json)), PRIMARY KEY(character_id, ordinal)
) STRICT;
CREATE TABLE class_growths (
  class_id TEXT NOT NULL REFERENCES classes(id), stat_id TEXT NOT NULL REFERENCES stats(id),
  modifier REAL, PRIMARY KEY(class_id, stat_id)
) STRICT;
CREATE TABLE class_training (
  class_id TEXT NOT NULL REFERENCES classes(id), skill_id TEXT NOT NULL REFERENCES skills(id),
  exp_bonus REAL NOT NULL, PRIMARY KEY(class_id, skill_id)
) STRICT;
CREATE TABLE class_movement_tags (class_id TEXT NOT NULL REFERENCES classes(id), tag TEXT NOT NULL, PRIMARY KEY(class_id, tag)) STRICT;
CREATE TABLE class_active_abilities (
  class_id TEXT NOT NULL REFERENCES classes(id), ordinal INTEGER NOT NULL,
  name TEXT NOT NULL, effect TEXT, raw_json TEXT NOT NULL CHECK(json_valid(raw_json)), PRIMARY KEY(class_id, ordinal)
) STRICT;
CREATE TABLE class_mastery (
  class_id TEXT PRIMARY KEY REFERENCES classes(id), ability_name TEXT, effect TEXT, class_exp_required INTEGER,
  retained_on_reclass INTEGER CHECK(retained_on_reclass IN (0,1)), raw_json TEXT NOT NULL CHECK(json_valid(raw_json))
) STRICT;
CREATE TABLE class_certification (
  class_id TEXT PRIMARY KEY REFERENCES classes(id), tier_rule_id TEXT NOT NULL REFERENCES certification_tiers(id),
  exact_minimum_level INTEGER, rule_complete INTEGER NOT NULL CHECK(rule_complete IN (0,1)),
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json))
) STRICT;
CREATE TABLE class_recommended_grades (
  class_id TEXT NOT NULL REFERENCES classes(id), skill_id TEXT NOT NULL REFERENCES skills(id), grade TEXT NOT NULL,
  PRIMARY KEY(class_id, skill_id)
) STRICT;
CREATE TABLE route_unlocks (
  id TEXT PRIMARY KEY, route_id TEXT REFERENCES routes(id), act INTEGER, earliest_chapter INTEGER,
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json))
) STRICT;
CREATE TABLE class_unlocks (
  class_id TEXT NOT NULL REFERENCES classes(id), unlock_id TEXT NOT NULL REFERENCES route_unlocks(id),
  PRIMARY KEY(class_id, unlock_id)
) STRICT;
CREATE TABLE paralogues (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  associated_character_name TEXT NOT NULL,
  associated_character_id TEXT REFERENCES characters(id),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('confirmed','reported','conflicting','unknown')),
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json))
) STRICT;
CREATE INDEX paralogues_by_name ON paralogues(name COLLATE NOCASE, id);
CREATE INDEX paralogues_by_character ON paralogues(associated_character_id, name COLLATE NOCASE);
CREATE TABLE paralogue_availability (
  paralogue_id TEXT NOT NULL REFERENCES paralogues(id), route_id TEXT NOT NULL REFERENCES routes(id),
  status TEXT NOT NULL CHECK(status IN ('available','unavailable','unknown')),
  earliest_chapter INTEGER,
  listed_deadline_month INTEGER, listed_deadline_day INTEGER,
  effective_deadline_month INTEGER, effective_deadline_day INTEGER,
  forced_start_month INTEGER, forced_start_day INTEGER,
  missable INTEGER CHECK(missable IN (0,1)),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('confirmed','reported','conflicting','unknown')),
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
  PRIMARY KEY(paralogue_id, route_id)
) STRICT;
CREATE INDEX paralogue_availability_by_route ON paralogue_availability(route_id, status, earliest_chapter, effective_deadline_month, effective_deadline_day, paralogue_id);
CREATE TABLE paralogue_acceptance_windows (
  paralogue_id TEXT NOT NULL, route_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
  start_month INTEGER, start_day INTEGER, end_month INTEGER, end_day INTEGER,
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
  PRIMARY KEY(paralogue_id, route_id, ordinal),
  FOREIGN KEY(paralogue_id, route_id) REFERENCES paralogue_availability(paralogue_id, route_id)
) STRICT;
CREATE TABLE paralogue_requirements (
  paralogue_id TEXT NOT NULL REFERENCES paralogues(id), ordinal INTEGER NOT NULL,
  type TEXT NOT NULL, character_id TEXT REFERENCES characters(id),
  prerequisite_paralogue_id TEXT REFERENCES paralogues(id),
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
  PRIMARY KEY(paralogue_id, ordinal)
) STRICT;
CREATE TABLE paralogue_requirement_routes (
  paralogue_id TEXT NOT NULL, requirement_ordinal INTEGER NOT NULL, route_id TEXT NOT NULL REFERENCES routes(id),
  PRIMARY KEY(paralogue_id, requirement_ordinal, route_id),
  FOREIGN KEY(paralogue_id, requirement_ordinal) REFERENCES paralogue_requirements(paralogue_id, ordinal)
) STRICT;
CREATE TABLE paralogue_outcomes (
  paralogue_id TEXT NOT NULL REFERENCES paralogues(id), ordinal INTEGER NOT NULL,
  type TEXT NOT NULL, character_id TEXT REFERENCES characters(id), class_id TEXT REFERENCES classes(id),
  name TEXT NOT NULL, quantity INTEGER,
  verification_status TEXT NOT NULL CHECK(verification_status IN ('confirmed','reported','conflicting','unknown')),
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
  PRIMARY KEY(paralogue_id, ordinal)
) STRICT;
CREATE TABLE paralogue_outcome_routes (
  paralogue_id TEXT NOT NULL, outcome_ordinal INTEGER NOT NULL, route_id TEXT NOT NULL REFERENCES routes(id),
  PRIMARY KEY(paralogue_id, outcome_ordinal, route_id),
  FOREIGN KEY(paralogue_id, outcome_ordinal) REFERENCES paralogue_outcomes(paralogue_id, ordinal)
) STRICT;
CREATE TABLE source_references (
  document_kind TEXT NOT NULL REFERENCES source_documents(kind), ordinal INTEGER NOT NULL,
  name TEXT NOT NULL, url TEXT NOT NULL, raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
  PRIMARY KEY(document_kind, ordinal)
) STRICT;
CREATE TABLE data_conflicts (
  document_kind TEXT NOT NULL REFERENCES source_documents(kind), ordinal INTEGER NOT NULL,
  character_id TEXT REFERENCES characters(id), class_id TEXT REFERENCES classes(id),
  paralogue_id TEXT REFERENCES paralogues(id),
  field TEXT NOT NULL, status TEXT NOT NULL, raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
  PRIMARY KEY(document_kind, ordinal)
) STRICT;

CREATE VIEW act_1_roster AS
SELECT c.* FROM characters c WHERE EXISTS (
  SELECT 1 FROM recruitment r WHERE r.character_id = c.id
    AND r.status IN ('recruitable', 'automatic', 'mandatory_tutorial')
);
