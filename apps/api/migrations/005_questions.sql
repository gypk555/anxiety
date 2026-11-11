-- One catalogue of questions, and saved reflections.
-- See docs/superpowers/specs/2026-11-11-reflections-design.md and docs/modules/reflections.md.

-- Every question the app asks: the GAD-7 and the reflection bank, told apart by type. Not personal data, so plaintext,
-- with no user_id. packages/shared/src/questions.ts is the source of truth, and this table must equal it: a test
-- checks the seed below, and db:verify and the server's boot check compare the live table with the shared file.
CREATE TABLE app.questions (
  id           text PRIMARY KEY,
  type         text NOT NULL CHECK (type IN ('gad7', 'reflection')),
  theme        text CHECK (theme IN ('worry', 'body', 'situations', 'coping', 'connection')),
  position     smallint,
  text         text NOT NULL CHECK (length(text) BETWEEN 1 AND 200),
  answer_set   text NOT NULL CHECK (answer_set IN ('gad7_frequency', 'reflection_amount')),
  brings_help  boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true,
  added_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questions_shape CHECK (
    (type = 'gad7' AND theme IS NULL AND position BETWEEN 1 AND 7 AND answer_set = 'gad7_frequency')
    OR (type = 'reflection' AND theme IS NOT NULL AND position IS NULL AND answer_set = 'reflection_amount')
  )
);

-- Released questions never change: saved answers point here by id and must keep their meaning. The theme decides how an
-- answer reads (strain or support), and the position which GAD-7 item it answers, so both are frozen with the wording.
-- A change is a new id, with the old one set inactive, in a new migration. Retiring (active), and brings_help, may change.
CREATE FUNCTION app.questions_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'questions are never deleted: set active = false instead';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.theme IS DISTINCT FROM OLD.theme OR NEW.position IS DISTINCT FROM OLD.position
     OR NEW.text IS DISTINCT FROM OLD.text OR NEW.answer_set IS DISTINCT FROM OLD.answer_set THEN
    RAISE EXCEPTION 'released questions never change id, type, theme, position, text or answer set: add a new id instead';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER questions_immutable_row BEFORE UPDATE OR DELETE ON app.questions
  FOR EACH ROW EXECUTE FUNCTION app.questions_immutable();
CREATE TRIGGER questions_immutable_truncate BEFORE TRUNCATE ON app.questions
  FOR EACH STATEMENT EXECUTE FUNCTION app.questions_immutable();
REVOKE ALL ON FUNCTION app.questions_immutable() FROM PUBLIC;

INSERT INTO app.questions (id, type, theme, position, text, answer_set, brings_help) VALUES
  ('GAD7-1', 'gad7', NULL, 1, 'Feeling nervous, anxious or on edge', 'gad7_frequency', false),
  ('GAD7-2', 'gad7', NULL, 2, 'Not being able to stop or control worrying', 'gad7_frequency', false),
  ('GAD7-3', 'gad7', NULL, 3, 'Worrying too much about different things', 'gad7_frequency', false),
  ('GAD7-4', 'gad7', NULL, 4, 'Trouble relaxing', 'gad7_frequency', false),
  ('GAD7-5', 'gad7', NULL, 5, 'Being so restless that it is hard to sit still', 'gad7_frequency', false),
  ('GAD7-6', 'gad7', NULL, 6, 'Becoming easily annoyed or irritable', 'gad7_frequency', false),
  ('GAD7-7', 'gad7', NULL, 7, 'Feeling afraid as if something awful might happen', 'gad7_frequency', false),
  ('REF-001', 'reflection', 'worry', NULL, 'How much did you replay a conversation in your head today?', 'reflection_amount', false),
  ('REF-002', 'reflection', 'worry', NULL, 'How much did your thoughts feel like they were racing today?', 'reflection_amount', false),
  ('REF-003', 'reflection', 'worry', NULL, 'How much did you think about what others might think of you lately?', 'reflection_amount', false),
  ('REF-004', 'reflection', 'worry', NULL, 'How much did you find it hard to keep your mind on one thing today?', 'reflection_amount', false),
  ('REF-005', 'reflection', 'worry', NULL, 'How much did thoughts about the future weigh on you lately?', 'reflection_amount', false),
  ('REF-006', 'reflection', 'worry', NULL, 'How much did your head feel too full to think clearly today?', 'reflection_amount', false),
  ('REF-007', 'reflection', 'worry', NULL, 'How much did small choices feel hard for you to make today?', 'reflection_amount', false),
  ('REF-008', 'reflection', 'worry', NULL, 'How much did you blame yourself when things went wrong lately?', 'reflection_amount', false),
  ('REF-009', 'reflection', 'worry', NULL, 'How much did you doubt yourself today?', 'reflection_amount', false),
  ('REF-010', 'reflection', 'worry', NULL, 'How much did you feel hopeless about things lately?', 'reflection_amount', true),
  ('REF-011', 'reflection', 'worry', NULL, 'How much did everything feel like too much for you today?', 'reflection_amount', true),
  ('REF-012', 'reflection', 'worry', NULL, 'How much did you feel you could not cope with things today?', 'reflection_amount', true),
  ('REF-013', 'reflection', 'worry', NULL, 'How much did you put something off because thinking about it felt heavy today?', 'reflection_amount', false),
  ('REF-014', 'reflection', 'worry', NULL, 'How much did you feel you had to check things again and again lately?', 'reflection_amount', false),
  ('REF-015', 'reflection', 'worry', NULL, 'How much did you feel you had to get everything just right today?', 'reflection_amount', false),
  ('REF-016', 'reflection', 'worry', NULL, 'How much did you forget things more than usual lately?', 'reflection_amount', false),
  ('REF-017', 'reflection', 'worry', NULL, 'How much did you feel stuck in your own thoughts today?', 'reflection_amount', false),
  ('REF-018', 'reflection', 'worry', NULL, 'How much did you feel you were not good enough lately?', 'reflection_amount', false),
  ('REF-019', 'reflection', 'worry', NULL, 'How much did you feel guilty for resting or taking time for yourself lately?', 'reflection_amount', false),
  ('REF-020', 'reflection', 'worry', NULL, 'How much did you feel numb or empty inside lately?', 'reflection_amount', true),
  ('REF-021', 'reflection', 'body', NULL, 'How much did you find it hard to fall asleep lately?', 'reflection_amount', false),
  ('REF-022', 'reflection', 'body', NULL, 'How much did you wake in the night and find it hard to sleep again lately?', 'reflection_amount', false),
  ('REF-023', 'reflection', 'body', NULL, 'How much did you feel tired even after a night''s sleep lately?', 'reflection_amount', false),
  ('REF-024', 'reflection', 'body', NULL, 'How much tightness did you notice in your shoulders, neck or jaw today?', 'reflection_amount', false),
  ('REF-025', 'reflection', 'body', NULL, 'How much did you notice your heartbeat more than usual today?', 'reflection_amount', false),
  ('REF-026', 'reflection', 'body', NULL, 'How much did your breathing feel tight or shallow today?', 'reflection_amount', false),
  ('REF-027', 'reflection', 'body', NULL, 'How much did headaches bother you lately?', 'reflection_amount', false),
  ('REF-028', 'reflection', 'body', NULL, 'How much did your stomach feel upset or uneasy today?', 'reflection_amount', false),
  ('REF-029', 'reflection', 'body', NULL, 'How much did you feel less hungry than usual lately?', 'reflection_amount', false),
  ('REF-030', 'reflection', 'body', NULL, 'How much did you eat more than usual to comfort yourself lately?', 'reflection_amount', false),
  ('REF-031', 'reflection', 'body', NULL, 'How much did you notice yourself sighing or holding your breath today?', 'reflection_amount', false),
  ('REF-032', 'reflection', 'body', NULL, 'How much did your sleep times move away from your usual routine lately?', 'reflection_amount', false),
  ('REF-033', 'reflection', 'body', NULL, 'How much did you catch yourself clenching your teeth or fists today?', 'reflection_amount', false),
  ('REF-034', 'reflection', 'body', NULL, 'How much did aches and pains bother you lately?', 'reflection_amount', false),
  ('REF-035', 'reflection', 'body', NULL, 'How much did sitting for long hours leave your body stiff today?', 'reflection_amount', false),
  ('REF-036', 'reflection', 'body', NULL, 'How much did you feel low on energy today?', 'reflection_amount', false),
  ('REF-037', 'reflection', 'body', NULL, 'How much did you sleep more than you wanted to lately?', 'reflection_amount', false),
  ('REF-038', 'reflection', 'body', NULL, 'How much did screens keep you awake later than you wanted lately?', 'reflection_amount', false),
  ('REF-039', 'reflection', 'body', NULL, 'How much did you feel worn out, as if you had nothing left, lately?', 'reflection_amount', true),
  ('REF-040', 'reflection', 'body', NULL, 'How much did you find it hard to get out of bed and face the day lately?', 'reflection_amount', true),
  ('REF-041', 'reflection', 'situations', NULL, 'How much did work or study pressure weigh on you today?', 'reflection_amount', false),
  ('REF-042', 'reflection', 'situations', NULL, 'How much did deadlines or exams play on your mind lately?', 'reflection_amount', false),
  ('REF-043', 'reflection', 'situations', NULL, 'How much did things at home feel tense for you lately?', 'reflection_amount', false),
  ('REF-044', 'reflection', 'situations', NULL, 'How much did expectations from family weigh on you lately?', 'reflection_amount', false),
  ('REF-045', 'reflection', 'situations', NULL, 'How much did money troubles play on your mind lately?', 'reflection_amount', false),
  ('REF-046', 'reflection', 'situations', NULL, 'How much did your own health play on your mind lately?', 'reflection_amount', false),
  ('REF-047', 'reflection', 'situations', NULL, 'How much did the health of someone close to you weigh on you lately?', 'reflection_amount', false),
  ('REF-048', 'reflection', 'situations', NULL, 'How much did the news or social media unsettle you today?', 'reflection_amount', false),
  ('REF-049', 'reflection', 'situations', NULL, 'How much did crowded or busy places feel hard for you lately?', 'reflection_amount', false),
  ('REF-050', 'reflection', 'situations', NULL, 'How much did meeting new people feel hard for you lately?', 'reflection_amount', false),
  ('REF-051', 'reflection', 'situations', NULL, 'How much did speaking up in a group feel hard for you lately?', 'reflection_amount', false),
  ('REF-052', 'reflection', 'situations', NULL, 'How much did travel or your daily commute wear you down lately?', 'reflection_amount', false),
  ('REF-053', 'reflection', 'situations', NULL, 'How much did a disagreement with someone stay on your mind today?', 'reflection_amount', false),
  ('REF-054', 'reflection', 'situations', NULL, 'How much did you feel left out by people around you lately?', 'reflection_amount', false),
  ('REF-055', 'reflection', 'situations', NULL, 'How much did questions from relatives about your future weigh on you lately?', 'reflection_amount', false),
  ('REF-056', 'reflection', 'situations', NULL, 'How much did comparing marks, jobs or salaries weigh on you lately?', 'reflection_amount', false),
  ('REF-057', 'reflection', 'situations', NULL, 'How much did housework or caring for others leave you stretched today?', 'reflection_amount', false),
  ('REF-058', 'reflection', 'situations', NULL, 'How much did a lack of privacy or space of your own bother you lately?', 'reflection_amount', false),
  ('REF-059', 'reflection', 'situations', NULL, 'How much did you feel trapped by your situation lately?', 'reflection_amount', true),
  ('REF-060', 'reflection', 'situations', NULL, 'How much did a problem feel too big to manage on your own lately?', 'reflection_amount', true),
  ('REF-061', 'reflection', 'coping', NULL, 'How much did taking a few slow breaths help you today?', 'reflection_amount', false),
  ('REF-062', 'reflection', 'coping', NULL, 'How much did a walk or moving your body help you today?', 'reflection_amount', false),
  ('REF-063', 'reflection', 'coping', NULL, 'How much did music help you feel steadier today?', 'reflection_amount', false),
  ('REF-064', 'reflection', 'coping', NULL, 'How much did fresh air or sunlight help you today?', 'reflection_amount', false),
  ('REF-065', 'reflection', 'coping', NULL, 'How much were you able to take short breaks when you needed them today?', 'reflection_amount', false),
  ('REF-066', 'reflection', 'coping', NULL, 'How much did prayer, meditation or quiet time help you lately?', 'reflection_amount', false),
  ('REF-067', 'reflection', 'coping', NULL, 'How much did writing down your thoughts help you lately?', 'reflection_amount', false),
  ('REF-068', 'reflection', 'coping', NULL, 'How much did finishing one small task help you feel settled today?', 'reflection_amount', false),
  ('REF-069', 'reflection', 'coping', NULL, 'How much were you able to be kind to yourself today?', 'reflection_amount', false),
  ('REF-070', 'reflection', 'coping', NULL, 'How much did a hobby or something you enjoy lift you today?', 'reflection_amount', false),
  ('REF-071', 'reflection', 'coping', NULL, 'How much did keeping a regular sleep time help you lately?', 'reflection_amount', false),
  ('REF-072', 'reflection', 'coping', NULL, 'How much did a warm drink or a proper meal help you feel steady today?', 'reflection_amount', false),
  ('REF-073', 'reflection', 'coping', NULL, 'How much were you able to notice a thought and let it pass today?', 'reflection_amount', false),
  ('REF-074', 'reflection', 'coping', NULL, 'How much did breaking a big job into small steps help you lately?', 'reflection_amount', false),
  ('REF-075', 'reflection', 'coping', NULL, 'How much did a break from the news or your phone help you lately?', 'reflection_amount', false),
  ('REF-076', 'reflection', 'coping', NULL, 'How much were you able to say no to something that was too much lately?', 'reflection_amount', false),
  ('REF-077', 'reflection', 'coping', NULL, 'How much did a familiar routine help you get through today?', 'reflection_amount', false),
  ('REF-078', 'reflection', 'coping', NULL, 'How much did stepping away from a hard moment help you settle today?', 'reflection_amount', false),
  ('REF-079', 'reflection', 'coping', NULL, 'How much did time with a pet, plants or nature help you lately?', 'reflection_amount', false),
  ('REF-080', 'reflection', 'coping', NULL, 'How much did remembering what you have got through before help you today?', 'reflection_amount', false),
  ('REF-081', 'reflection', 'connection', NULL, 'How much did talking to someone help you today?', 'reflection_amount', false),
  ('REF-082', 'reflection', 'connection', NULL, 'How much did you feel listened to by someone lately?', 'reflection_amount', false),
  ('REF-083', 'reflection', 'connection', NULL, 'How much did you feel you could be yourself with someone today?', 'reflection_amount', false),
  ('REF-084', 'reflection', 'connection', NULL, 'How much did a message or call from someone lift you lately?', 'reflection_amount', false),
  ('REF-085', 'reflection', 'connection', NULL, 'How much did time with family help you feel supported lately?', 'reflection_amount', false),
  ('REF-086', 'reflection', 'connection', NULL, 'How much did a friend help you feel less alone lately?', 'reflection_amount', false),
  ('REF-087', 'reflection', 'connection', NULL, 'How much did you feel there was someone you could turn to lately?', 'reflection_amount', false),
  ('REF-088', 'reflection', 'connection', NULL, 'How much did helping someone else make you feel good today?', 'reflection_amount', false),
  ('REF-089', 'reflection', 'connection', NULL, 'How much did sharing a meal or chai with someone help you today?', 'reflection_amount', false),
  ('REF-090', 'reflection', 'connection', NULL, 'How much did you feel part of a group or community lately?', 'reflection_amount', false),
  ('REF-091', 'reflection', 'connection', NULL, 'How much did a kind word from someone help you today?', 'reflection_amount', false),
  ('REF-092', 'reflection', 'connection', NULL, 'How much did you feel understood by the people around you lately?', 'reflection_amount', false),
  ('REF-093', 'reflection', 'connection', NULL, 'How much were you able to ask for help when you needed it lately?', 'reflection_amount', false),
  ('REF-094', 'reflection', 'connection', NULL, 'How much did a neighbour, colleague or classmate brighten things for you today?', 'reflection_amount', false),
  ('REF-095', 'reflection', 'connection', NULL, 'How much did you feel close to someone lately?', 'reflection_amount', false),
  ('REF-096', 'reflection', 'connection', NULL, 'How much did a place of worship or a community space help you feel at home lately?', 'reflection_amount', false),
  ('REF-097', 'reflection', 'connection', NULL, 'How much did you feel respected by the people around you lately?', 'reflection_amount', false),
  ('REF-098', 'reflection', 'connection', NULL, 'How much did talking a problem through with someone make it clearer for you today?', 'reflection_amount', false),
  ('REF-099', 'reflection', 'connection', NULL, 'How much did you feel cared for by someone today?', 'reflection_amount', false),
  ('REF-100', 'reflection', 'connection', NULL, 'How much did time with children or elders at home lift you lately?', 'reflection_amount', false);

-- One row per saved reflection. Like assessments: question ids and answers (and an optional note) are sealed together
-- in payload_ct, padded so that every row is the same size. Never question text.
CREATE TABLE app.reflections (
  id                 uuid PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  client_request_id  uuid NOT NULL,
  taken_at           timestamptz(3) NOT NULL,
  payload_ct         bytea NOT NULL,
  created_at         timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reflections_idempotency_key ON app.reflections (user_id, client_request_id);
CREATE INDEX reflections_page_idx ON app.reflections (user_id, taken_at DESC, id DESC);

-- The catalogue is read-only to the app.
ALTER TABLE app.questions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON app.questions TO anxiocare_runtime;
CREATE POLICY runtime_read ON app.questions FOR SELECT TO anxiocare_runtime USING (true);

-- A reflection is never edited, only saved or deleted.
ALTER TABLE app.reflections ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON app.reflections TO anxiocare_runtime;
CREATE POLICY runtime_all ON app.reflections TO anxiocare_runtime USING (true) WITH CHECK (true);
