# reval-outreach-1 progress

Input: v3/batches/outreach-1.json (70 rows, 0-69). STATUS: COMPLETE (2026-10-05).
Final file: v3/raw/reval-outreach-1.json - 74 records, 69 companies, all 70 rows covered
(rows 65/66 InsideOutVAS merged into one record; extra records: NtoN-Clockify FORMER, Grammar-Hubstaff FORMER,
plus switch-story extras from part4).
Counts: CURRENT 34, PROBABLE 16, FORMER 13, POSSIBLE 10, DO_NOT_TARGET 1.

Sources merged by reval1_merge.py: part1 (0-5), part2 (14-23), part3 (28-34), part4 (42-50), part5 (56-64),
inline (6-13, 24-27, 35-41, 51-55, 65-69). Rebuild: `python3 v3/raw/reval1_merge.py`.
Caution flagged: cluster of 5-star CEO/COO Monitask Capterra reviews Oct-Nov 2025 (rows 9, 13, 35) may be vendor-solicited.
