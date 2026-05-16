-- Indoor navigation schema: venues, floors, node/edge graph, mapper program.

-- ============================================================
-- Venues
-- ============================================================
CREATE TABLE public.venues (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id         text          REFERENCES public.places(place_id) ON DELETE SET NULL,
  name_mn          text          NOT NULL,
  name_en          text,
  address_mn       text,
  lat              numeric(10,8) NOT NULL,
  lng              numeric(11,8) NOT NULL,
  floor_count      integer       NOT NULL DEFAULT 1 CHECK (floor_count >= 1),
  default_floor    integer       NOT NULL DEFAULT 1,
  -- bounding box used by the app to detect "user entered venue" via GPS
  bbox_sw_lat      numeric(10,8) NOT NULL,
  bbox_sw_lng      numeric(11,8) NOT NULL,
  bbox_ne_lat      numeric(10,8) NOT NULL,
  bbox_ne_lng      numeric(11,8) NOT NULL,
  is_active        boolean       NOT NULL DEFAULT false,
  approved_at      timestamptz,
  approved_by      uuid          REFERENCES auth.users(id),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX venues_geog_idx ON public.venues
  USING gist(st_makepoint(lng, lat));

CREATE TRIGGER venues_set_updated_at
  BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venues_public_read"   ON public.venues FOR SELECT USING (is_active = true);
CREATE POLICY "venues_service_write" ON public.venues FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Floors
-- ============================================================
CREATE TABLE public.floors (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id            uuid          NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  floor_number        integer       NOT NULL,   -- 0 = ground, negative = basement
  name_mn             text          NOT NULL,   -- "1-р давхар"
  name_en             text,
  -- SVG floor plan hosted in Supabase Storage (HTTPS URL)
  plan_svg_url        text,
  plan_width_m        real,
  plan_height_m       real,
  -- Geo anchor: lat/lng that maps to SVG pixel (0,0) top-left corner
  anchor_lat          numeric(10,8),
  anchor_lng          numeric(11,8),
  anchor_rotation_deg real          NOT NULL DEFAULT 0,
  is_published        boolean       NOT NULL DEFAULT false,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (venue_id, floor_number)
);

CREATE TRIGGER floors_set_updated_at
  BEFORE UPDATE ON public.floors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "floors_public_read"   ON public.floors FOR SELECT USING (is_published = true);
CREATE POLICY "floors_service_write" ON public.floors FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Indoor nodes (graph vertices)
-- ============================================================
CREATE TABLE public.indoor_nodes (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id            uuid    NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  venue_id            uuid    NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  floor_number        integer NOT NULL,
  node_type           text    NOT NULL DEFAULT 'path'
                        CHECK (node_type IN (
                          'path', 'junction', 'store', 'elevator',
                          'escalator', 'stairs', 'entrance', 'restroom', 'info'
                        )),
  lat                 numeric(10,8) NOT NULL,
  lng                 numeric(11,8) NOT NULL,
  -- for floor-transition nodes: the corresponding node on the adjacent floor
  connects_to_node_id uuid    REFERENCES public.indoor_nodes(id) ON DELETE SET NULL,
  -- if this node is a store entrance, link to the places table
  place_id            text    REFERENCES public.places(place_id) ON DELETE SET NULL,
  label_mn            text,
  label_en            text,
  is_accessible       boolean NOT NULL DEFAULT true,
  created_by          uuid    REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX indoor_nodes_floor_idx  ON public.indoor_nodes (floor_id);
CREATE INDEX indoor_nodes_venue_idx  ON public.indoor_nodes (venue_id);
CREATE INDEX indoor_nodes_place_idx  ON public.indoor_nodes (place_id) WHERE place_id IS NOT NULL;
CREATE INDEX indoor_nodes_type_idx   ON public.indoor_nodes (node_type);

ALTER TABLE public.indoor_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "indoor_nodes_public_read"   ON public.indoor_nodes FOR SELECT USING (true);
CREATE POLICY "indoor_nodes_mapper_insert" ON public.indoor_nodes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- Indoor edges (graph edges)
-- ============================================================
CREATE TABLE public.indoor_edges (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id       uuid    NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  from_node_id   uuid    NOT NULL REFERENCES public.indoor_nodes(id) ON DELETE CASCADE,
  to_node_id     uuid    NOT NULL REFERENCES public.indoor_nodes(id) ON DELETE CASCADE,
  bidirectional  boolean NOT NULL DEFAULT true,
  distance_m     real    NOT NULL,
  is_accessible  boolean NOT NULL DEFAULT true,
  created_by     uuid    REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_loop CHECK (from_node_id <> to_node_id)
);

CREATE INDEX indoor_edges_from_idx  ON public.indoor_edges (from_node_id);
CREATE INDEX indoor_edges_to_idx    ON public.indoor_edges (to_node_id);
CREATE INDEX indoor_edges_venue_idx ON public.indoor_edges (venue_id);

ALTER TABLE public.indoor_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "indoor_edges_public_read"   ON public.indoor_edges FOR SELECT USING (true);
CREATE POLICY "indoor_edges_mapper_insert" ON public.indoor_edges FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- Venue mappers (student mapper program)
-- ============================================================
CREATE TABLE public.venue_mappers (
  id               uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id         uuid  NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  status           text  NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'active', 'suspended')),
  nodes_submitted  integer NOT NULL DEFAULT 0,
  edges_submitted  integer NOT NULL DEFAULT 0,
  floors_submitted integer NOT NULL DEFAULT 0,
  total_mnt_earned integer NOT NULL DEFAULT 0,
  -- QA score 0.0–1.0 updated by retrospective trip-success analysis
  qa_score         real,
  approved_by      uuid  REFERENCES auth.users(id),
  approved_at      timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id)
);

CREATE TRIGGER venue_mappers_set_updated_at
  BEFORE UPDATE ON public.venue_mappers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.venue_mappers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_mappers_read_own" ON public.venue_mappers FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "venue_mappers_service_write" ON public.venue_mappers FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Mapping sessions (one session = one mapper floor visit)
-- ============================================================
CREATE TABLE public.mapping_sessions (
  id             uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  mapper_id      uuid  NOT NULL REFERENCES public.venue_mappers(id) ON DELETE CASCADE,
  venue_id       uuid  NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  floor_number   integer NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  nodes_added    integer NOT NULL DEFAULT 0,
  edges_added    integer NOT NULL DEFAULT 0,
  status         text  NOT NULL DEFAULT 'in_progress'
                   CHECK (status IN ('in_progress', 'submitted', 'approved', 'rejected')),
  reviewer_notes text,
  reviewed_by    uuid  REFERENCES auth.users(id),
  reviewed_at    timestamptz,
  reward_mnt     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mapping_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mapping_sessions_read_own" ON public.mapping_sessions FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.venue_mappers WHERE id = mapper_id
    )
  );
CREATE POLICY "mapping_sessions_insert_own" ON public.mapping_sessions FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM public.venue_mappers WHERE id = mapper_id
    )
  );
CREATE POLICY "mapping_sessions_service_write" ON public.mapping_sessions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
