#!/bin/sh
# One-time server setup for a fresh Debian 13 VPS (docs/RUNBOOK.md §1.1 and §3): admin user,
# Docker, firewall, fail2ban, automatic security updates, swap, Docker log rotation, the deploy
# user and /opt/site. Safe to re-run: every step checks before it changes anything.
#
# Run as root, after your admin public key is in /root/.ssh/authorized_keys. Copy it first, so
# apt / dpkg never read the rest of the script from stdin:
#   scp infra/server-setup.sh root@<host>:/root/ && ssh root@<host> sh /root/server-setup.sh
# SSH itself is hardened in a separate step (infra/server-ssh-hardening.sh), only after a login as
# the admin user has been checked, so a mistake here can never lock you out.
set -eu

ADMIN_USER="${ADMIN_USER:-ivan}"
DEPLOY_USER="deploy"
SITE_DIR="/opt/site"
SWAP_SIZE="2G"

[ "$(id -u)" -eq 0 ] || { echo "server-setup: run as root" >&2; exit 1; }
. /etc/os-release
[ "$ID" = "debian" ] || { echo "server-setup: expected Debian, got $ID" >&2; exit 1; }
[ -s /root/.ssh/authorized_keys ] || { echo "server-setup: no key in /root/.ssh/authorized_keys" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
log() { printf '\n== %s\n' "$*"; }
# Keep the provider's changed config files without asking (a question would stop the script).
apt() { apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold "$@" </dev/null; }

log "System updates and base packages"
apt update
apt upgrade
apt install --no-install-recommends \
	ca-certificates curl sudo ufw fail2ban python3-systemd unattended-upgrades \
	systemd-timesyncd openssl

log "Automatic security updates"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades

log "Time sync"
systemctl enable --now systemd-timesyncd

log "Swap ($SWAP_SIZE): headroom for ingestion (UMAP) on a 4 GB server"
if ! swapon --show=NAME --noheadings | grep -q '^/swapfile$'; then
	[ -f /swapfile ] || { fallocate -l "$SWAP_SIZE" /swapfile && chmod 600 /swapfile && mkswap /swapfile; }
	swapon /swapfile
	grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
echo 'vm.swappiness=10' >/etc/sysctl.d/90-swappiness.conf
sysctl -q --system

log "Admin user '$ADMIN_USER' (sudo without a password: it has none, SSH keys only)"
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
	adduser --disabled-password --gecos "" "$ADMIN_USER"
fi
usermod -aG sudo "$ADMIN_USER"
echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" >"/etc/sudoers.d/90-$ADMIN_USER"
chmod 440 "/etc/sudoers.d/90-$ADMIN_USER"
visudo -cq
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
install -m 600 -o "$ADMIN_USER" -g "$ADMIN_USER" /root/.ssh/authorized_keys \
	"/home/$ADMIN_USER/.ssh/authorized_keys"

log "Docker Engine from Docker's apt repository (docs.docker.com/engine/install/debian)"
install -d -m 755 /etc/docker
# Log rotation for every container: without it, json logs grow until the disk is full.
# live-restore: containers keep running while the daemon restarts (updates, a re-run of this script).
cat >/etc/docker/daemon.json.new <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
daemon_changed=0
cmp -s /etc/docker/daemon.json.new /etc/docker/daemon.json 2>/dev/null || daemon_changed=1
mv /etc/docker/daemon.json.new /etc/docker/daemon.json
if ! command -v docker >/dev/null 2>&1; then
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
	chmod a+r /etc/apt/keyrings/docker.asc
	cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $VERSION_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
	apt update
	apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
if [ "$daemon_changed" -eq 1 ]; then systemctl restart docker; fi
# The daemon listens on its Unix socket only (no -H tcp://): nothing to open in the firewall.

log "Firewall: SSH, HTTP, HTTPS (and HTTP/3) only"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
# Docker publishes only web's 80 / 443 (Compose); its own iptables rules bypass ufw, so the
# database must never get a `ports:` entry (scripts/check-infra.mjs checks it).

log "fail2ban for SSH (systemd journal: Debian 13 has no auth.log)"
cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable fail2ban
systemctl restart fail2ban

log "Deploy user '$DEPLOY_USER' and $SITE_DIR (RUNBOOK §1.1)"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
	# A real login shell: the CI key's forced command runs through it.
	adduser --disabled-password --gecos "" --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SITE_DIR"

log "Done"
docker --version
docker compose version
ufw status verbose
echo "Next: check 'ssh $ADMIN_USER@<host>' and 'sudo -n true', then run infra/server-ssh-hardening.sh."
