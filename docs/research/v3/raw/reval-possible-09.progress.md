# reval-possible-09 — progress
STATUS: DONE (2026-10-07). 45/45 input rows validated.
Input: v3/batches/possible-09.json (45 companies, 1 row each: 5 Homebase, 5 Paymo, 4 Time Analytics, 31 Time Tracker).
Method: decisions in reval-possible-09.work/decisions.jsonl.txt; `python3 reval-possible-09.work/build.py` rebuilds
reval-possible-09.json. Result: POSSIBLE 32, DO_NOT_TARGET 13, no CURRENT/PROBABLE/FORMER.
Key findings:
- Homebase x5 (DACH/CN) -> DNT, name collision ('Homebase: <region>' in German field-sales ads etc.).
- Time Analytics x4 -> DNT ('real-time analytics' substring; same verdict as reval-theirstack-generic).
- TheirStack 'Time Tracker' tech has no named vendor (category Time Clock Attendance, 763 cos incl. Target).
  Proven false/irrelevant: Move One (viaRELO 'time-tracker' field), MagneticOne (owns Yaware time tracker = competitor),
  Doyenhub (lists own 'Time Tracking' product), Autovia (acquired by carwow 2024).
- No row gained real usage evidence. Best-fit prospects (still POSSIBLE): Digis, ANVI, REGRO MEDIA, FifthColor, Viamark, Sarla.
Left undone: personal LinkedIn not searched (spec: skip for POSSIBLE); no decision maker found for Evolve Interactive,
Grupo Nichos, IMPULSO BTL, MOJAM, Sarla; DOU/gruponichos pages 403.
