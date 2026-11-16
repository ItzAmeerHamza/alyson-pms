# reval-theirstack-core-2 progress

Input: v3/batches/theirstack-core-2.json (65 rows, indices 0-64).
Single worker (no sub-agents). Output raw/reval-theirstack-core-2.json (65 records, one per row; field input_index = batch row).

## Status: COMPLETE (all 65 rows)
Counts: CURRENT 6, PROBABLE 3, POSSIBLE 51, DO_NOT_TARGET 5.
Non-DNT records with: decision maker 22, personal LinkedIn 8, phone 19, email 12.

CURRENT/PROBABLE: 0 RSMCo (ActivTrak), 15 Silverlight Research (Time Doctor, PROBABLE), 29 Appetiser Apps (DeskTime, PROBABLE),
53 Firstsource (ProHance), 54 GD Mission Systems (Teramind), 55 Handshake (Hubstaff), 56 JLL (ProHance), 60 R1 RCM (ProHance),
61 Standard Chartered (ProHance, PROBABLE).
DNT: 28 Aathvan (unidentifiable), 49 Admin (generic), 58 Mayo Clinic (ProHance = contrast drug), 62 Sun Pharma (Prohance = own brand), 64 Teramind (vendor).

Domain fixes: 29 Appetiser -> appetiser.com.au; 53 -> firstsource.com; 56 -> jll.com; 59 -> nttdata.com; others found where missing.
Notes: TheirStack public pages show no dates or job counts. Many small-agency Hubstaff hits look like HubSpot confusion.
Likely keyword collisions are kept as POSSIBLE but flagged in notes: 35 Edwin Lim clinic, 43 Royal Australian Navy, 44 State of SC, 51 Cardinal Health.
