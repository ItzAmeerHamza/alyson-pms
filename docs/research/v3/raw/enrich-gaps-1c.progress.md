# enrich-gaps-1c progress

Status: COMPLETE. All 45 input companies have a record in `enrich-gaps-1c.json`.

How it was built: per-company updates are in `enrich-gaps-1c.work/u00..u06.json`, keyed by input
index. `build.py` merges them over the input and writes the output; `stats.py` counts the gains;
`scan.py` pulls mailto/tel/LinkedIn links out of company pages.

Constraint hit: the session WebSearch budget (2000) ran out at company 6 (Dietitians On Demand).
From there on, only company websites, their JS bundles and Companies House were fetched directly.
No other search engine was used. As a result, most personal LinkedIn URLs that needed a search
are still blank.

Sites that blocked fetches: dietitiansondemand.com, douglasacademy.ca, hireremoteraven.com (partial),
trainingresourcesgroup.com.au, executivemosaic.com, agi.net, partsasap.com, echo.com (leadership pages),
shipsticks.com (bot-check), gurukrupaexport.in (522).

Sites that look dead or changed: siliconvalleycommerce.com shows a Wix 'not connected' 404;
upugo.com redirects to nmg.group, which refuses connections (Companies House still shows upUgo Ltd active).

Left to do with a fresh search budget: personal LinkedIn URLs for indices 7, 9-11, 13-16, 19, 23-25,
29, 32, 34-35, 39-41, 43-44. Also the Dietitians On Demand phone, email and company LinkedIn; the
Executive Mosaic, Preferred Rate and Ship Sticks company LinkedIn pages; TRG phone and email; the
AGI email; and confirming the Silicon Valley Commerce business is still alive.
