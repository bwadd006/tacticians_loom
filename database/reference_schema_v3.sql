PRAGMA foreign_keys = ON;
PRAGMA user_version = 3;

CREATE TABLE captures (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  source_role TEXT NOT NULL CHECK(source_role IN ('preferred','legacy','supplemental'))
) STRICT;

CREATE TABLE source_documents (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL REFERENCES captures(id),
  source_url TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  media_type TEXT NOT NULL,
  body TEXT,
  relative_path TEXT,
  CHECK(body IS NULL AND relative_path IS NULL)
) STRICT;

CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  identity_state TEXT NOT NULL CHECK(identity_state IN ('identified','name_only','unresolved')),
  namespace TEXT NOT NULL,
  retired INTEGER NOT NULL DEFAULT 0 CHECK(retired IN (0,1))
) STRICT;

CREATE TABLE entity_aliases (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  alias TEXT NOT NULL,
  alias_kind TEXT NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('source','legacy_label','registry')),
  document_id TEXT REFERENCES source_documents(id),
  source_pointer TEXT,
  UNIQUE(entity_id,alias,alias_kind,origin)
) STRICT;

CREATE TABLE source_bindings (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES source_documents(id),
  pointer TEXT NOT NULL,
  entity_id TEXT REFERENCES entities(id),
  resolution TEXT NOT NULL CHECK(resolution IN ('mapped','ambiguous','unresolved','not_entity')),
  external_key TEXT,
  rationale TEXT NOT NULL,
  UNIQUE(document_id,pointer)
) STRICT;

CREATE TABLE routes (
  id TEXT PRIMARY KEY CHECK(id IN ('cai','dietrich','theodora','leda')),
  display_name TEXT NOT NULL
) STRICT;

CREATE TABLE stats (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  display_order INTEGER NOT NULL UNIQUE
) STRICT;

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  display_order INTEGER NOT NULL UNIQUE
) STRICT;

CREATE TABLE grades (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  ordering INTEGER UNIQUE,
  meaning_state TEXT NOT NULL
) STRICT;

CREATE TABLE contexts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  route_scope TEXT NOT NULL CHECK(route_scope IN ('listed','all','unknown','not_applicable')),
  part INTEGER CHECK(part IS NULL OR part>0),
  part_state TEXT NOT NULL CHECK(part_state IN ('specified','unknown','not_applicable')),
  chapter_low INTEGER,
  chapter_high INTEGER,
  section_text TEXT,
  difficulty_text TEXT,
  condition_root_id TEXT REFERENCES conditions(id),
  CHECK((part_state='specified')=(part IS NOT NULL))
) STRICT;

CREATE TABLE context_routes (
  context_id TEXT NOT NULL REFERENCES contexts(id),
  route_id TEXT NOT NULL REFERENCES routes(id),
  PRIMARY KEY(context_id,route_id)
) STRICT;

CREATE TABLE records (
  id TEXT PRIMARY KEY,
  record_kind TEXT NOT NULL,
  entity_id TEXT REFERENCES entities(id),
  context_id TEXT REFERENCES contexts(id),
  body_json TEXT NOT NULL CHECK(json_valid(body_json))
) STRICT;

CREATE TABLE source_claims (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES records(id),
  field_path TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES source_documents(id),
  source_pointer TEXT NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('preferred_source','legacy','supplemental')),
  evidence_state TEXT NOT NULL CHECK(evidence_state IN ('reported','confirmed','conflicting','unknown')),
  value_state TEXT NOT NULL CHECK(value_state IN ('value','source_null','source_missing','unresolved','not_applicable')),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  semantic_role TEXT NOT NULL,
  context_id TEXT REFERENCES contexts(id),
  UNIQUE(record_id,field_path,id)
) STRICT;

CREATE TABLE claim_evidence (
  claim_id TEXT NOT NULL REFERENCES source_claims(id),
  evidence_document_id TEXT NOT NULL REFERENCES source_documents(id),
  pointer_or_span TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY(claim_id,evidence_document_id,pointer_or_span)
) STRICT;

CREATE TABLE field_selections (
  record_id TEXT NOT NULL REFERENCES records(id),
  field_path TEXT NOT NULL,
  claim_id TEXT,
  selection_state TEXT NOT NULL CHECK(selection_state IN ('value','source_null','source_missing','unresolved','conflicting','not_applicable')),
  reason TEXT NOT NULL,
  PRIMARY KEY(record_id,field_path),
  FOREIGN KEY(record_id,field_path,claim_id) REFERENCES source_claims(record_id,field_path,id),
  CHECK((selection_state IN ('value','source_null'))=(claim_id IS NOT NULL))
) STRICT;

CREATE TABLE coverage (
  record_id TEXT NOT NULL REFERENCES records(id),
  field_path TEXT NOT NULL,
  capture_state TEXT NOT NULL,
  semantic_state TEXT NOT NULL,
  canonical_state TEXT NOT NULL,
  import_state TEXT NOT NULL,
  reason TEXT,
  PRIMARY KEY(record_id,field_path)
) STRICT;

CREATE TABLE source_mentions (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES records(id),
  field_path TEXT NOT NULL,
  source_label TEXT NOT NULL,
  target_entity_id TEXT REFERENCES entities(id),
  target_kind TEXT,
  resolution TEXT NOT NULL,
  context_json TEXT NOT NULL CHECK(json_valid(context_json))
) STRICT;

CREATE TABLE conditions (
  id TEXT PRIMARY KEY,
  node_kind TEXT NOT NULL CHECK(node_kind IN ('all','any','not','leaf','unspecified')),
  predicate TEXT,
  subject_id TEXT REFERENCES entities(id),
  object_id TEXT REFERENCES entities(id),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  claim_id TEXT REFERENCES source_claims(id)
) STRICT;

CREATE TABLE condition_children (
  parent_id TEXT NOT NULL REFERENCES conditions(id),
  child_id TEXT NOT NULL REFERENCES conditions(id),
  display_order INTEGER NOT NULL,
  PRIMARY KEY(parent_id,child_id),
  UNIQUE(parent_id,display_order),
  CHECK(parent_id<>child_id)
) STRICT;

CREATE TABLE record_conditions (
  record_id TEXT NOT NULL REFERENCES records(id),
  condition_id TEXT NOT NULL REFERENCES conditions(id),
  role TEXT NOT NULL,
  PRIMARY KEY(record_id,condition_id,role)
) STRICT;

CREATE TABLE annotations (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  subject_id TEXT REFERENCES entities(id),
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  source_order INTEGER
) STRICT;

CREATE TABLE people (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  subject_context TEXT NOT NULL
) STRICT;

CREATE TABLE characters (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  person_id TEXT NOT NULL UNIQUE REFERENCES people(id),
  roster_membership_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE character_identity (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  faction_text TEXT,
  epithet_text TEXT,
  gender_text TEXT,
  unique_class_id TEXT REFERENCES classes(id),
  bloodmark_text TEXT
) STRICT;

CREATE TABLE class_tiers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  display_order INTEGER NOT NULL UNIQUE
) STRICT;

CREATE TABLE classes (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  tier_id TEXT REFERENCES class_tiers(id),
  identity_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE class_profiles (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  movement_value REAL,
  movement_types_json TEXT NOT NULL CHECK(json_valid(movement_types_json)),
  mount_species_id TEXT REFERENCES entities(id),
  examples_text TEXT
) STRICT;

CREATE TABLE stat_profiles (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  owner_id TEXT NOT NULL REFERENCES entities(id),
  role TEXT NOT NULL,
  level_low INTEGER,
  level_high INTEGER,
  level_text TEXT,
  class_id TEXT REFERENCES classes(id),
  modifier_source_id TEXT REFERENCES entities(id),
  interpretation_state TEXT NOT NULL
) STRICT;

CREATE TABLE stat_values (
  profile_id TEXT NOT NULL REFERENCES stat_profiles(record_id),
  stat_id TEXT NOT NULL REFERENCES stats(id),
  number_value REAL,
  unit TEXT NOT NULL,
  expression_text TEXT,
  value_state TEXT NOT NULL,
  PRIMARY KEY(profile_id,stat_id)
) STRICT;

CREATE TABLE initial_skills (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  skill_id TEXT NOT NULL REFERENCES skills(id),
  grade_id TEXT REFERENCES grades(id),
  grade_state TEXT NOT NULL,
  affinity TEXT,
  affinity_state TEXT NOT NULL,
  UNIQUE(character_id,skill_id)
) STRICT;

CREATE TABLE starting_states (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  level_value INTEGER,
  class_id TEXT REFERENCES classes(id),
  class_state TEXT NOT NULL,
  observation_profile_id TEXT REFERENCES stat_profiles(record_id),
  source_context_json TEXT NOT NULL CHECK(json_valid(source_context_json))
) STRICT;

CREATE TABLE loadout_entries (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  starting_state_id TEXT NOT NULL REFERENCES starting_states(record_id),
  target_id TEXT REFERENCES entities(id),
  label TEXT NOT NULL,
  role TEXT NOT NULL,
  quantity_value REAL,
  quantity_json TEXT NOT NULL CHECK(json_valid(quantity_json)),
  resolution TEXT NOT NULL,
  source_order INTEGER
) STRICT;

CREATE TABLE actions (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  action_kind TEXT NOT NULL CHECK(action_kind IN ('ability','combat_art','spell','blaze_art','blaze_ability','gambit')),
  skill_id TEXT REFERENCES skills(id),
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE action_profiles (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  action_id TEXT NOT NULL REFERENCES actions(id),
  effect_text TEXT,
  damage_type TEXT,
  equipment_restriction_text TEXT,
  upgrade_text TEXT,
  parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json))
) STRICT;

CREATE TABLE action_parameters (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  action_id TEXT NOT NULL REFERENCES actions(id),
  parameter_key TEXT NOT NULL,
  quantity_json TEXT NOT NULL CHECK(json_valid(quantity_json)),
  numeric_value REAL,
  unit TEXT,
  variant_id TEXT REFERENCES entities(id)
) STRICT;

CREATE TABLE action_relations (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  from_id TEXT NOT NULL REFERENCES actions(id),
  to_id TEXT NOT NULL REFERENCES actions(id),
  relation TEXT NOT NULL,
  condition_id TEXT REFERENCES conditions(id)
) STRICT;

CREATE TABLE learning_rules (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  scope TEXT NOT NULL,
  source_roster_capture_id TEXT REFERENCES captures(id),
  skill_id TEXT REFERENCES skills(id),
  rule_completeness TEXT NOT NULL
) STRICT;

CREATE TABLE learning_awards (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  rule_id TEXT REFERENCES learning_rules(record_id),
  character_id TEXT REFERENCES characters(id),
  acquired_entity_id TEXT REFERENCES entities(id),
  acquired_label TEXT NOT NULL,
  skill_id TEXT REFERENCES skills(id),
  grade_id TEXT REFERENCES grades(id),
  acquisition_kind TEXT NOT NULL,
  level_value INTEGER,
  active_at_start INTEGER CHECK(active_at_start IN (0,1)),
  condition_id TEXT REFERENCES conditions(id),
  applicability TEXT NOT NULL
) STRICT;

CREATE TABLE class_skills (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  skill_id TEXT NOT NULL REFERENCES skills(id),
  training_bonus REAL,
  listing_state TEXT NOT NULL,
  access_state TEXT NOT NULL,
  access_evidence TEXT NOT NULL,
  access_claim_id TEXT REFERENCES source_claims(id),
  UNIQUE(class_id,skill_id)
) STRICT;

CREATE TABLE class_certifications (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  license_id TEXT REFERENCES entities(id),
  license_item_id TEXT REFERENCES items(id),
  listed_level INTEGER,
  listed_renown INTEGER,
  grade_root_id TEXT REFERENCES conditions(id),
  exclusivity_text TEXT,
  restriction_text TEXT,
  completeness TEXT NOT NULL,
  probability_formula_id TEXT REFERENCES records(id)
) STRICT;

CREATE TABLE class_rewards (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  action_id TEXT REFERENCES actions(id),
  label TEXT NOT NULL,
  reward_kind TEXT NOT NULL,
  exp_required INTEGER,
  retention_state TEXT NOT NULL
) STRICT;

CREATE TABLE recruitment_events (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  join_kind TEXT NOT NULL,
  chapter_value INTEGER,
  renown_value INTEGER,
  support_value INTEGER,
  when_text TEXT,
  condition_id TEXT REFERENCES conditions(id),
  event_scope_state TEXT NOT NULL
) STRICT;

CREATE TABLE activities (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  activity_kind TEXT NOT NULL,
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE paralogues (
  id TEXT PRIMARY KEY REFERENCES activities(id),
  associated_person_id TEXT REFERENCES people(id),
  source_label TEXT NOT NULL,
  source_title TEXT,
  title_state TEXT NOT NULL
) STRICT;

CREATE TABLE activity_availability (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  activity_id TEXT NOT NULL REFERENCES activities(id),
  availability_state TEXT NOT NULL,
  condition_id TEXT REFERENCES conditions(id)
) STRICT;

CREATE TABLE time_assertions (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  owner_record_id TEXT NOT NULL REFERENCES records(id),
  timing_role TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  start_month INTEGER CHECK(start_month BETWEEN 1 AND 12),
  start_day INTEGER CHECK(start_day BETWEEN 1 AND 31),
  end_month INTEGER CHECK(end_month BETWEEN 1 AND 12),
  end_day INTEGER CHECK(end_day BETWEEN 1 AND 31),
  time_text TEXT,
  deadline_turns INTEGER,
  timing_text TEXT NOT NULL,
  semantics_state TEXT NOT NULL,
  source_order INTEGER
) STRICT;

CREATE TABLE activity_outcomes (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  activity_id TEXT NOT NULL REFERENCES activities(id),
  target_id TEXT REFERENCES entities(id),
  outcome_kind TEXT NOT NULL,
  label TEXT NOT NULL,
  quantity_json TEXT NOT NULL CHECK(json_valid(quantity_json)),
  condition_id TEXT REFERENCES conditions(id)
) STRICT;

CREATE TABLE support_pairs (
  id TEXT PRIMARY KEY,
  person_low_id TEXT NOT NULL REFERENCES people(id),
  person_high_id TEXT NOT NULL REFERENCES people(id),
  CHECK(person_low_id<person_high_id),
  UNIQUE(person_low_id,person_high_id)
) STRICT;

CREATE TABLE support_variants (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  pair_id TEXT NOT NULL REFERENCES support_pairs(id),
  conversation_rank TEXT NOT NULL,
  variant_label TEXT,
  condition_id TEXT REFERENCES conditions(id),
  condition_text TEXT,
  numeric_support_threshold INTEGER
) STRICT;

CREATE TABLE support_directional_claims (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  pair_id TEXT NOT NULL REFERENCES support_pairs(id),
  from_person_id TEXT NOT NULL REFERENCES people(id),
  to_person_id TEXT NOT NULL REFERENCES people(id),
  conversation_rank TEXT NOT NULL,
  text TEXT NOT NULL,
  variant_id TEXT REFERENCES support_variants(record_id),
  reconciliation_state TEXT NOT NULL
) STRICT;

CREATE TABLE bird_prompts (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  prompt_text TEXT NOT NULL,
  source_order INTEGER
) STRICT;

CREATE TABLE bird_responses (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  response_text TEXT NOT NULL
) STRICT;

CREATE TABLE bird_answers (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  prompt_id TEXT NOT NULL REFERENCES bird_prompts(record_id),
  response_id TEXT NOT NULL REFERENCES bird_responses(id)
) STRICT;

CREATE TABLE social_subjects (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  subject_kind TEXT NOT NULL
) STRICT;

CREATE TABLE preferences (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  character_id TEXT NOT NULL REFERENCES characters(id),
  subject_id TEXT REFERENCES entities(id),
  subject_label TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  tier TEXT NOT NULL,
  resolution TEXT NOT NULL,
  source_order INTEGER
) STRICT;

CREATE TABLE crests (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE crest_profiles (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  crest_id TEXT NOT NULL REFERENCES crests(id),
  effect_text TEXT,
  trigger_json TEXT NOT NULL CHECK(json_valid(trigger_json))
) STRICT;

CREATE TABLE crest_associations (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  person_id TEXT NOT NULL REFERENCES people(id),
  crest_id TEXT REFERENCES crests(id),
  crest_label TEXT NOT NULL,
  dragon_label TEXT,
  effect_text TEXT
) STRICT;

CREATE TABLE blaze_types (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE blaze_type_profiles (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  blaze_type_id TEXT NOT NULL REFERENCES blaze_types(id),
  description_text TEXT
) STRICT;

CREATE TABLE blaze_associations (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  character_id TEXT REFERENCES characters(id),
  person_id TEXT REFERENCES people(id),
  action_id TEXT REFERENCES actions(id),
  blaze_type_id TEXT REFERENCES blaze_types(id),
  acquisition_text TEXT,
  role TEXT NOT NULL
) STRICT;

CREATE TABLE blessings (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  deity_id TEXT REFERENCES people(id),
  deity_label TEXT NOT NULL,
  crest_id TEXT REFERENCES crests(id),
  crest_label TEXT NOT NULL,
  stage INTEGER,
  effect_text TEXT,
  day_text TEXT,
  cost_json TEXT NOT NULL CHECK(json_valid(cost_json))
) STRICT;

CREATE TABLE formulae (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  name TEXT NOT NULL,
  expression_text TEXT NOT NULL,
  expression_language TEXT NOT NULL,
  executable INTEGER NOT NULL DEFAULT 0 CHECK(executable=0)
) STRICT;

CREATE TABLE items (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  item_kind TEXT NOT NULL,
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE item_profiles (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  category_text TEXT,
  rarity_text TEXT,
  flavor_text TEXT,
  description_text TEXT,
  effect_text TEXT,
  use_text TEXT,
  rank_id TEXT REFERENCES grades(id),
  usage_scope TEXT NOT NULL,
  parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json))
) STRICT;

CREATE TABLE item_requirements (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  skill_id TEXT REFERENCES skills(id),
  grade_id TEXT REFERENCES grades(id),
  condition_id TEXT REFERENCES conditions(id),
  semantics_state TEXT NOT NULL
) STRICT;

CREATE TABLE item_action_links (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  action_id TEXT REFERENCES actions(id),
  action_label TEXT NOT NULL,
  link_kind TEXT NOT NULL,
  resolution TEXT NOT NULL
) STRICT;

CREATE TABLE item_variants (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  base_item_id TEXT NOT NULL REFERENCES items(id),
  refinement_level INTEGER,
  changes_json TEXT NOT NULL CHECK(json_valid(changes_json))
) STRICT;

CREATE TABLE recipes (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  output_id TEXT REFERENCES entities(id),
  recipe_kind TEXT NOT NULL,
  output_label TEXT NOT NULL,
  output_quantity_json TEXT NOT NULL CHECK(json_valid(output_quantity_json)),
  cost_text TEXT,
  condition_id TEXT REFERENCES conditions(id)
) STRICT;

CREATE TABLE recipe_inputs (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  recipe_id TEXT NOT NULL REFERENCES recipes(record_id),
  target_id TEXT REFERENCES entities(id),
  label TEXT NOT NULL,
  quantity_json TEXT NOT NULL CHECK(json_valid(quantity_json)),
  condition_id TEXT REFERENCES conditions(id),
  source_order INTEGER
) STRICT;

CREATE TABLE acquisition_sources (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  target_id TEXT REFERENCES entities(id),
  label TEXT NOT NULL,
  acquisition_kind TEXT NOT NULL,
  location_id TEXT REFERENCES locations(id),
  activity_id TEXT REFERENCES activities(id),
  source_summary TEXT,
  source_detail TEXT,
  condition_id TEXT REFERENCES conditions(id),
  probability_value REAL CHECK(probability_value BETWEEN 0 AND 1),
  probability_state TEXT NOT NULL
) STRICT;

CREATE TABLE containers (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  container_kind TEXT NOT NULL,
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE container_contents (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  container_id TEXT NOT NULL REFERENCES containers(id),
  target_id TEXT REFERENCES entities(id),
  label TEXT NOT NULL,
  quantity_json TEXT NOT NULL CHECK(json_valid(quantity_json)),
  probability_value REAL CHECK(probability_value BETWEEN 0 AND 1),
  probability_state TEXT NOT NULL,
  source_order INTEGER
) STRICT;

CREATE TABLE mounts (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  species_id TEXT REFERENCES entities(id),
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE mount_profiles (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  mount_id TEXT NOT NULL REFERENCES mounts(id),
  food_category TEXT,
  taste_text TEXT,
  acquisition_text TEXT
) STRICT;

CREATE TABLE progression_steps (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  owner_id TEXT NOT NULL REFERENCES entities(id),
  level_low INTEGER,
  level_high INTEGER,
  level_text TEXT,
  action_id TEXT REFERENCES actions(id),
  stat_profile_id TEXT REFERENCES stat_profiles(record_id),
  reward_text TEXT
) STRICT;

CREATE TABLE battalions (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE battalion_profiles (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  battalion_id TEXT NOT NULL REFERENCES battalions(id),
  grade_id TEXT REFERENCES grades(id),
  category_text TEXT,
  limit_base INTEGER,
  limit_upgraded INTEGER,
  gambit_id TEXT REFERENCES actions(id),
  gambit_label TEXT,
  stat_profile_id TEXT REFERENCES stat_profiles(record_id)
) STRICT;

CREATE TABLE regions (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE locations (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  region_id TEXT REFERENCES regions(id),
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE location_profiles (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  description_text TEXT,
  discovery_text TEXT
) STRICT;

CREATE TABLE location_contexts (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  listed_state TEXT NOT NULL,
  display_name TEXT,
  description_text TEXT,
  recommended_level_text TEXT
) STRICT;

CREATE TABLE location_contents (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  location_context_id TEXT REFERENCES location_contexts(record_id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  target_id TEXT REFERENCES entities(id),
  label TEXT NOT NULL,
  content_role TEXT NOT NULL,
  quantity_json TEXT NOT NULL CHECK(json_valid(quantity_json)),
  condition_id TEXT REFERENCES conditions(id),
  source_order INTEGER
) STRICT;

CREATE TABLE shops (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  profile_record_id TEXT NOT NULL UNIQUE REFERENCES records(id)
) STRICT;

CREATE TABLE inventory_layers (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  shop_id TEXT NOT NULL REFERENCES shops(id),
  parent_layer_id TEXT REFERENCES inventory_layers(record_id),
  collection_state TEXT NOT NULL,
  inheritance_mode TEXT NOT NULL,
  note_text TEXT
) STRICT;

CREATE TABLE shop_offers (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  layer_id TEXT NOT NULL REFERENCES inventory_layers(record_id),
  target_id TEXT REFERENCES entities(id),
  label TEXT NOT NULL,
  stock_json TEXT NOT NULL CHECK(json_valid(stock_json)),
  price_json TEXT NOT NULL CHECK(json_valid(price_json)),
  condition_id TEXT REFERENCES conditions(id),
  source_order INTEGER
) STRICT;

CREATE TABLE acquisition_overrides (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  source_key TEXT NOT NULL,
  target_id TEXT REFERENCES entities(id),
  location_id TEXT REFERENCES locations(id),
  context_label TEXT NOT NULL,
  label TEXT,
  suppression_state TEXT NOT NULL
) STRICT;

CREATE TABLE spatial_references (
  id TEXT PRIMARY KEY,
  coordinate_kind TEXT NOT NULL,
  axis_order TEXT NOT NULL,
  units_x REAL,
  units_y REAL,
  flip_y INTEGER CHECK(flip_y IN (0,1)),
  width_px INTEGER,
  height_px INTEGER,
  transform_json TEXT NOT NULL CHECK(json_valid(transform_json))
) STRICT;

CREATE TABLE map_surfaces (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  spatial_reference_id TEXT NOT NULL REFERENCES spatial_references(id),
  record_id TEXT NOT NULL UNIQUE REFERENCES records(id),
  background_asset_id TEXT REFERENCES asset_resources(id),
  tile_size INTEGER,
  tile_version TEXT
) STRICT;

CREATE TABLE map_tiles (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  surface_id TEXT NOT NULL REFERENCES map_surfaces(id),
  level INTEGER NOT NULL CHECK(level>=0),
  tile_x INTEGER NOT NULL CHECK(tile_x>=0),
  tile_y INTEGER NOT NULL CHECK(tile_y>=0),
  asset_id TEXT REFERENCES asset_resources(id),
  UNIQUE(surface_id,level,tile_x,tile_y)
) STRICT;

CREATE TABLE map_categories (
  id TEXT PRIMARY KEY REFERENCES entities(id),
  group_label TEXT NOT NULL,
  category_label TEXT NOT NULL,
  group_order INTEGER NOT NULL,
  category_order INTEGER NOT NULL
) STRICT;

CREATE TABLE map_markers (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  surface_id TEXT NOT NULL REFERENCES map_surfaces(id),
  location_id TEXT REFERENCES locations(id),
  source_y REAL,
  source_x REAL,
  position_state TEXT NOT NULL
) STRICT;

CREATE TABLE marker_contexts (
  marker_id TEXT NOT NULL REFERENCES map_markers(record_id),
  context_id TEXT NOT NULL REFERENCES contexts(id),
  listed_state TEXT NOT NULL,
  PRIMARY KEY(marker_id,context_id)
) STRICT;

CREATE TABLE marker_categories (
  marker_id TEXT NOT NULL REFERENCES map_markers(record_id),
  context_id TEXT NOT NULL REFERENCES contexts(id),
  category_id TEXT NOT NULL REFERENCES map_categories(id),
  source_order INTEGER NOT NULL,
  PRIMARY KEY(marker_id,context_id,category_id)
) STRICT;

CREATE TABLE map_geometries (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  surface_id TEXT NOT NULL REFERENCES map_surfaces(id),
  region_id TEXT REFERENCES regions(id),
  geometry_kind TEXT NOT NULL,
  geometry_state TEXT NOT NULL,
  geometry_json TEXT NOT NULL CHECK(json_valid(geometry_json))
) STRICT;

CREATE TABLE asset_resources (
  id TEXT PRIMARY KEY,
  sha256 TEXT UNIQUE,
  relative_path TEXT,
  format TEXT,
  width_px INTEGER CHECK(width_px>0),
  height_px INTEGER CHECK(height_px>0),
  byte_count INTEGER CHECK(byte_count>0),
  file_state TEXT NOT NULL CHECK(file_state IN ('captured','source_missing','not_captured','inaccessible','unknown')),
  attribution TEXT NOT NULL,
  authentic_rip_state TEXT NOT NULL,
  derived_state TEXT NOT NULL,
  CHECK(file_state<>'captured' OR (sha256 IS NOT NULL AND relative_path IS NOT NULL))
) STRICT;

CREATE TABLE asset_sources (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES asset_resources(id),
  document_id TEXT REFERENCES source_documents(id),
  source_url TEXT NOT NULL,
  retrieved_at TEXT,
  http_status INTEGER,
  acquisition_state TEXT NOT NULL
) STRICT;

CREATE TABLE asset_bindings (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  resource_id TEXT NOT NULL REFERENCES asset_resources(id),
  subject_entity_id TEXT REFERENCES entities(id),
  subject_record_id TEXT REFERENCES records(id),
  role TEXT NOT NULL,
  variant_json TEXT NOT NULL CHECK(json_valid(variant_json)),
  binding_kind TEXT NOT NULL,
  resolution TEXT NOT NULL
) STRICT;

CREATE TABLE asset_slices (
  record_id TEXT PRIMARY KEY REFERENCES records(id),
  resource_id TEXT NOT NULL REFERENCES asset_resources(id),
  crop_x INTEGER,
  crop_y INTEGER,
  crop_width INTEGER,
  crop_height INTEGER,
  anchor_x REAL,
  anchor_y REAL,
  coordinates_state TEXT NOT NULL
) STRICT;

CREATE TABLE compatibility_projections (
  entity_id TEXT NOT NULL REFERENCES entities(id),
  projection_kind TEXT NOT NULL,
  projection_version INTEGER NOT NULL,
  body_json TEXT NOT NULL CHECK(json_valid(body_json)),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  PRIMARY KEY(entity_id,projection_kind,projection_version)
) STRICT;

CREATE TABLE build_metadata (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK(json_valid(value_json))
) STRICT;

CREATE TRIGGER selected_state_insert BEFORE INSERT ON field_selections
WHEN NEW.claim_id IS NOT NULL AND
 (SELECT value_state FROM source_claims WHERE id=NEW.claim_id)<>NEW.selection_state
BEGIN SELECT RAISE(ABORT,'Selected state must match chosen claim'); END;
CREATE TRIGGER selected_state_update BEFORE UPDATE ON field_selections
WHEN NEW.claim_id IS NOT NULL AND
 (SELECT value_state FROM source_claims WHERE id=NEW.claim_id)<>NEW.selection_state
BEGIN SELECT RAISE(ABORT,'Selected state must match chosen claim'); END;

CREATE TRIGGER consistent_preferred_origin BEFORE INSERT ON source_claims
WHEN NEW.origin='preferred_source' AND
 (SELECT c.source_role FROM source_documents d JOIN captures c ON c.id=d.capture_id WHERE d.id=NEW.document_id)<>'preferred'
BEGIN SELECT RAISE(ABORT,'Preferred claim must cite a preferred capture'); END;

CREATE TRIGGER immutable_claims_update BEFORE UPDATE ON source_claims
BEGIN SELECT RAISE(ABORT,'Claims are immutable; append a new claim'); END;
CREATE TRIGGER immutable_claims_delete BEFORE DELETE ON source_claims
BEGIN SELECT RAISE(ABORT,'Claim history must be retained'); END;

CREATE TRIGGER preferred_selection_insert BEFORE INSERT ON field_selections
WHEN NEW.claim_id IS NOT NULL AND
 (SELECT origin FROM source_claims WHERE id=NEW.claim_id)<>'preferred_source'
BEGIN SELECT RAISE(ABORT,'Legacy/supplemental evidence cannot silently fill preferred baseline'); END;
CREATE TRIGGER preferred_selection_update BEFORE UPDATE ON field_selections
WHEN NEW.claim_id IS NOT NULL AND
 (SELECT origin FROM source_claims WHERE id=NEW.claim_id)<>'preferred_source'
BEGIN SELECT RAISE(ABORT,'Legacy/supplemental evidence cannot silently fill preferred baseline'); END;
CREATE INDEX records_by_owner ON records(entity_id,record_kind,context_id);
CREATE INDEX claims_by_source ON source_claims(document_id,source_pointer);
CREATE INDEX recruitment_by_character ON recruitment_events(character_id,chapter_value);
CREATE INDEX grades_for_learning ON learning_awards(character_id,skill_id,grade_id);
CREATE INDEX preferences_by_character ON preferences(character_id,subject_kind,tier);
CREATE INDEX contents_by_entity ON location_contents(target_id,location_id);
CREATE INDEX markers_by_location ON map_markers(location_id,surface_id);
CREATE INDEX profiles_by_owner_role ON stat_profiles(owner_id,role);
CREATE INDEX action_profiles_by_action ON action_profiles(action_id);
CREATE INDEX class_profiles_by_class ON class_profiles(class_id);
CREATE INDEX class_certifications_by_class ON class_certifications(class_id);
CREATE INDEX class_rewards_by_class ON class_rewards(class_id);
CREATE INDEX mentions_by_record ON source_mentions(record_id,field_path);
