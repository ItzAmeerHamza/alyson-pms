# enrich-gaps-1g progress

- COMPLETE: all 45 input companies written to `enrich-gaps-1g.json`.
- Built from `enrich-gaps-1g.work/recs*.jsonl` by `python3 enrich-gaps-1g.work/build.py`; gains vs input from `gains.py`.
- WebSearch session budget ran out at index 13 (TGP International). After that, only WebFetch of company sites and known URLs.
- `confidence_score` here is confidence in the contact data, not in tool usage.
- Retry with search: GeBBS (site 403), ALP Consulting (site 403), Raven International Group (no domain), Befree (TLS error), Front Runner Films (TLS error), Digital Training Academy (SSL error), and personal LinkedIns for the decision makers found on sites (Brickwork, MarketsandMarkets CEO, Impekable, NMCO CEO, Viral Growth Media, SageStone, Social Revolt).
- Duplicate: the 'SL Communications' and 'SL Communication (SL Estudio)' records are the same company.
