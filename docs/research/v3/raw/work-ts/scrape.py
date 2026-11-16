import ts, json, re, os
HERE = os.path.dirname(os.path.abspath(__file__))
SLUGS = {
 'timedoctor': 'Time Doctor', 'hubstaff': 'Hubstaff', 'toggl': 'Toggl', 'toggl-track': 'Toggl Track',
 'replicon': 'Replicon', 'teramind': 'Teramind', 'my-hours': 'My Hours', 'everhour': 'Everhour',
 'activtrak': 'ActivTrak', 'prohance': 'ProHance', 'screenshot-monitor': 'Screenshot Monitor',
 'apploye': 'Apploye', 'work-examiner': 'Work Examiner', 'trackingtime': 'TrackingTime',
 'webwork-time-tracker': 'WebWork Time Tracker', 'ekran-system': 'Ekran System', 'rescuetime': 'RescueTime',
 'veriato': 'Veriato', 'veriato-investigator': 'Veriato Investigator', 'clevercontrol': 'CleverControl',
 'kimai': 'Kimai', 'time-cop': 'Time Cop', 'hourstack': 'HourStack', 'clockodo': 'clockodo',
 'clocko-do': 'clocko:do', 'minutedock': 'MinuteDock', 'timeclick': 'TimeClick',
 'desktime': 'DeskTime', 'jibble': 'Jibble', 'sapience': 'Sapience', 'quickbooks-time': 'QuickBooks Time',
 'connecteam': 'Connecteam', 'clicktime': 'ClickTime', 'buddy-punch': 'Buddy Punch', 'hivedesk': 'HiveDesk',
 'paymo': 'Paymo', 'timesheetscom': 'Timesheets.com', 'timesheet-mobile': 'Timesheet Mobile',
 'clockshark': 'ClockShark', 'busybusy': 'busybusy', 'harvest-forecast': 'Harvest Forecast',
 'time-tracker': 'Time Tracker', 'timesheets': 'Timesheets', 'time-analytics': 'Time Analytics',
 'homebase': 'Homebase', 'workpuls': 'WorkPuls',
}
if __name__ == '__main__':
    out = {}
    for slug, vendor in SLUGS.items():
        base = 'https://theirstack.com/en/technology/' + slug
        h, c = ts.fetch(base)
        if c != 200:
            out[slug] = {'vendor': vendor, 'status': c}; continue
        rec = {'vendor': vendor, 'url': base, 'count': ts.count(h), 'slices': {}, 'companies': {}}
        pages = [(base, 'global')] + [(base + '/' + s, s) for s in ts.slices(h, slug)]
        for url, sl in pages:
            hh, cc = (h, 200) if sl == 'global' else ts.fetch(url)
            if cc != 200: continue
            rec['slices'][sl] = {'url': url, 'title': ts.title(hh), 'count': ts.count(hh)}
            for r in ts.parse(hh):
                k = r['name'].lower()
                cells = r['cells'] + [''] * 6
                if k not in rec['companies']:
                    rec['companies'][k] = {'name': r['name'], 'domain': r['domain'], 'country': cells[1],
                                           'industry': cells[2], 'employees': cells[3], 'revenue': cells[4],
                                           'techs': cells[5], 'urls': []}
                rec['companies'][k]['urls'].append(url)
        out[slug] = rec
        print(slug, rec['count'], len(rec['slices']), len(rec['companies']))
    json.dump(out, open(os.path.join(HERE, 'scraped.json'), 'w'), indent=1)
