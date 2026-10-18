const fs = require('fs');
const path = require('path');

describe('main process DNS setup', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

  // nslookup prints the DNS server's own address first, so parsing its output
  // resolved every failed host to 1.1.1.1 and sent API traffic to Cloudflare.
  it('does not replace dns.lookup', () => {
    expect(source).not.toMatch(/dns\.lookup\s*=/);
  });

  it('does not shell out to nslookup', () => {
    expect(source).not.toMatch(/nslookup/);
  });

  it('shows why parsing nslookup output picks the wrong address', () => {
    const nslookupOutput = [
      'Server:\t\t1.1.1.1',
      'Address:\t1.1.1.1#53',
      '',
      'Non-authoritative answer:',
      'Name:\tapi.example.com',
      'Address: 203.0.113.10',
    ].join('\n');
    expect(nslookupOutput.match(/Address:\s*(\d+\.\d+\.\d+\.\d+)/)[1]).toBe('1.1.1.1');
  });
});
