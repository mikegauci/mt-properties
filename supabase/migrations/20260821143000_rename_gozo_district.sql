UPDATE localities SET district = 'Gozo' WHERE district = 'Gozo and Comino';

UPDATE localities
SET
  name_en = 'Ghajnsielem',
  name_mt = 'Għajnsielem',
  aliases = array_remove(aliases, 'Ghajnsielem and Comino')
WHERE slug = 'ghajnsielem';

UPDATE nso_transactions SET district = 'Gozo' WHERE district = 'Gozo and Comino';
