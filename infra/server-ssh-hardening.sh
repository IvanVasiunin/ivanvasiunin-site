#!/bin/sh
# SSH hardening (docs/RUNBOOK.md §3): keys only, no root login, only the admin and deploy users.
# Run only after a login as the admin user and `sudo -n true` have been checked:
#   scp infra/server-ssh-hardening.sh ivan@<host>: && ssh ivan@<host> sudo sh server-ssh-hardening.sh
# Keep a second session as ivan open until a fresh login works.
# The running session is kept; if the new config does not validate, nothing is changed.
set -eu

ADMIN_USER="${ADMIN_USER:-ivan}"
CONF=/etc/ssh/sshd_config.d/10-hardening.conf

[ "$(id -u)" -eq 0 ] || { echo "ssh-hardening: run with sudo" >&2; exit 1; }
[ -s "/home/$ADMIN_USER/.ssh/authorized_keys" ] || {
	echo "ssh-hardening: $ADMIN_USER has no authorized key; refusing (you would be locked out)" >&2
	exit 1
}
# Run through the admin's own sudo (not root's shell), so a working sudo is proven before root is
# locked.
[ "${SUDO_USER:-}" = "$ADMIN_USER" ] || {
	echo "ssh-hardening: run it as $ADMIN_USER with sudo, after logging in with the admin key" >&2
	exit 1
}

# sshd uses the first value it reads for each option, and Debian's sshd_config includes
# sshd_config.d/*.conf at its top, so these win over the defaults below them.
cat >"$CONF.new" <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers $ADMIN_USER deploy
X11Forwarding no
MaxAuthTries 6
EOF

mv "$CONF.new" "$CONF"
if ! sshd -t; then
	rm -f "$CONF"
	echo "ssh-hardening: the new config does not validate; removed it, nothing changed" >&2
	exit 1
fi
systemctl reload ssh
# The root password from the provider's e-mail is useless now, but lock it anyway.
passwd -l root >/dev/null
echo "ssh-hardening: done (sshd -T excerpt below)"
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|allowusers) '
